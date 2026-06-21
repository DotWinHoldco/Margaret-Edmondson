# Register 01 — Identity, Authorization & Ingress (ADOPT 2026-06-21)

**Auditor scope:** Phases 2 & 4 — auth core, admin surface, all `src/app/api/**` ingress.
**Repo:** `/Users/skylarwebber/Margaret-Edmondson` · **Stack:** Next 16.2 App Router, React 19, Supabase `@supabase/ssr`, Stripe, Resend.
**Method:** read-only. Mode is `src/proxy.ts` (Next 16 rename of `middleware.ts`). No `'use server'` files exist — all privileged logic is in route handlers.

## Posture summary

The identity/authorization layer is in **good shape and materially stronger than the ~Jun-8 audit (`A-security.md`) recorded.** The single largest prior risk cluster — "no middleware, all 34 admin pages and admin APIs unguarded" (A-1/A-2/A-5) — is closed: `src/proxy.ts` runs `updateSession()` which calls `supabase.auth.getUser()` (verified, not cookie-presence) and checks `profiles.role ∈ {admin, artist}` server-side for `/admin`, and **all 92 admin route files** independently call `requireAdmin()` and gate on `if (!auth.ok)`. The prior P0s A-3 (webhooks on anon client) and A-4 (unauth order-data leak at `fulfillment/status`) and the rate-limit gaps A-11/A-12 are also fixed in current code. There is **no client-trusted-role privilege-escalation surface**: no route reads role/admin from the request body or a custom header, and no route writes `profiles.role`. Account/lessons/wishlist routes are not IDOR-able — every one authenticates and scopes by `profile_id = user.id` on top of RLS. Public service-client routes (checkout, class signup, pixel, shipping-quote) re-derive all trusted values server-side and never accept client prices/fulfillment.

The one **systemic open issue** is an environment-conditional auth bypass on the 7 cron endpoints (AZ-1): they compare `Authorization` to the literal string `` `Bearer ${process.env.CRON_SECRET}` `` with **no guard for an unset `CRON_SECRET`**, so if that env var is ever missing, `Authorization: Bearer undefined` authenticates a caller to routes that mint discount codes, send bulk email, expire bookings, and publish content. The safe pattern (`!!process.env.CRON_SECRET && ...`) already exists in the codebase (`admin/revalidate`), proving this is an oversight, not a constraint. Everything else is P2/P3 defense-in-depth (non-constant-time secret compares, unbounded comment length, cart-row overwrite by UUID).

## Control matrix

| Control | Rating | Basis |
|---|---|---|
| Authentication | **Pass** | `proxy.ts`→`updateSession` uses `getUser()`; `requireAdmin()` uses `getUser()`; account/lessons routes all `getUser()` |
| Authorization (role/ownership) | **Pass** | 92/92 admin routes `requireAdmin`; account/lessons scoped by `profile_id=user.id`; no client-role trust; no `profiles.role` writes from API |
| Input validation (zod) | **Partial** | Strong on newer routes (zod schemas: class signup, account/*, discount-codes/generate); older routes (checkout, pixel, lessons, commissions POST) hand-parse `request.json()` without a schema |
| Rate limiting | **Partial** | Public mutating routes covered (checkout, gate, commissions, signup, discounts, newsletter, pixel, shipping-quote, account/*); `lessons/*` POST and `courses/*/enroll` have none; limiter is in-memory per-instance (prior A-20) |
| Service-client safety | **Pass (with 1 env caveat)** | Service client used only where RLS must be bypassed (webhooks, cron, validated checkout writes, free-enroll, signed-URL minting); callers either verify a signature/secret or re-derive trusted data. Caveat: cron secret check is unset-bypassable (AZ-1) |

---

## Findings

### AZ-1 — Cron endpoints bypassable when `CRON_SECRET` is unset (`Bearer undefined`)
- **Severity:** P1 (privilege/control bypass; conditional on a missing env var, but the blast radius is high and there is no admin fallback on these routes)
- **Evidence:** All 7 cron routes use the identical pattern with **no check that the secret is set**:
  - `src/app/api/cron/abandoned-cart/route.ts:25-28` — `if (authHeader !== \`Bearer ${process.env.CRON_SECRET}\`) return 401`
  - `src/app/api/cron/email-automations/route.ts:18-19`
  - `src/app/api/cron/email-campaigns-send/route.ts:27-28`
  - `src/app/api/cron/expire-bookings/route.ts:11-12`
  - `src/app/api/cron/meta-event-sync/route.ts:5-6`
  - `src/app/api/cron/publish-scheduled/route.ts:8-9`
  - `src/app/api/cron/social-publish/route.ts:121-122`
  - When `process.env.CRON_SECRET` is `undefined`, the comparison target is the literal string `"Bearer undefined"`; a request with header `Authorization: Bearer undefined` matches and is authorized.
- **Why it matters:** These routes run privileged side effects with the **service-role client** and no admin fallback: `abandoned-cart` generates single-use discount codes and sends email; `email-automations` / `email-campaigns-send` send bulk marketing email (spam/deliverability/cost abuse and reputational damage); `expire-bookings` mutates booking state (can cancel held seats); `publish-scheduled` / `social-publish` publish content. An attacker who can reach the URL while the secret is absent can drive all of these. The two `fulfillment/*` routes use the same bare compare but **fall back to `requireAdmin()`**, so they are NOT exposed to anon (a non-admin still gets 403) — only the 7 cron routes lack that fallback.
- **Remediation:** Guard the unset case exactly as `src/app/api/admin/revalidate/route.ts:19-20` already does:
  ```ts
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  ```
  Better: centralize as `requireCron(request)` in `src/lib/auth/` that 500s on unset secret and uses `crypto.timingSafeEqual`. Apply to all 7 cron routes and both `fulfillment/*` routes. Belt-and-suspenders: validate `CRON_SECRET` presence at boot (env schema) so deploys fail fast.
- **Prior-finding cross-ref:** New (prior audit marked cron auth "OK" at A-security lines 39-42 without testing the unset case).
- **Regression test:** With `CRON_SECRET` deleted from env, `GET /api/cron/abandoned-cart` with `Authorization: Bearer undefined` must return 401 (currently 200). With `CRON_SECRET` set, a wrong/missing token must 401 and the correct token must 200.

---

### AZ-2 — Several high-traffic routes parse `request.json()` without a schema
- **Severity:** P2 (reliability + injection-surface hardening; no confirmed exploit because downstream values are re-validated against the DB)
- **Evidence:** Routes that hand-destructure the body with no zod/shape validation:
  - `src/app/api/checkout/route.ts:32` — `const { items, email, cartId, shippingSurchargeLabel, promoCode } = await request.json()` (`items` shape, `email` format, `cartId` type unvalidated)
  - `src/app/api/checkout/intent/route.ts:42` — same
  - `src/app/api/pixel/event/route.ts:25-32` — `params`/`userData` untyped passthrough
  - `src/app/api/lessons/[id]/comments/route.ts:46-47` — `content`, `parent_id` (no length cap on `content`; `parent_id` not verified to belong to the same lesson)
  - `src/app/api/lessons/[id]/progress/route.ts:18-19` — `last_position_seconds` accepted as any `number` (negative/NaN-ish/huge allowed)
  - `src/app/api/commissions/route.ts:26-37` — body fields only presence-checked; free-text fields (`description`, `client_name`) flow into an HTML email built by string interpolation (see AZ-5)
- **Why it matters:** Unvalidated bodies invite malformed-input 500s and make downstream interpolation/storage riskier. Checkout is protected because prices/fulfillment are re-derived from the DB and the surcharge is read from the server-set cart row, so price tampering is already blocked — but `shippingSurchargeLabel` is taken from the client and used as the Stripe `display_name` (cosmetic, shown on the Stripe page).
- **Remediation:** Add `zod` schemas via the existing `parseBody()` helper (`src/lib/api/respond.ts`) — already used correctly by class signup and all `account/*` routes. Cap `lesson_comments.content` length; clamp `last_position_seconds` to `[0, lessonDuration]`; validate `parent_id` belongs to the same lesson.
- **Prior-finding cross-ref:** New (expands on prior B-series price-validation work, which is intact).
- **Regression test:** `POST /api/lessons/:id/progress` with `last_position_seconds: -1` and with a 10 MB `content` string on the comments route must be rejected 400, not stored.

---

### AZ-3 — `lessons/[id]/comments` POST and `courses/[id]/enroll` have no rate limit
- **Severity:** P2 (abuse/DoS of authenticated endpoints; auth required, so limited to logged-in/enrolled users)
- **Evidence:** `src/app/api/lessons/[id]/comments/route.ts` (POST) — no `rateLimit` import/call. `src/app/api/courses/[id]/enroll/route.ts` — no rate limit; for paid courses it calls `stripe.checkout.sessions.create` on every request (Stripe API cost), for free courses it inserts an enrollment via the service client.
- **Why it matters:** An enrolled user can flood lesson comments (content spam, notification storms) or spam Stripe session creation. Lower severity than public routes because both require an authenticated session and (for enroll) course access, but every comparable public route is rate-limited, so this is an inconsistency.
- **Remediation:** Add `rateLimit(request, { limit: 20, windowMs: 60_000, keyPrefix: 'lesson-comment' })` and `{ limit: 5, windowMs: 60_000, keyPrefix: 'enroll' }` using the existing limiter. (Prior A-20 limiter caveat — per-instance — still applies; acceptable for casual-abuse deterrence.)
- **Prior-finding cross-ref:** Partial overlap with prior "No rate limit — FLAG" notes on `courses/[id]/enroll` (A-security line 21); the comments-POST gap is new.
- **Regression test:** 30 rapid `POST /api/lessons/:id/comments` from one enrolled user must yield 429 after the limit.

---

### AZ-4 — Non-constant-time secret comparisons (gate password, cron/fulfillment secret)
- **Severity:** P3 (defense-in-depth; network timing attacks on these are impractical)
- **Evidence:** `src/app/api/gate/route.ts:28` — `if (!submitted || submitted !== password)` compares the submitted gate password to `SITE_PASSWORD` with `!==` (plaintext, non-constant-time). `src/app/api/fulfillment/submit/route.ts:10` and `src/app/api/fulfillment/retry/[itemId]/route.ts:18` and all 7 cron routes compare secrets with `!==`. `src/proxy.ts:38-39` compares a derived SHA-256 token with `===`.
- **Why it matters:** Theoretical timing side-channel on secret comparison. Realistically unexploitable over the network with these values, and the gate is rate-limited (5/5min). Recorded for completeness / enterprise hardening.
- **Remediation:** Use `crypto.timingSafeEqual` for secret/token comparisons (after length-equalizing). For the gate, compare a hash of the submitted value, not the plaintext.
- **Prior-finding cross-ref:** Partial — prior A-12 noted the gate compare is non-constant-time and is now rate-limited (A-12 fix landed).
- **Regression test:** N/A (timing); covered by a unit test asserting `timingSafeEqual` is used.

---

### AZ-5 — Stored/notification XSS surface via unsanitized HTML email interpolation
- **Severity:** P2 (recipient is the site owner's inbox; not a direct app-XSS, but untrusted input is interpolated into HTML)
- **Evidence:** `src/app/api/commissions/route.ts:99-111` interpolates client-supplied `client_name`, `client_email`, `description`, etc. directly into an HTML email (`brandedShell(...)`) with no escaping. `src/app/api/classes/[slug]/signup/route.ts:100-110` interpolates `body.name`, `body.email`, `body.special_notes` into the owner-notification HTML (these are zod-string-validated for length but not HTML-escaped).
- **Why it matters:** An attacker submitting a commission/class signup controls HTML rendered in the owner's email client. Most mail clients neuter script, but markup/links can be injected (phishing within a trusted-looking notification). The blast radius is the owner's inbox, not other site visitors — hence P2.
- **Remediation:** HTML-escape all interpolated user fields before placing them in email bodies (a small `escapeHtml()` util), or use a templating layer that escapes by default.
- **Prior-finding cross-ref:** New (the commerce/email register may track email rendering separately; flagged here from the ingress side).
- **Regression test:** Submit a commission with `client_name = "<img src=x onerror=alert(1)>"` and assert the generated HTML contains the escaped entity, not raw `<img>`.

---

### AZ-6 — `carts` row overwritten by client-supplied `cartId` with no ownership binding
- **Severity:** P3 (defense-in-depth; requires knowing a victim's cart UUID, and checkout re-validates everything server-side)
- **Evidence:** `src/app/api/checkout/route.ts:105-127`, `src/app/api/checkout/intent/route.ts:101-123`, and `src/app/api/cart/shipping-quote/route.ts:14-22` write `carts.items` / `carts.shipping_surcharge_cents` keyed only by the client-supplied `cartId` via the **service client** (RLS bypassed), with no check that the cart belongs to the caller (carts are anonymous/guest by design).
- **Why it matters:** An attacker who learns another session's `cartId` (a v4 UUID, not easily guessed) could overwrite that cart's persisted items/surcharge. Impact is bounded: the values are re-derived from product/variant rows at checkout and the surcharge is recomputed, so this is griefing of a specific known cart rather than price manipulation. Recorded as hardening.
- **Remediation:** Bind carts to a signed httpOnly cart cookie (or to `auth.uid()` when present) and verify ownership before the service-client write; or accept the residual risk explicitly in `KNOWN_RISKS.md` given guest-cart design.
- **Prior-finding cross-ref:** New (prior B-5/B-6 established the server-set surcharge; this is the ownership gap on the write path).
- **Regression test:** With cart A owned by session 1, a request from session 2 supplying `cartId = A` must not mutate cart A's row.

---

## Verified-fixed since prior audit (`audit/findings/A-security.md`, ~2026-06-08)

| Prior ID | Prior claim | Current state | Evidence |
|---|---|---|---|
| A-1 / A-2 / A-5 | No middleware; 34 admin pages + admin APIs unguarded | **FIXED** | `src/proxy.ts:48-52` runs `updateSession`; `src/lib/supabase/middleware.ts:35-67` `getUser()` + `profiles.role` check for `/admin` and `/account`; 92/92 admin routes call `requireAdmin()` and gate on `!auth.ok` |
| A-3 | All webhooks on anon client → paid-order writes fail | **FIXED** | All 5 webhooks import & use `createServiceClient()` (`stripe/route.ts:79`, `lumaprints:66`, `printful:64`, `resend:59`, `shipstation:51`) |
| A-4 | `GET /api/fulfillment/status/[orderId]` unauth order-data leak | **FIXED** | `fulfillment/status/[orderId]/route.ts:11-12` now `requireAdmin()` first |
| A-6 | Resend webhook signature stubbed (TODO) | **FIXED** | `webhooks/resend/route.ts:9,38-48` imports `svix` `Webhook`, verifies signature when secret set, hard-fails 503 in prod when unset |
| A-11 | No rate limit on `POST /api/checkout` | **FIXED** | `checkout/route.ts:14-15` (10/min); `checkout/intent` also limited |
| A-12 | No rate limit on `POST /api/gate` | **FIXED** | `gate/route.ts:16-17` (5/5min) |
| A-13 | No rate limit on `cart/shipping-quote` | **FIXED** | `cart/shipping-quote/route.ts:33` (30/min) |

> Note: A-7/A-8/A-14/A-15/A-16/A-18/A-19 are database/RLS/storage/Auth-config findings outside this register's code scope — defer verification to the DB/storage register (phase 3). A-9/A-24 (`handle_new_user` trigger) likewise belongs to the DB register; from the code side, `requireAdmin()` still hard-403s a user with no `profiles` row, so the trigger's presence should be confirmed there.

## Coverage statement

**130 route files enumerated.** Triage method: greps for (a) routes importing `createServiceClient` (25 hits), (b) admin routes missing `requireAdmin` (0), (c) per-route presence of `getUser`/`requireAdmin`/`rateLimit` across all non-admin/non-webhook/non-cron routes, (d) client-supplied role/admin in body or custom headers (0), (e) API writes to `profiles.role` (0), (f) webhook client type + signature/secret verification (all 5), (g) cron auth pattern (all 7), (h) presence of unset-secret guards. **Fully read (line-by-line): 23 high-value/suspicious routes** — proxy, both supabase server/middleware/client files, require-admin, admin layout, and the routes: fulfillment/status, commissions, checkout, checkout/intent, classes/[slug]/signup, pixel/event, cart/shipping-quote, account/addresses/[id], account/wishlist/[id], account/email, account/password, lessons/[id]/progress, lessons/[id]/comments, courses/[id]/enroll, unsubscribe, discounts/validate, gate, admin/discount-codes/generate, fulfillment/submit, fulfillment/retry/[itemId], cron/abandoned-cart, webhooks/resend, webhooks/stripe. The remaining ~107 (mostly `api/admin/**` CRUD) were covered by the structural greps confirming uniform `requireAdmin()` gating and no client-role trust; a representative admin mutation (`discount-codes/generate`) was read in full to confirm the pattern is real (auth first, zod, `createdBy: auth.user.id`).
