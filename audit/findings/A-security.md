# Audit Area A — Security & Authorization
**Agent:** A (Security & Authorization)
**Date:** 2026-06-07
**Repo:** `/Users/skylarwebber/Margaret-Edmondson`

---

## Route Authorization Matrix

> All 73 `src/app/api/admin/**` routes confirmed to call `requireAdmin()`. Non-admin routes listed below.

| Route | Method(s) | Auth Mechanism | Notes |
|---|---|---|---|
| `/api/checkout` | POST | None (public-intended) | No rate limit — FLAG |
| `/api/cart/track` | POST | None (public) | rateLimit 60/min ✓ |
| `/api/cart/shipping-quote` | POST | None (public) | No rate limit — FLAG |
| `/api/commissions` | POST | None (public) | rateLimit 5/min ✓ |
| `/api/contact` | POST | None (public) | rateLimit 5/min ✓ |
| `/api/classes/[slug]/signup` | POST | None (public) | rateLimit 5/min ✓ |
| `/api/classes/[slug]/checkout` | POST | None (public) | rateLimit 5/min ✓ |
| `/api/courses/[id]/enroll` | POST | `auth.getUser()` required | No rate limit — FLAG |
| `/api/discounts/validate` | POST | None (public) | rateLimit 20/min ✓ |
| `/api/fulfillment/submit` | POST | `x-cron-secret` header | OK (internal only) |
| `/api/fulfillment/retry/[itemId]` | POST | `x-cron-secret` header | OK (internal only) |
| `/api/fulfillment/status/[orderId]` | GET | **NONE** | Leaks order email + tracking — CRITICAL |
| `/api/funnels/[id]/track` | POST | None (public) | rateLimit 60/min ✓ |
| `/api/gate` | POST | None (public) | No rate limit — FLAG |
| `/api/lessons/[id]/progress` | PATCH | `auth.getUser()` required | No rate limit |
| `/api/lessons/[id]/comments` | GET/POST | GET: none; POST: auth.getUser() | GET public — intentional |
| `/api/newsletter/subscribe` | POST | None (public) | rateLimit 3/min ✓ |
| `/api/pixel/event` | POST | None (public) | rateLimit 60/min ✓ |
| `/api/unsubscribe` | GET/POST | HMAC token in query param ✓ | OK |
| `/api/gate` | POST | None (public) | No rate limit — FLAG |
| `/api/webhooks/stripe` | POST | Stripe signature ✓ | anon client bug (A-2) |
| `/api/webhooks/lumaprints` | POST | HMAC sha256 ✓ | anon client — writes may fail |
| `/api/webhooks/printful` | POST | HMAC sha256 ✓ | anon client — writes may fail |
| `/api/webhooks/shipstation` | POST | Secret in query param ✓ | anon client — writes may fail |
| `/api/webhooks/resend` | POST | **TODO — no signature verification** | FLAG (A-11) |
| `/api/cron/abandoned-cart` | GET | `Authorization: Bearer CRON_SECRET` ✓ | OK |
| `/api/cron/email-automations` | GET | `Authorization: Bearer CRON_SECRET` ✓ | OK |
| `/api/cron/email-campaigns-send` | GET | `Authorization: Bearer CRON_SECRET` ✓ | OK |
| `/api/cron/meta-event-sync` | GET | `Authorization: Bearer CRON_SECRET` ✓ | OK |

---

## Findings

### A-1: No root `middleware.ts` — admin and account routes completely unguarded at the edge
- **Severity:** Critical
- **Type:** security
- **Evidence:** `src/lib/supabase/middleware.ts` exists and contains full auth + role-check logic for `/admin` and `/account`, but there is no `middleware.ts` at the project root (`/middleware.ts`) and no `src/middleware.ts`. Next.js will never invoke `updateSession`. Confirmed: `ls /middleware.ts` and `ls src/middleware.ts` both 404.
- **Impact:** (a) Session cookies are never refreshed at the edge — sessions expire silently and users are not redirected. (b) The `updateSession` guard that redirects unauthenticated users away from `/admin` never runs, leaving all 34 admin page server components exposed to unauthenticated requests. (c) The magic-link `?code=` → `/auth/callback` redirect on the root path never runs. The only actual guards are the per-API-route `requireAdmin()` calls and — inconsistently — page-level `getUser` checks in a minority of page.tsx files.
- **Fix:** Create `/Users/skylarwebber/Margaret-Edmondson/src/middleware.ts` (Next.js looks for `src/middleware.ts` when `src/` directory exists):
  ```ts
  import { updateSession } from '@/lib/supabase/middleware'
  import type { NextRequest } from 'next/server'
  export async function middleware(request: NextRequest) {
    return updateSession(request)
  }
  export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
  }
  ```

---

### A-2: All 34 admin page server components serve HTML to unauthenticated visitors
- **Severity:** Critical
- **Type:** security
- **Evidence:** `src/app/(admin)/layout.tsx:45` — `AdminLayout` renders children with zero auth check. Of 36 admin `page.tsx` files, 34 call neither `getUser`, `redirect`, nor `requireAdmin`. Examples: `src/app/(admin)/admin/page.tsx` (dashboard), `src/app/(admin)/admin/customers/page.tsx`, `src/app/(admin)/admin/commissions/page.tsx`, `src/app/(admin)/admin/settings/page.tsx`, `src/app/(admin)/admin/products/page.tsx`, `src/app/(admin)/admin/orders/page.tsx`, `src/app/(admin)/admin/blog/page.tsx` (28 more).
- **Impact:** Any unauthenticated visitor who navigates to `/admin` receives the full React-rendered HTML of the dashboard, customer list, commission inbox, order list, blog editor, etc. Data returned by Supabase queries is RLS-gated (so sensitive rows may be empty for anon), but the admin UI chrome, navigation, and any non-DB content renders unconditionally. Pages like `admin/customers` call `createClient()` and query `crm_contacts` — RLS prevents data return for anon, but the page still renders the admin shell.
- **Fix:** Once `middleware.ts` (A-1) is in place, all `/admin` routes receive the role-check redirect. Additionally add a shared auth-guard helper and call it in `src/app/(admin)/layout.tsx` as a belt-and-suspenders:
  ```ts
  // In AdminLayout (server component):
  import { createClient } from '@/lib/supabase/server'
  import { redirect } from 'next/navigation'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/admin')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin','artist'].includes(profile.role)) redirect('/')
  ```

---

### A-3: Stripe webhook uses anon Supabase client — all paid-order writes silently fail
- **Severity:** Critical
- **Type:** bug (security + broken functionality)
- **Evidence:** `src/app/api/webhooks/stripe/route.ts:43` — `const supabase = await createClient()`. In a webhook handler there are no cookies; `createClient()` creates an anon session. All subsequent writes (`orders`, `order_items`, `webhook_logs`, `class_bookings`, `enrollments`) are blocked by RLS policies requiring `is_admin_or_artist()`. Corroborated by 0-row counts on all those tables. Same bug affects `lumaprints/route.ts`, `printful/route.ts`, `shipstation/route.ts` for their `webhook_logs` inserts and `order_items` updates — those updates silently fail with RLS denial.
- **Impact:** Every Stripe payment is charged but no order is created, no fulfillment is queued, no confirmation email is sent. Class bookings remain unpaid. Course enrollments are never granted. The site cannot fulfill a single order in its current state.
- **Fix:** Replace `createClient()` with `createServiceClient()` in all four webhook routes. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel env (currently documented as "not set" in CLAUDE.md — verify). Add idempotency by checking `webhook_logs` for the Stripe `event.id` before processing:
  ```ts
  // src/app/api/webhooks/stripe/route.ts:43
  const supabase = await createServiceClient()  // was: createClient()
  // Add before switch():
  const { data: existing } = await supabase
    .from('webhook_logs')
    .select('id')
    .eq('source', 'stripe')
    .eq('stripe_event_id', event.id)
    .maybeSingle()
  if (existing) return Response.json({ received: true, duplicate: true })
  ```

---

### A-4: `GET /api/fulfillment/status/[orderId]` — unauthenticated order data leak
- **Severity:** High
- **Type:** security
- **Evidence:** `src/app/api/fulfillment/status/[orderId]/route.ts:4` — `export async function GET(...)` — no auth check whatsoever. Returns `order.email`, fulfillment status, tracking numbers, carrier, and full item list for any valid UUID.
- **Impact:** Any attacker who guesses or enumerates a UUID-v4 order ID can retrieve the buyer's email address, shipping carrier, and tracking number. Since order UUIDs appear in Stripe metadata and potentially in URL parameters client-side, the attack surface is non-trivial.
- **Fix:** Add auth gate: either `requireAdmin()` for admin-only use, or verify the requester's session email matches `order.email` for customer self-service:
  ```ts
  // Option A — admin-only internal endpoint:
  import { requireAdmin } from '@/lib/auth/require-admin'
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  // Option B — customer self-service: verify session user's email matches order.email before returning
  ```

---

### A-5: 34 admin page server components lack auth guard (detail of A-2 — no middleware)
- **Severity:** Critical (part of A-1/A-2 cluster)
- **Type:** security
- **Evidence:** Complete list from grep: `admin/page.tsx`, `admin/blog/page.tsx`, `admin/blog/[id]/page.tsx`, `admin/blog/new/page.tsx`, `admin/classes/page.tsx`, `admin/classes/[id]/page.tsx`, `admin/classes/[id]/bookings/page.tsx`, `admin/classes/new/page.tsx`, `admin/commissions/page.tsx`, `admin/commissions/[id]/page.tsx`, `admin/content/page.tsx`, `admin/customers/page.tsx`, `admin/email/page.tsx`, `admin/email/campaigns/[id]/page.tsx`, `admin/email/campaigns/new/page.tsx`, `admin/email/lists/page.tsx`, `admin/faq-testimonials/page.tsx`, `admin/files/page.tsx`, `admin/funnels/page.tsx`, `admin/funnels/[id]/page.tsx`, `admin/funnels/new/page.tsx`, `admin/media/page.tsx`, `admin/orders/page.tsx`, `admin/orders/[id]/page.tsx`, `admin/pages/page.tsx`, `admin/pages/[id]/page.tsx`, `admin/pages/new/page.tsx`, `admin/products/page.tsx`, `admin/products/[id]/edit/page.tsx`, `admin/products/new/page.tsx`, `admin/settings/page.tsx`, `admin/subscribers/page.tsx`, `admin/testimonials/page.tsx`, `admin/workspace/page.tsx`.
- **Impact:** See A-2.
- **Fix:** See A-1 + A-2. After middleware is in place, belt-and-suspenders per-layout check in `(admin)/layout.tsx` covers all children automatically without touching 34 files.

---

### A-6: Resend webhook — signature verification stubbed out with TODO comment
- **Severity:** High
- **Type:** security
- **Evidence:** `src/app/api/webhooks/resend/route.ts:33-36` — `// We leave the Svix-style verification as a TODO so the route still accepts events when configured pending a small svix dependency.` The route only checks whether `RESEND_WEBHOOK_SECRET` is *set* in prod (returns 503 if absent), but never verifies the actual Svix signature against the secret.
- **Impact:** Any attacker who knows the endpoint URL can POST spoofed Resend events (bounce, complaint, unsubscribe) and corrupt CRM contact statuses, trigger bulk unsubscribes, or mark contacts as bounced/complained. Since the `/api/unsubscribe` endpoint is public, an attacker could enumerate contact IDs from unsubscribe tokens and craft targeted fake bounce events.
- **Fix:** Install `svix` package and verify the signature before parsing the body:
  ```ts
  import { Webhook } from 'svix'
  const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!)
  try {
    wh.verify(raw, {
      'svix-id': request.headers.get('svix-id') ?? '',
      'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
      'svix-signature': request.headers.get('svix-signature') ?? '',
    })
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }
  ```

---

### A-7: `record_order_for_contact` callable by `anon` — promo usage inflation attack
- **Severity:** High
- **Type:** security
- **Evidence:** `supabase/migrations/20260522_crm_anon_rpcs.sql:119-120` — `grant execute on function public.record_order_for_contact(...) to anon, authenticated;`. The function accepts arbitrary `p_email`, `p_promo_code_id`, `p_amount_off_cents`, `p_order_id` and unconditionally increments `promo_codes.usage_count` and inserts `promo_code_redemptions`.
- **Impact:** Any anonymous caller can POST to Supabase's `/rest/v1/rpc/record_order_for_contact` with a valid promo code UUID and any email address, burning through a promo code's `usage_limit`, inflating `usage_count`, and creating fake `promo_code_redemptions` rows. A `single_use_per_contact` code can be permanently locked for a real customer by pre-registering their email. UUIDs for promo codes are not hard to guess if an attacker observes checkout traffic.
- **Fix:** Restrict to `service_role` only (the Stripe webhook — which should use `createServiceClient()` after A-3 is fixed — is the only legitimate caller):
  ```sql
  -- idempotent
  REVOKE EXECUTE ON FUNCTION public.record_order_for_contact(text, numeric, uuid, integer, uuid) FROM anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.record_order_for_contact(text, numeric, uuid, integer, uuid) TO service_role;
  ```

---

### A-8: `rls_auto_enable()` — event-trigger function executable by `anon`/`authenticated`
- **Severity:** High
- **Type:** security
- **Evidence:** Per Supabase security advisor output in shared reference: `rls_auto_enable` is a SECURITY DEFINER function with EXECUTE granted to anon/authenticated. This is a DDL event-trigger function; it should never be RPC-callable.
- **Impact:** While the function itself creates `ENABLE ROW LEVEL SECURITY` DDL, calling it via RPC by an unprivileged user could cause unexpected DDL execution depending on Postgres version and the function's search_path. Even if currently harmless, it represents an overly-broad privilege that violates least-privilege and should be locked down.
- **Fix:**
  ```sql
  REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
  -- No grant to add — this is only triggered by DDL events, not RPC calls.
  ```

---

### A-9: Missing `handle_new_user` trigger — new signups have no profile row
- **Severity:** High
- **Type:** bug (security consequence)
- **Evidence:** Exhaustive grep across all migration files in `supabase/migrations/` finds zero references to `handle_new_user`, `on_auth_user_created`, or any `TRIGGER` on `auth.users`. The `profiles` table has no INSERT RLS policy (reference doc confirms: "no INSERT policy → profile rows must be created by an auth.users trigger. No such trigger found"). Only 1 profile row exists (the owner).
- **Impact:** Every new user signup creates an `auth.users` row but no corresponding `profiles` row. `requireAdmin()` queries `profiles.role` and returns 403 (treated as forbidden) when the profile is missing — meaning a newly-signed-up admin would be locked out. The `/account` page queries `profiles` and silently shows no data. RLS policies that call `is_admin_or_artist()` check `profiles.role`, so a user without a profile row cannot perform any authenticated operation protected by that function.
- **Fix:** Add the standard Supabase profile-provisioning trigger. Apply as a new migration:
  ```sql
  -- supabase/migrations/20260608_handle_new_user_trigger.sql
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      NEW.raw_user_meta_data->>'avatar_url',
      'customer'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  ```

---

### A-10: Missing Content-Security-Policy header
- **Severity:** High
- **Type:** security
- **Evidence:** `next.config.ts:4-16` — `SECURITY_HEADERS` array contains 7 headers but no `Content-Security-Policy`. The reference doc confirms this as a known gap.
- **Impact:** No XSS mitigation at the HTTP layer. The app uses TipTap (rich text), user-supplied HTML in page builder, and DOMPurify client-side — but a CSP is the defence-in-depth layer that limits damage if sanitisation is bypassed.
- **Fix:** Add to `SECURITY_HEADERS` in `next.config.ts`:
  ```ts
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js inline scripts (required)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://connect.facebook.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co https://www.facebook.com",
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://www.facebook.com https://*.resend.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
  ```
  Note: `'unsafe-inline'` on scripts is required for Next.js 16 App Router until nonce-based CSP is configured. Use `Report-Only` first to audit violations before enforcing.

---

### A-11: No rate limiting on `POST /api/checkout` — Stripe session spam / promo enumeration
- **Severity:** High
- **Type:** security
- **Evidence:** `src/app/api/checkout/route.ts` — zero calls to `rateLimit` or `rateLimitResponse`. `grep -c "rateLimit" checkout/route.ts` returns 0. Every other public mutating route (commissions, contact, newsletter, class-signup) has rate limiting.
- **Impact:** An attacker can spam checkout sessions to enumerate valid promo codes, probe product/variant UUIDs, trigger Stripe API rate limits on the merchant account, and perform DoS against the checkout flow. Stripe charges per API call — excessive checkout session creation has a direct cost.
- **Fix:**
  ```ts
  // Add at top of POST handler in src/app/api/checkout/route.ts:
  import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
  const rl = rateLimit(request, { limit: 10, windowMs: 60_000, keyPrefix: 'checkout' })
  if (!rl.ok) return rateLimitResponse(rl)
  ```

---

### A-12: No rate limiting on `POST /api/gate` — site password brute-force
- **Severity:** Medium
- **Type:** security
- **Evidence:** `src/app/api/gate/route.ts:14` — `export async function POST(req: NextRequest)` — no rate limit import or call. The gate accepts an unlimited number of password attempts.
- **Impact:** The gate password (`SITE_PASSWORD`) can be brute-forced with no throttling. The SHA-256 token comparison (`sha256Hex(password + secret)`) is not constant-time, though timing attacks over the network are impractical.
- **Fix:**
  ```ts
  import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
  const rl = rateLimit(request, { limit: 5, windowMs: 300_000, keyPrefix: 'gate' })
  if (!rl.ok) return rateLimitResponse(rl)
  ```

---

### A-13: No rate limiting on `POST /api/cart/shipping-quote` — Lumaprints API cost amplification
- **Severity:** Medium
- **Type:** security
- **Evidence:** `src/app/api/cart/shipping-quote/route.ts:19` — no `rateLimit` call. This route calls `quoteLiveShipping()` which makes outbound API calls to Lumaprints per variant per request.
- **Impact:** An attacker can send unbounded requests with arbitrary variant IDs, generating unlimited Lumaprints API calls and incurring third-party API costs. Unlike the in-memory rate limiter caveat (per-lambda-instance), even partial per-instance limiting would be meaningful.
- **Fix:**
  ```ts
  import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, keyPrefix: 'shipping-quote' })
  if (!rl.ok) return rateLimitResponse(rl)
  ```

---

### A-14: `audit_log`, `commission_milestones`, `meta_events`, `webhook_logs` — RLS enabled, zero policies
- **Severity:** High
- **Type:** security + bug
- **Evidence:** Shared reference doc confirms: these four tables have RLS enabled but no policies, meaning only `service_role` can read or write them. `audit_log` is written by `src/lib/api/audit-log.ts:logChanges()` which uses `auth.supabase` (the cookie client from `requireAdmin()`). Since that client is not service role, all audit log writes silently fail (the function calls `console.warn` on error but doesn't throw). `commission_milestones` has no policy — admin commission detail page at `admin/commissions/[id]/page.tsx` will return 0 milestones for any commission.
- **Impact:** Audit trail is entirely non-functional. Commission milestones feature is broken for all admin operations that use the normal client. `webhook_logs` writes in all four webhook handlers use `createClient()` (anon in webhook context) — all fail silently.
- **Fix (idempotent SQL):**
  ```sql
  -- audit_log: admin read + service_role write (logChanges uses authed client)
  DROP POLICY IF EXISTS "Admins can read audit_log" ON public.audit_log;
  CREATE POLICY "Admins can read audit_log" ON public.audit_log
    FOR SELECT TO authenticated USING (is_admin_or_artist());

  DROP POLICY IF EXISTS "Admins can insert audit_log" ON public.audit_log;
  CREATE POLICY "Admins can insert audit_log" ON public.audit_log
    FOR INSERT TO authenticated WITH CHECK (is_admin_or_artist());

  -- commission_milestones: admin full access
  DROP POLICY IF EXISTS "Admins manage commission_milestones" ON public.commission_milestones;
  CREATE POLICY "Admins manage commission_milestones" ON public.commission_milestones
    FOR ALL TO authenticated USING (is_admin_or_artist()) WITH CHECK (is_admin_or_artist());

  -- meta_events: service_role only (cron reads + pixel route inserts via anon — needs service client)
  -- No policy needed; use service client in pixel/event route and cron.
  -- For admin visibility:
  DROP POLICY IF EXISTS "Admins can read meta_events" ON public.meta_events;
  CREATE POLICY "Admins can read meta_events" ON public.meta_events
    FOR SELECT TO authenticated USING (is_admin_or_artist());

  -- webhook_logs: service_role write (fix all webhook routes to use createServiceClient),
  -- admin read
  DROP POLICY IF EXISTS "Admins can read webhook_logs" ON public.webhook_logs;
  CREATE POLICY "Admins can read webhook_logs" ON public.webhook_logs
    FOR SELECT TO authenticated USING (is_admin_or_artist());
  -- INSERT handled via service_role after A-3 fix; no INSERT policy needed for authenticated.
  ```

---

### A-15: PII in public storage buckets — `commission-references` and `class-pet-photos` listable by anyone
- **Severity:** High
- **Type:** security
- **Evidence:** Shared reference confirms `commission-references` and `class-pet-photos` are public buckets with broad SELECT (list) policies. `commission-references` contains customer-uploaded reference photos/PDFs. `class-pet-photos` contains customer pet photos submitted with class bookings. Both are PII/personal data under GDPR/CCPA.
- **Impact:** Any visitor can enumerate the bucket contents and download all customer-submitted reference materials and pet photos. No authentication required.
- **Fix:**
  ```sql
  -- Make buckets private (remove public flag)
  UPDATE storage.buckets SET public = false WHERE id IN ('commission-references', 'class-pet-photos');

  -- Drop broad public SELECT policies
  DROP POLICY IF EXISTS "Public read commission-references" ON storage.objects;
  DROP POLICY IF EXISTS "Public read class-pet-photos" ON storage.objects;

  -- Add admin-only SELECT
  DROP POLICY IF EXISTS "Admins read commission-references" ON storage.objects;
  CREATE POLICY "Admins read commission-references" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'commission-references' AND is_admin_or_artist());

  DROP POLICY IF EXISTS "Admins read class-pet-photos" ON storage.objects;
  CREATE POLICY "Admins read class-pet-photos" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'class-pet-photos' AND is_admin_or_artist());
  ```
  All API routes that serve these files to customers must generate signed URLs via `supabase.storage.from(...).createSignedUrl(path, 3600)` using `createServiceClient()`.

---

### A-16: `contact_lists` readable by `anon` — list names/slugs publicly enumerable
- **Severity:** Low
- **Type:** security
- **Evidence:** Shared reference: `contact_lists` has "Anon read contact_lists USING true" policy. Table contains list names and slugs (e.g. "buyers", "newsletter", "vip-collectors").
- **Impact:** Exposes the merchant's full list taxonomy including potentially sensitive segment names. Low-severity because no contact data is exposed, only list metadata.
- **Fix:**
  ```sql
  DROP POLICY IF EXISTS "Anon read contact_lists" ON public.contact_lists;
  -- Public subscribe flow uses upsert_contact_to_list(p_list_slug) which is SECURITY DEFINER
  -- and looks up the list by slug internally — no direct table read needed by anon.
  ```

---

### A-17: Duplicate/redundant RLS policies — cleanup required
- **Severity:** Low
- **Type:** quality
- **Evidence:** Shared reference: `blog_posts` (two identical "Public can read published"), `artwork_funnels` (two identical "Public read published funnels"), `feedback_audit_log` (dup insert), `work_request_audit_log` (dup insert), `site_settings` (overlapping service_role + admin + public-read-true policies).
- **Impact:** Duplicate permissive policies are additive in Postgres — having two identical USING conditions doesn't change access but creates confusion and maintenance risk (if one is updated but not the other).
- **Fix:**
  ```sql
  -- blog_posts
  DROP POLICY IF EXISTS "Public can read published" ON public.blog_posts;
  -- Keep the remaining one (verify name with \d+ blog_posts in psql)

  -- artwork_funnels
  DROP POLICY IF EXISTS "Public read published funnels" ON public.artwork_funnels;

  -- feedback_audit_log / work_request_audit_log
  -- Identify and drop the duplicate by listing: SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('feedback_audit_log','work_request_audit_log');
  -- Then DROP POLICY IF EXISTS "<dup name>" ON public.<table>;

  -- site_settings: remove USING(true) public-read policy if you want to hide default_margin_pct
  -- (low business risk; keep if intentional)
  ```

---

### A-18: `is_admin_or_artist()` — SECURITY DEFINER callable by `anon`
- **Severity:** Low
- **Type:** security
- **Evidence:** Shared reference: `is_admin_or_artist()` is SECURITY DEFINER with execute granted to anon. While the function itself only returns a boolean (true/false based on `auth.uid()` and `profiles.role`), anon callers will always get `false` since `auth.uid()` returns null for anon sessions. The function is harmless in practice but violates least-privilege.
- **Fix:**
  ```sql
  REVOKE EXECUTE ON FUNCTION public.is_admin_or_artist() FROM anon;
  -- Keep grant to authenticated (RLS policies call it for authenticated users)
  ```

---

### A-19: Leaked password protection disabled in Supabase Auth
- **Severity:** Medium
- **Type:** security
- **Evidence:** Shared reference: "Auth: leaked-password protection disabled (enable HaveIBeenPwned check)."
- **Impact:** Users can set passwords that appear in known breach databases, making credential-stuffing attacks trivially effective.
- **Fix:** Enable in Supabase Dashboard → Authentication → Password Settings → "Check for leaked passwords" (HaveIBeenPwned integration). This is an Auth configuration setting, not a SQL migration.

---

### A-20: Rate-limit utility is in-memory per lambda instance — not production-grade for multi-region
- **Severity:** Low
- **Type:** quality
- **Evidence:** `src/lib/api/rate-limit.ts:9` — `const buckets = new Map<string, Bucket>()`. Module-level Map on Vercel = per-cold-start, per-region, per-instance. Comment in source acknowledges this.
- **Impact:** On Vercel's multi-region deployment, an attacker running 5 requests/minute from each of 10 Vercel edge regions effectively gets 50 requests/minute. Adequate deterrence for casual abuse; not suitable for strict enforcement.
- **Fix (future):** Replace Map storage with Upstash Redis via `@upstash/ratelimit`. No immediate action required unless abuse is detected. Flag as a pre-scale item.

---

### A-21: `audit_log` writes use authenticated client — will fail for RLS-gated tables after A-14 fix
- **Severity:** Medium
- **Type:** bug
- **Evidence:** `src/lib/api/audit-log.ts:logChanges()` uses the `supabase` client passed in from `requireAdmin()` (cookie-based, authenticated as the admin user). With the A-14 fix in place adding an authenticated INSERT policy on `audit_log`, this will work correctly. Without it (current state), all writes silently fail. `logChanges` is only called in `src/app/api/admin/products/[id]/route.ts:179,220` — only product edits/deletes are audited; no other admin mutations (orders, blog posts, settings) write to `audit_log`.
- **Impact:** Audit trail coverage is extremely thin even if the write succeeds — only product mutations are tracked. No audit logging for orders, commissions, settings changes, or customer data mutations.
- **Fix:** (1) Apply A-14 SQL fix. (2) Extend `logChanges` calls to other sensitive admin mutations (order status changes, commission status, promo code changes, settings updates). These are missing-feature items, not security breaks, but relevant to enterprise-grade audit requirements.

---

### A-22: `POST /api/admin/settings` — `requireAdmin()` called after `INTEGRATION_KEYS` evaluation
- **Severity:** Low
- **Type:** quality
- **Evidence:** `src/app/api/admin/settings/route.ts:14-20` — `integrations` is computed (line 14-17) before `requireAdmin()` is called (line 20). The function returns early with `auth.response` (401/403) before including `integrations` in the response, so no data leaks. However, this is a code-quality issue — `requireAdmin` should be the first call in any admin handler.
- **Impact:** No immediate security impact since the 401 return fires before data is included in any response. Minor: wastes CPU on unauthenticated requests.
- **Fix:** Move `requireAdmin()` call to the first line of the handler.

---

### A-23: `ShipStation` webhook — secret in URL query param (logged in access logs)
- **Severity:** Medium
- **Type:** security
- **Evidence:** `src/app/api/webhooks/shipstation/route.ts:9-15` — `verifyShipStationSecret` reads `parsed.searchParams.get('secret')`. The secret is in the URL: `?secret=xxx`. This matches ShipStation's documented mechanism, but query params appear in server access logs, Vercel function logs, and any reverse proxy logs.
- **Impact:** If logs are ever shared or exposed (e.g., Vercel dashboard access, log forwarding), the ShipStation webhook secret is visible in plain text. An attacker with log access can forge ShipStation webhook events to inject tracking numbers.
- **Fix:** This is ShipStation's architecture (they don't support header-based auth). Mitigation: ensure Vercel log access is restricted to owner only; rotate `SHIPSTATION_WEBHOOK_SECRET` periodically; consider IP-allowlisting ShipStation's webhook IPs at the Vercel firewall level.

---

### A-24: No `handle_new_user` trigger — `profiles` table only has 1 row despite 1 auth user
- **Severity:** High (same root as A-9, confirming evidence)
- **Type:** bug
- **Evidence:** Shared reference: `profiles(1)` row count matches 1 auth user (the owner). Every other table that should have user data has 0 rows. The 1 profile row exists because the owner was manually provisioned. No migration contains any trigger on `auth.users`.
- **Impact:** Duplicate of A-9. Combined finding — fix is the SQL trigger in A-9.

---

## RLS Remediation SQL (Consolidated, Idempotent)

```sql
-- ═══════════════════════════════════════════════════════════════════
-- ArtByME — Security Remediation SQL  (idempotent, run as superuser)
-- Apply via: supabase db push  OR  Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. LOCK rls_auto_enable to superuser/postgres only
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

-- 2. RESTRICT record_order_for_contact to service_role
REVOKE EXECUTE ON FUNCTION public.record_order_for_contact(text, numeric, uuid, integer, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_for_contact(text, numeric, uuid, integer, uuid) TO service_role;

-- 3. RESTRICT is_admin_or_artist from anon
REVOKE EXECUTE ON FUNCTION public.is_admin_or_artist() FROM anon;

-- 4. audit_log policies
DROP POLICY IF EXISTS "Admins can read audit_log" ON public.audit_log;
CREATE POLICY "Admins can read audit_log" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin_or_artist());

DROP POLICY IF EXISTS "Admins can insert audit_log" ON public.audit_log;
CREATE POLICY "Admins can insert audit_log" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_artist());

-- 5. commission_milestones policies
DROP POLICY IF EXISTS "Admins manage commission_milestones" ON public.commission_milestones;
CREATE POLICY "Admins manage commission_milestones" ON public.commission_milestones
  FOR ALL TO authenticated USING (public.is_admin_or_artist()) WITH CHECK (public.is_admin_or_artist());

-- 6. meta_events — admin read only (writes via service_role from pixel route after code fix)
DROP POLICY IF EXISTS "Admins can read meta_events" ON public.meta_events;
CREATE POLICY "Admins can read meta_events" ON public.meta_events
  FOR SELECT TO authenticated USING (public.is_admin_or_artist());

-- 7. webhook_logs — admin read (writes via service_role from webhook routes after code fix)
DROP POLICY IF EXISTS "Admins can read webhook_logs" ON public.webhook_logs;
CREATE POLICY "Admins can read webhook_logs" ON public.webhook_logs
  FOR SELECT TO authenticated USING (public.is_admin_or_artist());

-- 8. Remove anon read on contact_lists
DROP POLICY IF EXISTS "Anon read contact_lists" ON public.contact_lists;

-- 9. Make PII buckets private
UPDATE storage.buckets SET public = false WHERE id IN ('commission-references', 'class-pet-photos');
DROP POLICY IF EXISTS "Public read commission-references" ON storage.objects;
DROP POLICY IF EXISTS "Public read class-pet-photos" ON storage.objects;

DROP POLICY IF EXISTS "Admins read commission-references" ON storage.objects;
CREATE POLICY "Admins read commission-references" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'commission-references' AND public.is_admin_or_artist());

DROP POLICY IF EXISTS "Admins read class-pet-photos" ON storage.objects;
CREATE POLICY "Admins read class-pet-photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'class-pet-photos' AND public.is_admin_or_artist());

-- 10. handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. Dedupe redundant policies (manual review — find exact names first):
-- SELECT policyname, tablename, cmd FROM pg_policies
--   WHERE tablename IN ('blog_posts','artwork_funnels','feedback_audit_log','work_request_audit_log','site_settings')
-- Then DROP POLICY IF EXISTS "<dup>" ON public.<table>;

-- 12. Enable leaked-password protection:
-- Supabase Dashboard → Authentication → Password Settings → Enable "Check for leaked passwords"
-- (Not a SQL setting)
```

---

## Summary Statistics

| Severity | Count |
|---|---|
| Critical | 3 (A-1, A-2, A-3) |
| High | 8 (A-4, A-6, A-7, A-8, A-9, A-10, A-11, A-14, A-15) |
| Medium | 4 (A-12, A-13, A-19, A-23) |
| Low | 5 (A-16, A-17, A-18, A-20, A-22) |
| Informational/quality | 2 (A-21, A-24 — dupes of higher findings) |

**Total unique findings: 22** (A-24 is duplicate confirmation of A-9; A-5 is detail of A-2)
