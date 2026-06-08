# Phase 4.6 Email Engine + 4.4 Integrations Hub — Build Spec

## Overview
Complete the email automation engine (E-4: welcome + post_purchase triggers; E-8: unsubscribe token expiry; E-10: campaign_id scoping for Resend opens/clicks) and add a functional integrations hub (status + test/verify actions for Resend, Lumaprints, Stripe, Meta CAPI).

---

## Email Engine Completeness (E-4, E-8, E-10)

### E-8: Wire Welcome + Post-Purchase Automation Triggers
**Files:** `src/app/api/cron/email-automations/route.ts`

**Current:** Only `cart_abandon_nurture` (trigger_event = `cart_abandon_nurture`) is implemented. Framework exists for `welcome` and `post_purchase` but commented-out.

**Schema:** Already defined in `supabase/migrations/20260521_email_campaigns.sql`:
- `email_automations.trigger_event`: enum including `'newsletter_signup'`, `'cart_abandon_nurture'`, `'order_placed'`, `'class_enrolled'`
- `email_automation_steps` has all fields (subject, content_html, preheader, promo_percent_off, promo_expires_in_hours)

**Tasks:**

1. **Welcome trigger (trigger_event = 'newsletter_signup')**
   - Fire when: A new `crm_contacts` row is added to the `'newsletter'` contact list via `upsert_contact_to_list` RPC
   - Implementation: In the cron, add a branch that:
     - Queries `contact_list_members` where `list_id = (SELECT id FROM contact_lists WHERE slug='newsletter')` and `created_at >= now() - interval '30 minutes'` (to avoid re-sending on replay)
     - Joins automation steps for `slug='welcome'` (create this seed row per spec below)
     - Sends email via `renderAndSend` with `contactId` (for unsubscribe URL generation)
     - Marks sent in a new `email_automation_sends` table (see DB schema below) to prevent replays
   - Email content: Customize the template; if step has `promo_percent_off`, generate a welcome discount code and embed in body

2. **Post-purchase trigger (trigger_event = 'order_placed')**
   - Fire from two sources: (a) Stripe webhook's `checkout.session.completed` after `recordOrder()` is called, OR (b) cron polling `orders` where `created_at >= now() - interval '30 minutes'` and no `email_automation_send` row exists yet
   - Implementation:
     - In Stripe webhook (`src/app/api/webhooks/stripe/route.ts`, in `handleCheckoutCompleted`), after successful order insertion, call a helper `triggerPostPurchaseAutomation(orderId, email, supabase)` that:
       - Upserts a contact row (via `upsertContact`) for the buyer email
       - Writes a row to `email_automation_triggers` table (see DB schema) to record that this order should fire post_purchase automations
     - In the cron, query `email_automation_triggers` where `trigger_event='order_placed'` and `processed_at IS NULL`, and for each:
       - Fetch the automation steps for `slug='post-purchase'`
       - Send each step's email to the contact, respecting `delay_minutes` (send now if delay=0, else schedule)
       - Mark processed
   - Delay mechanism: Simplest approach is to store `scheduled_for = now() + (delay_minutes * interval '1 minute')` in a new `email_automation_sends_pending` table and query in the cron

3. **Seed data:**
   - Insert `email_automations` row: `(slug='welcome', name='Welcome Series', trigger_event='newsletter_signup', is_active=true)`
   - Insert `email_automations` row: `(slug='post-purchase', name='Post-Purchase Sequence', trigger_event='order_placed', is_active=true)`
   - Insert at least one `email_automation_steps` row per automation (step_order=1, subject, content_html with placeholders like `{{first_name_or_friend}}`, `{{discount_code}}`, etc.)

---

### E-3: Add Expiry to Unsubscribe HMAC Tokens
**Files:** `src/lib/email/unsubscribe.ts`, `src/lib/email/render.ts` (consumers)

**Current state:** `signUnsubscribeToken` embeds `t: Math.floor(Date.now() / 1000)` (issued-at), but `verifyUnsubscribeToken` never checks it.

**Changes:**

1. Update `verifyUnsubscribeToken`:
   ```typescript
   const MAX_AGE_SECS = 90 * 24 * 3600  // 90 days
   if (Math.floor(Date.now() / 1000) - payload.t > MAX_AGE_SECS) {
     return { ok: false, reason: 'expired' }
   }
   ```

2. Update `src/app/api/unsubscribe/route.ts` to handle `error=expired` query param and display user-friendly message.

3. Add `UNSUBSCRIBE_SECRET` to `.env.example` and remove the fallback chain (`CRON_SECRET`, `RESEND_API_KEY`):
   ```bash
   # src/lib/email/unsubscribe.ts — replace the SECRET declaration
   const SECRET = process.env.UNSUBSCRIBE_SECRET
   if (!SECRET) throw new Error('UNSUBSCRIBE_SECRET required')
   ```

---

### E-10: Filter Resend Webhook Opens/Clicks by campaign_id
**Files:** `src/app/api/webhooks/resend/route.ts`

**Current:** Updates `email_campaign_recipients` by `email_snapshot` without campaign scoping; multiple campaigns get cross-pollinated opens/clicks.

**Solution:** Use Resend's `headers` field to embed campaign and recipient IDs at send time.

1. **In `src/lib/email/send.ts` (`sendEmail` function):**
   - Add optional `campaignId` and `recipientId` to `SendEmailOptions` interface
   - Pass them through to the Resend API call's `headers` field:
     ```typescript
     headers: {
       'X-Campaign-Id': campaignId,
       'X-Recipient-Id': recipientId,
     }
     ```

2. **Callers (email campaign send, automation send):**
   - When sending a campaign email, extract recipient ID from the join table and pass both `campaignId` and `recipientId` to `renderAndSend` (update that function to accept and forward)

3. **In webhook (`src/app/api/webhooks/resend/route.ts`):**
   - Extract campaign and recipient IDs from event headers: `event.data.headers?.['X-Campaign-Id']` and `event.data.headers?.['X-Recipient-Id']`
   - Update `email_campaign_recipients` by `id` instead of `email_snapshot`:
     ```typescript
     if (recipientId) {
       await supabase
         .from('email_campaign_recipients')
         .update({ opened_at: nowIso, status: 'sent' })
         .eq('id', recipientId)
         .is('opened_at', null)
     }
     ```

---

## Database Schema

### New Tables

**`email_automation_sends`** (idempotency log for automation sends)
```sql
create table email_automation_sends (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references email_automations(id) on delete cascade,
  step_id uuid not null references email_automation_steps(id) on delete cascade,
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  email_snapshot text not null,
  sent_at timestamptz not null default now(),
  resend_message_id text,
  status text not null default 'sent' check (status in ('sent','failed','bounced','complained'))
);
create index email_automation_sends_contact_idx on email_automation_sends (contact_id, automation_id);
```

**`email_automation_triggers`** (records that an order/signup should trigger automations)
```sql
create table email_automation_triggers (
  id uuid primary key default gen_random_uuid(),
  trigger_event text not null check (trigger_event in ('newsletter_signup', 'order_placed', 'class_enrolled')),
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  related_order_id uuid references orders(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_automation_triggers_event_processed_idx on email_automation_triggers (trigger_event, processed_at);
```

### Modified Tables

**`email_automation_steps`** — add columns (if not present):
```sql
alter table email_automation_steps add column if not exists promo_code_kind text;
alter table email_automation_steps add column if not exists promo_percent_off integer;
alter table email_automation_steps add column if not exists promo_expires_in_hours integer;
```

---

## Integrations Hub (4.4)

### Overview
Enhance `/admin/settings` integrations card from read-only status dots to include per-provider test/verify actions and connected status details.

### Files to Create/Edit

**`src/app/api/admin/integrations/test/route.ts`** (NEW)
- POST endpoint accepting `{ provider: 'resend' | 'lumaprints' | 'stripe' | 'meta', action: 'test_send' | 'verify_credentials' }`
- **Resend test:**
  - Send a test email to admin address (`hello@artbyme.studio`)
  - Return `{ ok: true, messageId: '...' }` or `{ ok: false, error: '...' }`
- **Lumaprints verify:**
  - Call `GET /products` with auth headers to verify API credentials
  - Return `{ ok: true, productCount: N }` or `{ ok: false, error: 'Invalid credentials' }`
- **Stripe verify:**
  - Call `stripe.paymentMethods.list({ limit: 1 })` to verify key validity
  - Return `{ ok: true, mode: 'live' | 'test' }` or `{ ok: false, error: 'Invalid key' }`
- **Meta CAPI verify:**
  - POST a test conversion event to the pixel
  - Return `{ ok: true }` or `{ ok: false, error: '...' }`

**`src/app/(admin)/admin/settings/SettingsClient.tsx`** (EDIT)
- Enhance `IntegrationStatusSection`:
  - Fetch integration details (keys configured, connection status) from `GET /api/admin/integrations/status`
  - For each integration, render a card with:
    - Status dot + label (Configured/Not Configured) as before
    - A "Test Connection" or "Verify Credentials" button (disabled if not configured, or if already testing)
    - Loading state while testing
    - Success/error message from test result
  - Handle per-provider button labels: "Send Test Email" (Resend), "Verify API Key" (Lumaprints, Stripe, Meta)

**`src/app/api/admin/integrations/status/route.ts`** (NEW)
- GET endpoint returning detailed status for each integration:
  ```json
  {
    "integrations": [
      {
        "id": "resend",
        "label": "Resend",
        "configured": true,
        "keyEnv": "RESEND_API_KEY",
        "webhookEnv": "RESEND_WEBHOOK_SECRET",
        "webhookConfigured": false
      },
      ...
    ]
  }
  ```

### UI Changes (SettingsClient)
Replace the simple grid of status dots with:
- **Card per integration** with:
  - Status dot + name
  - "Configured" / "Not Configured" label
  - Env var name(s) displayed as `<code>` tags
  - "Test Connection" button (if configured):
    - On click: POST to `/api/admin/integrations/test`
    - Show spinner while testing
    - Display success/error message for 3 seconds
  - For Resend, also show webhook status (if webhook secret is configured)

---

## Newsletter + Post-Purchase Trigger Wiring

### Newsletter Signup (E-4a)
**Flow:** User fills form → POST `/api/newsletter/subscribe`
1. Existing: `subscribe_to_newsletter` RPC adds to `crm_contacts` + joins `newsletter` list
2. **NEW:** In the RPC or post-RPC, insert a row to `email_automation_triggers` with `trigger_event='newsletter_signup'`, `contact_id` (from RPC result)
3. Cron picks it up and sends welcome email

**Files affected:**
- `src/app/api/newsletter/subscribe/route.ts` — add trigger insert after successful RPC
- OR modify the `subscribe_to_newsletter` RPC to insert the trigger (simpler)

### Post-Purchase (E-4b)
**Flow:** Stripe webhook `checkout.session.completed` → order created
1. Existing: `handleCheckoutCompleted` inserts order + calls `sendOrderConfirmation`
2. **NEW:** After order creation, call helper to insert `email_automation_triggers` row with `trigger_event='order_placed'`, `related_order_id`, `contact_id`
3. Cron picks it up, sends post-purchase email sequence

**Files affected:**
- `src/app/api/webhooks/stripe/route.ts` — add trigger insert in `handleCheckoutCompleted`
- Create `src/lib/email/triggers.ts` with helper: `async function triggerPostPurchaseAutomation(orderId: string, email: string, supabase: SupabaseClient)`

---

## Gotchas & Verification

1. **`UNSUBSCRIBE_SECRET` must be set independently** — do NOT rely on fallback to `CRON_SECRET` or `RESEND_API_KEY`. This is critical for rotating Resend API key without breaking unsubscribe tokens.

2. **Resend webhook signature verification is already implemented** (finding E-2 is already fixed in current code — `svix` is installed and `Webhook.verify()` is called).

3. **Campaign ID header pass-through:** Verify that Resend preserves custom headers in webhook events. If headers are stripped, use `metadata` field instead (check Resend API docs).

4. **Email automation trigger table prevents replay:** The `email_automation_sends` table acts as an idempotency log. Always check it before sending; this prevents duplicate emails on cron retry.

5. **Delay handling:** For now, implement delay via a separate poll (query `email_automation_sends_pending` where `scheduled_for <= now()`). A more robust approach uses a cron job per delay bucket, but simple polling is sufficient for MVP.

6. **Existing flow:** The newsletter signup already calls `sendWelcomeSubscriber()` in the subscribe endpoint. The E-4 enhancement makes that part of the automation engine so it can be managed/disabled via the admin UI and extended to multi-step sequences.

7. **Column names verified:** 
   - `email_automations.trigger_event`, `email_automations.is_active`, `email_automations.slug`
   - `email_automation_steps.subject`, `content_html`, `preheader`, `promo_percent_off`, `promo_expires_in_hours`, `step_order`
   - `email_campaign_recipients.id`, `campaign_id`, `email_snapshot`, `opened_at`, `clicked_at`, `status`
   - `crm_contacts.id`, `email`, `status`
   - `orders.id`, `email`, `created_at`

8. **Integration tests:** When testing integrations hub, ensure buttons respect `disabled` state when keys are not configured, and verify that test actions do not modify production data (use test/sandbox APIs where available).

9. **Rate limiting:** The test endpoint should apply rate limiting to prevent abuse. Reuse the `rateLimit()` helper from `@/lib/api/rate-limit`.

---

## Implementation Order

1. **DB schema migration** — create `email_automation_triggers` and `email_automation_sends` tables
2. **Unsubscribe token expiry** (E-3) — implement and test with 90-day windows
3. **Resend webhook campaign scoping** (E-10) — add headers to send, update webhook to filter by recipient ID
4. **Welcome trigger** — implement cron branch + seed data
5. **Post-purchase trigger** — implement in Stripe webhook + cron branch + seed data
6. **Integrations hub backend** — `/api/admin/integrations/status` and `/api/admin/integrations/test` routes
7. **Integrations hub frontend** — enhance `IntegrationStatusSection` in SettingsClient
8. **End-to-end test** — verify newsletter signup triggers welcome email, order triggers post-purchase sequence, unsubscribe tokens expire after 90 days, Resend opens/clicks are campaign-scoped
