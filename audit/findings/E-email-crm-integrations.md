# Audit E — Email Marketing, CRM & Integrations
**Auditor:** Agent E | **Date:** 2026-06-07 | **Repo:** `/Users/skylarwebber/Margaret-Edmondson`

---

## Integration Status Table

| Integration | Real API calls? | Configured? (env check) | Admin connect UI? | Test button? | Key gaps |
|---|---|---|---|---|---|
| **Resend** | YES — raw fetch to `api.resend.com` | Yes (`RESEND_API_KEY`) | Read-only status dot in Settings | No test button | Webhook signature not verified (svix TODO); no retry on send failure; `RESEND_WEBHOOK_SECRET` missing from `.env.example` |
| **Lumaprints** | YES — Basic-auth to `us.api.lumaprints.com` with retry | Yes (4 vars) | Sync button + catalog read in `/admin/settings` (admin API route, no dedicated page) | Dry-run sync (`?dump=1`) | No live order-status poll; `LUMAPRINTS_STORE_ID` required for order submit but not for pricing |
| **Printful** | YES — Bearer token to `api.printful.com` | Yes (2 vars) | Status dot in Settings only | No | No admin UI, no sync endpoint; webhook exists but events are `order_created / package_shipped` only (no `package_delivered` tracking to UI) |
| **ShipStation** | YES — API-Key header to `ssapi.shipstation.com` | Yes (2 vars) | Status dot in Settings only | No | Auth uses secret-in-URL query param (logged by Vercel/nginx); no admin UI |
| **Meta CAPI** | YES — `graph.facebook.com/v19.0/{pixel}/events` | Yes (`META_CAPI_ACCESS_TOKEN`) | Status dot in Settings only | No | `access_token` exposed in URL (logged); Pixel only installed in `(marketing)` layout — not in admin or account routes |
| **Anthropic** | YES — `@anthropic-ai/sdk` real messages.create call | Yes (`ANTHROPIC_API_KEY`) | None — used inside shared-files process-ai only | N/A | `ANTHROPIC_API_KEY` missing from `.env.example` |
| **Stripe** | Covered by Agent B | Yes | Stripe mode toggle + key status in Settings | No | See Agent B findings |

---

## Findings

### E-1: Cron workers use anon client — blocked by RLS on `email_campaigns` and `email_campaign_recipients`
**Severity: CRITICAL** | **Type: Broken feature**

**Evidence:**
- `src/app/api/cron/email-campaigns-send/route.ts:9` — `import { createClient } from '@/lib/supabase/server'`
- `src/app/api/cron/email-campaigns-send/route.ts:32` — `const supabase = await createClient()`
- `src/app/api/cron/email-automations/route.ts:23` — same pattern
- `src/app/api/cron/abandoned-cart/route.ts:11,29` — same pattern
- `src/app/api/cron/meta-event-sync/route.ts:10` — same pattern
- `supabase/migrations/20260521_email_campaigns.sql:35-39` — policy `"Admins manage email_campaigns"` ... `to authenticated using (is_admin_or_artist())`

**Root cause:** `createClient()` reads cookies. A Vercel cron request carries no browser session cookies, so the Supabase client initialises as the anon role. All `email_campaigns`, `email_campaign_recipients`, and `crm_contacts` tables have `is_admin_or_artist()` policies that require `authenticated` role. The anon role gets no rows back from SELECT and all INSERT/UPDATE are rejected.

**Impact:** Every cron-driven email function silently does nothing in production:
- Campaign sends never fire (the whole campaign pipeline is broken)
- Abandoned-cart emails never send (1h/24h/72h sequence all dead)
- Cart-nurture weekly emails never send
- Meta event retry sync always gets 0 rows

**Fix:**
```typescript
// All four cron routes — swap createClient() for createServiceClient()
import { createServiceClient } from '@/lib/supabase/server'
const supabase = await createServiceClient()
```
Also verify `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel (CLAUDE.md notes it "may not be set"). This single fix unblocks all email delivery.

---

### E-2: Resend webhook signature verification is a TODO — spoofed events corrupt stats and auto-unsubscribe
**Severity: HIGH** | **Type: Security + Broken feature**

**Evidence:**
- `src/app/api/webhooks/resend/route.ts:33-36`:
```typescript
// We leave the Svix-style verification as a TODO so the route still
// accepts events when configured pending a small svix dependency.
// For now we just parse the body.
```
- `svix` is NOT in `package.json` (confirmed)
- `src/app/api/webhooks/resend/route.ts:28-30` — correctly hard-fails in production if `RESEND_WEBHOOK_SECRET` is not set, but if it IS set the route still accepts any body without verifying the signature

**Impact:** Any HTTP client that can reach `/api/webhooks/resend` can POST a spoofed `email.bounced` or `email.complained` event to unsubscribe any contact or corrupt open/click stats. With `RESEND_WEBHOOK_SECRET` unset (which is the default in dev and likely in Vercel until configured), the prod hard-fail means bounce/complaint handling never runs at all — bounced contacts stay active and will keep receiving emails, damaging deliverability.

**Fix:**
```bash
npm install svix
```
```typescript
// src/app/api/webhooks/resend/route.ts — replace the TODO block
import { Webhook } from 'svix'
const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!)
try {
  wh.verify(raw, {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  })
} catch {
  return Response.json({ error: 'Bad signature' }, { status: 400 })
}
```

---

### E-3: Unsubscribe tokens have no expiry — tokens in old emails never rotate
**Severity: HIGH** | **Type: Security**

**Evidence:**
- `src/lib/email/unsubscribe.ts:16-17` — payload includes `t: Math.floor(Date.now() / 1000)` (issued-at) but `verifyUnsubscribeToken` never checks it
- `src/lib/email/unsubscribe.ts:25-33` — verification only checks signature and payload structure, not age
- `test/unsubscribe-token.test.ts` — no test for expired tokens

**Impact:** A token signed with an old `UNSUBSCRIBE_SECRET` value (or leaked from a forwarded email chain) remains valid forever. Rotating the secret is the only revocation mechanism, but doing so immediately invalidates all outstanding tokens. Combined with the fallback chain `CRON_SECRET || RESEND_API_KEY || 'artbyme-dev-unsubscribe-secret'` in `unsubscribe.ts:6-9`, if none of the preferred vars are set the secret is a static well-known string.

**Fix:** Add a max-age check (e.g., 90 days) in `verifyUnsubscribeToken`:
```typescript
const MAX_AGE_SECS = 90 * 24 * 3600
if (Date.now() / 1000 - payload.t > MAX_AGE_SECS) return { ok: false, reason: 'expired' }
```
Also ensure `UNSUBSCRIBE_SECRET` is set independently (not falling through to `CRON_SECRET`).

---

### E-4: ShipStation webhook secret exposed as URL query parameter
**Severity: HIGH** | **Type: Security**

**Evidence:**
- `src/app/api/webhooks/shipstation/route.ts:13-16`:
```typescript
// ShipStation sends the webhook to a URL containing the secret as a query param
// e.g., /api/webhooks/shipstation?secret=xxx
const parsed = new URL(url)
return parsed.searchParams.get('secret') === secret
```

**Impact:** Query parameters appear in Vercel access logs, CDN logs, nginx logs, and browser history. The webhook secret is therefore logged in plaintext by the infrastructure. Anyone with log access can extract it and forge ShipStation events (e.g., mark orders as shipped with fake tracking). ShipStation v2 API supports HMAC-SHA256 signature headers; this endpoint should use those instead.

**Fix:** Register the ShipStation webhook to include an `X-ShipStation-Signature` header (v2 supports this) and verify HMAC server-side, removing the query-param secret. At minimum, move to a static secret header instead of a query param.

---

### E-5: Meta CAPI `access_token` passed in URL query parameter
**Severity: HIGH** | **Type: Security**

**Evidence:**
- `src/lib/meta/capi.ts:38`:
```typescript
`https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
```

**Impact:** The Meta CAPI access token — which can be used to send arbitrary conversion events and access Meta Ads data — appears in server-side HTTP logs, Vercel function logs, and any network monitoring. This is a credential leak. Meta's recommended practice is to pass the token in the `Authorization: Bearer` header.

**Fix:**
```typescript
const response = await fetch(
  `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  }
)
```

---

### E-6: `ANTHROPIC_API_KEY` missing from `.env.example`
**Severity: MEDIUM** | **Type: Configuration / DX**

**Evidence:**
- `src/app/api/admin/shared-files/process-ai/route.ts:1` — `import Anthropic from '@anthropic-ai/sdk'`
- `src/app/api/admin/shared-files/process-ai/route.ts:42` — `if (!key) throw new Error('ANTHROPIC_API_KEY is not set')`
- `.env.example` — no `ANTHROPIC_API_KEY` entry (confirmed)

**Impact:** New developers or a fresh Vercel deployment will not know this key is required. The AI testimonial extraction feature (`/admin/files` → process-ai) will fail at runtime with a cryptic throw rather than a clear config error.

**Fix:** Add to `.env.example`:
```
# === Anthropic (AI testimonial extraction) ===
ANTHROPIC_API_KEY=
```

---

### E-7: Email campaign cron uses anon client — `email_campaign_recipients` writes fail silently (duplicate of E-1 detail)
**Severity: CRITICAL** | **Type: Broken feature** *(see E-1 for primary fix)*

**Evidence:**
- `src/app/api/cron/email-campaigns-send/route.ts:118-124`:
```typescript
if (result === null && process.env.RESEND_API_KEY) {
  await supabase.from('email_campaign_recipients')
    .update({ status: 'failed', error: 'send_failed' })
    .eq('id', r.id)
  failed++
} else {
  await supabase.from('email_campaign_recipients')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', r.id)
  sent++
}
```

The logic assumes `result === null` only when Resend fails. But because the anon client cannot even SELECT `email_campaign_recipients` (RLS blocks it), `queued` is always empty, the loop never runs, and `sent`/`failed` always remain 0. Campaigns stay permanently in `sending` status.

**Fix:** Same as E-1 — use `createServiceClient()`.

---

### E-8: Email automations framework is partially complete — only `cart_abandon_nurture` implemented
**Severity: MEDIUM** | **Type: Functional gap**

**Evidence:**
- `src/app/api/cron/email-automations/route.ts:4-6`:
```typescript
// Today this handles cart_abandon_nurture: a weekly send to carts that
// completed the 1h/24h/72h sequence without converting. The framework
// is in place to add welcome series and post-purchase later by adding
// branches per trigger_event.
```
- `email_automations` table has 1 row (`cart-nurture-weekly`); `email_automation_steps` has 1 row
- No code paths handle `welcome`, `post_purchase`, `re_engagement`, or any other trigger types

**Impact:** The admin email page and automation model imply a full automation engine, but only one trigger type actually runs. The `email_automations` table has `trigger_event` and `trigger_conditions` columns that are never evaluated. A customer who buys receives no post-purchase sequence. Newsletter subscribers enrolled via RPC get the one-off welcome email from `sendWelcomeSubscriber` but no further nurture sequence.

**Fix:** Add trigger branches to the automation cron handler. Minimum additions:
1. `welcome` — fire on new `contact_list_members` join to the `newsletter` list within the last N minutes
2. `post_purchase` — fire from `record_order_for_contact` RPC result, or via the Stripe webhook

---

### E-9: CRM Customers page reads `profiles` and `orders` via anon (SSR) client without explicit auth guard
**Severity: MEDIUM** | **Type: Security**

**Evidence:**
- `src/app/(admin)/admin/customers/page.tsx:29-55`:
```typescript
const supabase = await createClient()
// ...
const { data: profiles, error: profilesError } = await profileQuery
// ...
const { data: orderStats } = await supabase.from('orders').select('email, total')
```
No `requireAdmin()` call. The page relies entirely on the `(admin)/layout.tsx` guard (which per confirmed finding #1 from the shared reference has no root middleware, so session refresh may not run).

**Impact:** If the layout guard is bypassed (e.g., a direct fetch to the RSC endpoint, or a misconfigured CDN), the page would render for unauthenticated users. The `profiles` table exposes name, email, and role for every registered user; `orders` table currently has 0 rows but will contain PII at scale.

**Fix:** Add `requireAdmin()` at the top of the page server component, matching the pattern used by every API route:
```typescript
import { requireAdmin } from '@/lib/auth/require-admin'
// In the async server component:
const auth = await requireAdmin()
if (!auth.ok) redirect('/admin/login')
const supabase = auth.supabase
```

---

### E-10: Resend webhook updates `email_campaign_recipients` by `email_snapshot` without campaign scoping — cross-campaign stat collision
**Severity: MEDIUM** | **Type: Data integrity**

**Evidence:**
- `src/app/api/webhooks/resend/route.ts:53-61`:
```typescript
if (event.type === 'email.opened') {
  await supabase
    .from('email_campaign_recipients')
    .update({ opened_at: nowIso, status: 'sent' })
    .eq('email_snapshot', toEmail.toLowerCase())
    .is('opened_at', null)
```
No `campaign_id` filter. If a contact is in multiple campaigns, the `opened_at` for the first queued/sent row matching that email is updated, regardless of which campaign the open event actually belongs to.

**Impact:** Open/click stats are attributable to the wrong campaign. Over time, earlier campaigns accumulate phantom opens from later sends. This skews analytics.

**Fix:** Resend supports a `headers` pass-through. Use it to embed the `campaign_id` and `recipient_id` when sending:
```typescript
headers: {
  'X-Campaign-Id': campaignId,
  'X-Recipient-Id': recipientId,
}
```
Then scope the webhook update: `.eq('id', recipientId)` instead of `.eq('email_snapshot', email)`.

---

### E-11: `contact_lists` table is readable by `anon` role — exposes list names and slugs
**Severity: MEDIUM** | **Type: Security / Privacy**

**Evidence (from shared reference):** `contact_lists` readable by `anon` (`Anon read contact_lists USING true`).

**Impact:** Any unauthenticated caller can enumerate all contact list names and slugs (e.g., `newsletter`, `buyers`, `vip`, `abandoned-cart`) via the Supabase REST API or the JS client. This leaks marketing strategy and segmentation data. List slugs like `buyers` also confirm the existence of a transactional customer relationship without consent.

**Fix:** Drop the anon read policy:
```sql
drop policy if exists "Anon read contact_lists" on public.contact_lists;
```
Public-facing code that needs list lookup (e.g., the subscribe RPC) uses SECURITY DEFINER functions and does not need direct anon SELECT access.

---

### E-12: `record_order_for_contact` RPC callable by anon — abuse vector for CRM inflation and promo-code redemption
**Severity: MEDIUM** | **Type: Security**

**Evidence (from shared reference):** `record_order_for_contact` is SECURITY DEFINER and executable by `anon`. It bumps `total_orders`, `total_spent_cents`, increments `promo_code_redemptions.usage_count`.

**Impact:** An unauthenticated attacker can POST to `supabase.rpc('record_order_for_contact', {...})` directly with a fabricated email and large `p_order_total` to inflate any contact's purchase history (affecting CRM segmentation, loyalty tiers) and exhaust promo-code usage limits by faking redemptions. No Stripe payment required.

**Fix:** Restrict to `service_role` only (matches the intent — it is called from the Stripe webhook which should use `createServiceClient()`):
```sql
revoke execute on function public.record_order_for_contact from anon, authenticated;
grant execute on function public.record_order_for_contact to service_role;
```

---

### E-13: Template editor is a raw `<textarea>` for HTML — no WYSIWYG, no preview, XSS risk from admin-authored scripts
**Severity: MEDIUM** | **Type: Quality + Security**

**Evidence:**
- `src/app/(admin)/admin/email/page.tsx:238-245`:
```typescript
<textarea
  value={editHtml}
  onChange={(e) => setEditHtml(e.target.value)}
  rows={10}
  className="... font-mono text-xs ..."
/>
```
No sanitization. The HTML is stored verbatim and rendered in `brandedShell()` which inserts it without escaping.

**Impact:** An admin (or compromised admin session) can inject `<script>` tags into email templates that execute in recipients' email clients that render HTML scripts (rare but possible), or more practically inject tracking pixels, external image loads, or phishing links that bypass review. There is also no live preview — the only way to see how a template looks is to send a test email.

**Fix (two-part):**
1. Add a preview iframe to the template editor that renders the `renderHtml()` output in a sandboxed frame.
2. Strip `<script>`, `<iframe>`, `on*` attributes with DOMPurify (already a project dependency — `isomorphic-dompurify`) before storing/sending template HTML.

---

### E-14: No contact import/export for `crm_contacts` — only `newsletter_subscribers` CSV is supported
**Severity: LOW** | **Type: Functional gap**

**Evidence:**
- `src/app/(admin)/admin/email/page.tsx:303-317` — `exportCsv()` downloads from `newsletter_subscribers` table, not `crm_contacts`
- No import endpoint or UI found anywhere in the codebase for bulk-adding contacts to `crm_contacts` or `contact_list_members`
- `src/app/api/admin/contact-lists/[id]/members/route.ts` — GET members only, no POST for bulk add

**Impact:** The owner cannot bulk-import a list of past buyers or event attendees into CRM contact lists. The CSV export only covers newsletter subscribers — buyers, commission clients, and class students who never subscribed to the newsletter are not exportable. This limits the utility of the segmented campaign feature.

**Fix:** Add a `POST /api/admin/contact-lists/[id]/members` endpoint accepting a CSV or JSON array of emails, running them through `upsertContact()` and adding to the list. Add a simple CSV upload UI on the list detail page.

---

### E-15: Pixel not installed in root layout — admin actions and `/account` pages generate no CAPI events
**Severity: LOW** | **Type: Analytics gap**

**Evidence:**
- `src/app/layout.tsx` — no `PixelScript` import
- `src/app/(marketing)/layout.tsx:6,15` — `PixelScript` imported and rendered only in the marketing route group
- `src/app/(admin)/layout.tsx` — no `PixelScript`

**Impact:** Admin sessions (while testing checkout, browsing shop) and `/account` page views are not tracked by Meta Pixel. More importantly, the `track()` function in `src/lib/meta/track.ts` is a client-side helper — if any important event (e.g., purchase confirmation) lives outside the marketing layout, it will silently no-op even if called.

**Fix:** Move `PixelScript` to `src/app/layout.tsx` (root), ensuring it renders for all route groups. The component already returns null when `NEXT_PUBLIC_META_PIXEL_ID` is not set, so this is safe.

---

### E-16: `unsubscribe.ts` signing secret falls back through `CRON_SECRET` and `RESEND_API_KEY`
**Severity: LOW** | **Type: Security hygiene**

**Evidence:**
- `src/lib/email/unsubscribe.ts:5-9`:
```typescript
const SECRET =
  process.env.UNSUBSCRIBE_SECRET ||
  process.env.CRON_SECRET ||
  process.env.RESEND_API_KEY ||
  'artbyme-dev-unsubscribe-secret'
```

**Impact:** If `UNSUBSCRIBE_SECRET` is not set but `RESEND_API_KEY` is, the Resend API key becomes the HMAC signing secret for unsubscribe tokens. Rotating the Resend API key (e.g., after a leak) would silently invalidate all unsubscribe tokens in outstanding emails. Conversely, anyone who learns the Resend API key (which may appear in Vercel env exports) could forge unsubscribe tokens.

**Fix:** Remove the fallback chain. Require `UNSUBSCRIBE_SECRET` explicitly:
```typescript
const SECRET = process.env.UNSUBSCRIBE_SECRET
if (!SECRET) throw new Error('UNSUBSCRIBE_SECRET env var is required')
```
Add `UNSUBSCRIBE_SECRET=` to `.env.example` with a note to generate via `openssl rand -hex 32`.

---

## Summary Counts

| Severity | Count |
|---|---|
| CRITICAL | 2 (E-1, E-7 — same root cause, one fix) |
| HIGH | 4 (E-2, E-3, E-4, E-5) |
| MEDIUM | 6 (E-6, E-8, E-9, E-10, E-11, E-12) |
| LOW | 4 (E-13, E-14, E-15, E-16) |
| **Total** | **16** |

---

## Top 15 One-Liners

1. **CRITICAL** E-1: All 4 email/cron workers use `createClient()` (anon) — blocked by `is_admin_or_artist()` RLS; zero emails ever send in prod — `src/app/api/cron/email-campaigns-send/route.ts:9,32`
2. **CRITICAL** E-7: Campaign recipients loop on an empty result set; campaigns stuck in `sending` forever — `src/app/api/cron/email-campaigns-send/route.ts:77-84`
3. **HIGH** E-2: Resend webhook signature verification is a code comment TODO; svix not installed; spoofed bounces can unsubscribe any contact — `src/app/api/webhooks/resend/route.ts:33-36`
4. **HIGH** E-3: Unsubscribe tokens have no expiry check — tokens from year-old emails remain valid forever — `src/lib/email/unsubscribe.ts:25-33`
5. **HIGH** E-4: ShipStation webhook secret is a URL query param — logged in plaintext by Vercel/nginx — `src/app/api/webhooks/shipstation/route.ts:14-16`
6. **HIGH** E-5: Meta CAPI access token passed as `?access_token=` URL param — logged by every proxy — `src/lib/meta/capi.ts:38`
7. **MEDIUM** E-9: Customers admin page uses bare `createClient()` with no `requireAdmin()` call — authz depends entirely on layout guard — `src/app/(admin)/admin/customers/page.tsx:29`
8. **MEDIUM** E-10: Resend webhook open/click updates `email_campaign_recipients` by email only (no campaign_id) — cross-campaign stat pollution — `src/app/api/webhooks/resend/route.ts:55`
9. **MEDIUM** E-11: `contact_lists` has `USING true` anon SELECT policy — all list names/slugs publicly enumerable — `supabase/migrations/20260521_crm_contacts.sql` (shared ref)
10. **MEDIUM** E-12: `record_order_for_contact` SECURITY DEFINER callable by anon — fake purchase injection and promo-code exhaustion — `src/lib/crm/contacts.ts:101`
11. **MEDIUM** E-8: Only `cart_abandon_nurture` automation trigger implemented; welcome series and post-purchase sequences are commented-out TODO — `src/app/api/cron/email-automations/route.ts:4-6`
12. **MEDIUM** E-6: `ANTHROPIC_API_KEY` not in `.env.example` — AI testimonial extraction fails silently on fresh deploys — `src/app/api/admin/shared-files/process-ai/route.ts:42`
13. **LOW** E-15: Meta Pixel (`PixelScript`) only in `(marketing)` layout — not in root layout — account and admin checkout events untracked — `src/app/(marketing)/layout.tsx:15`
14. **LOW** E-16: Unsubscribe HMAC secret falls back to `CRON_SECRET` then `RESEND_API_KEY` — secret entangled with API credentials — `src/lib/email/unsubscribe.ts:5-9`
15. **LOW** E-13: Template editor is a raw HTML textarea with no sanitization and no preview — DOMPurify already in deps but unused here — `src/app/(admin)/admin/email/page.tsx:238`

---

## Cross-Area Notes

- **Integrations connect UI:** An `IntegrationStatusSection` exists in `/admin/settings` showing Configured/Not Configured dots based on `process.env[key]` presence. This is env-only (read-only status). There are no "Test Connection" buttons for any integration. Recommend adding: (a) a Resend test-send button, (b) a Lumaprints "ping catalog" test, (c) a Meta CAPI test event POST, (d) a Printful "fetch store" ping. The Lumaprints sync button at `/api/admin/lumaprints/sync` is the closest thing to a test/connect action but it is only accessible if you know the route exists.

- **Shared root cause for all broken email sending (E-1):** Fix `createClient()` → `createServiceClient()` in all four cron routes. This single change unblocks: campaign delivery, abandoned-cart sequence, cart-nurture weekly, and Meta event retry. Verify `SUPABASE_SERVICE_ROLE_KEY` is present in Vercel (see CLAUDE.md note that it "may not be set").

- **Resend integration is functionally real** but is being used in direct-fetch mode rather than the official Resend SDK. This is fine architecturally, but the webhook verification is incomplete (E-2). Once svix is installed and signature verification added, the bounce/complaint pipeline will work correctly.

- **Lumaprints is the most complete integration** — real API calls, retry logic, catalog sync with pricing, order submit, and a full webhook handler for shipment events. The admin sync endpoint is well-built. Primary gap is no admin UI beyond the Settings page (the sync action is only triggerable via API).

- **Printful is real but unmanaged** — the lib has real API calls and the webhook handles the main lifecycle events, but there is no admin UI to browse Printful products, sync variants, or trigger test orders. It functions as a fulfillment black box.

- **Anthropic SDK is a real, well-implemented call** — model `claude-sonnet-4-6`, prompt caching via `cache_control: ephemeral`, handles both PDF (via base64 document block) and DOCX (via mammoth + JSZip). The only gap is the missing env var in `.env.example`.

- **Agent B cross-ref:** The Stripe webhook uses `createClient()` (anon) causing the same RLS failure pattern as E-1. The `record_order_for_contact` call in `src/lib/crm/contacts.ts` will also fail when called from the Stripe webhook because the webhook uses the anon client — CRM attribution from purchases is broken for the same root-cause reason.
