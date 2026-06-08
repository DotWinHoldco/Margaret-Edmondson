# ArtByME — Autonomous Overnight Hardening Log

Run started 2026-06-07 (late). Executor: Claude Code (ultracode), autonomous.
Repo: `/Users/skylarwebber/Margaret-Edmondson` · Supabase: `klwkajukicsoiwpsgftt` (MargaretEdmondson, ACTIVE_HEALTHY) · Site: artbyme.studio (Next.js 16).

> This log is appended continuously — one entry per task: **DONE / FIXED-FORWARD / DEFERRED(reason)**, what changed, files touched, every judgment call. The final summary + human-action list is added at the top in Phase 6.

---

## Baseline (Phase 0)

**Phase gate (before any change) — all green:**
- `npm ci` → exit 0
- `npm run typecheck` → clean (0 errors)
- `npm run lint` → 0 errors, 47 warnings (mostly `<img>`/unused-var; pre-existing)
- `npm run build` → exit 0
- `npm test` → 66 passed / 10 files

**Stripe mode:** `site_settings.stripe_test_mode = true` (confirmed; will stay test the entire run).

**Advisors baseline → `audit/advisors-before.json`:**
- Security: 34 lints — INFO 4, WARN 30, **ERROR 0, CRITICAL 0**.
  - 4 policy-less RLS tables: `audit_log`, `commission_milestones`, `meta_events`, `webhook_logs`.
  - 4 `WITH CHECK (true)` INSERT policies: `carts`, `class_bookings`, `commissions`, `newsletter_subscribers`.
  - 6 public buckets list-all: `about-images`, `class-pet-photos`, `commission-references`, `library`, `product-images`, `testimonials`.
  - 19 anon/authenticated-executable SECURITY DEFINER functions.
  - Leaked-password protection disabled.
- Performance: 197 lints — WARN 112, INFO 85, ERROR 0, CRITICAL 0.

**Row counts (n_live_tup, public schema):** orders 0 · order_items 0 · webhook_logs 0 · commission_milestones 0 · audit_log 0 · meta_events 0 · promo_code_redemptions 0 · carts 2 · products 37 · product_variants 585 · product_images 61 · media_library 84 · blog_posts 10 · class_sessions 23 · testimonials 13 · cv_entries 16 · lumaprints_mediums 8 · lumaprints_pricing_cache 16 · profiles 1 · crm_contacts 1 · newsletter_subscribers 1 · promo_codes 1 · site_settings 1 · pages 5 · page_blocks 6 · page_revisions 9 · bio_sections 5 · bio_callouts 7 · product_categories 38. (All LMS/orders/commissions/feedback/work_request tables empty.)

**Restore tag:** `restore/pre-overnight` created & pushed at HEAD (`dbbbdfc`).

---

## PHASE 0 — Preflight & safety

- **0.1 Clean install & baseline gate** — DONE. See Baseline above. Environment healthy; tests runnable.
- **0.2 Env verification** — DONE. Added `scripts/check-env.mjs` (asserts presence, never prints values; loads `.env.local` then `process.env`; non-zero exit if a required var missing). Local run: present = `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `EMAIL_FROM`. **Missing locally** (live in Vercel): `SUPABASE_SERVICE_ROLE_KEY`*, `RESEND_API_KEY`*, `CRON_SECRET`*, all Stripe (`STRIPE_SECRET_KEY[_TEST]`, `STRIPE_WEBHOOK_SECRET[_TEST]`, publishable), `RESEND_WEBHOOK_SECRET`, `LUMAPRINTS_API_KEY/SECRET`, `PRINTFUL_ACCESS_TOKEN`, `SHIPSTATION_API_KEY`, `META_CAPI_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `SITE_PASSWORD`, `SITE_AUTH_SECRET`. (*=required.) Updated `.env.example` to add `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET_TEST`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST`, `ANTHROPIC_API_KEY`. Judgment call: code is written env-guarded throughout, so these missing keys never block a task — they are runtime requirements the human adds in Vercel.
- **0.3 Stripe TEST mode** — DONE/confirmed. `stripe_test_mode = true`; not flipping.
- **0.4 DB baseline snapshot** — DONE. `audit/advisors-before.json`; row counts above.
- **0.5 Restore tag + log** — DONE. Tag pushed; this log initialized.

---

## PHASE 1 — Critical security & the money path

Code committed `4011879`; DB migrations `2026060801`–`2026060805` (+ two grant-lock follow-ups) applied to prod and verified. Restore tag `restore/pre-phase1` pushed before DB work.

- **1.1 [B-1,B-12,E-1,E-2,D-2,D-3] Service client in webhooks & crons** — DONE. Swapped `createClient()`→`createServiceClient()` in all 5 webhooks (stripe, lumaprints, printful, shipstation, resend) and all 4 crons (abandoned-cart, email-automations, email-campaigns-send, meta-event-sync). Grep confirms zero `createClient()` remain there. **Also** swapped the public `pixel/event` route (it inserts `meta_events`, which is now RLS-locked to service-role writes — A-14). Judgment call: a public route using the service client is acceptable here because it only writes the allowlisted/rate-limited meta_events queue. Runtime needs `SUPABASE_SERVICE_ROLE_KEY` (human adds in Vercel) for these writes to land; code is complete and fails safe without it.
- **1.2 [C-BLOCK-2] Gate allowlist** — DONE. `src/proxy.ts` `gateCheck()` now early-returns for `/api/webhooks` and `/api/cron` so machine callbacks are never rewritten to `/gate`. Verified `updateSession` still gates `/admin` (redirects unauth→/login, non-admin→/) — confirms **A-1/A-2/A-5 are false positives**; no `src/middleware.ts` created (rule 9).
- **1.3 [B-2] Webhook idempotency** — DONE. Migration `2026060801`: `orders.stripe_checkout_session_id` UNIQUE + `webhook_logs.stripe_event_id` TEXT + unique partial index. Stripe handler now (a) returns 200 `duplicate` if `event.id` already in `webhook_logs`, (b) stores `stripe_event_id`, (c) skips order creation if an order already exists for the session. Verified constraint/column/index present.
- **1.4 [A-9] handle_new_user trigger** — DONE. Migration `2026060802`: function + `on_auth_user_created` AFTER INSERT trigger (default role `customer`), and revoked direct RPC EXECUTE from PUBLIC/anon/authenticated (trigger still fires). **Verified** by a rolled-back transactional insert into `auth.users` → exactly one `profiles` row created; nothing persisted.
- **1.5 [A-14,F-3] Policies for the 4 policy-less tables** — DONE. Migration `2026060803`: admin read on `audit_log`/`meta_events`/`webhook_logs`, admin insert on `audit_log`, admin full CRUD on `commission_milestones`. Advisor `rls_enabled_no_policy` count 4→0.
- **1.6 [C-1,C-2] Kill stored-XSS** — DONE. Added `src/lib/sanitize.ts` (`sanitizeHtml` via isomorphic-dompurify, tag/attr allowlist, forbids `<script>/<iframe>/<object>/<form>`). Applied to every `dangerouslySetInnerHTML` sink: blog `[slug]`, `PageBodyShell`, `ProductDetail` (×3), `about`, `AboutSplitBlock`, `contact`, `ProjectHubClient` (×3), and the 3 funnel templates. **PixelScript** left unsanitized **intentionally** (it is the Meta-pixel bootstrap `<script>`, env-only input — sanitizing would break tracking; documented inline). The commission/order `<script>`+dangerouslySetInnerHTML status hacks were removed entirely (see 1.7). Grep confirms no unsanitized user-content sinks remain.
- **1.7 [F-2] Commission status update** — DONE. Added `PATCH /api/commissions` (`requireAdmin`, status allowlist). Replaced the inline-`<script>` hacks on **both** `admin/commissions/[id]` and `admin/orders/[id]` with new client components `CommissionStatusControl` / `OrderStatusControl` (preserve exact styling; call the PATCH endpoints; router.refresh on success). Order PATCH already existed at `/api/admin/orders/[id]`.
- **1.8 [A-7,A-8,A-18] Lock SECURITY DEFINER grants** — DONE (with one documented exception). Migration `2026060804` + follow-ups: `record_order_for_contact` revoked from anon/authenticated, granted service_role (only the Stripe webhook calls it, now via service client — verified anon cannot, service_role can). `rls_auto_enable` and `handle_new_user` revoked from **PUBLIC** (the default grant; revoking only `anon` was a no-op) — both are trigger-only, referenced by 0 policies, so the triggers still fire. **`is_admin_or_artist` INTENTIONALLY left anon-executable (DEFERRED, judgment call):** ~40 admin RLS policies are written `TO public USING(is_admin_or_artist())` including SELECT on public pages (`class_sessions`, `testimonials`, `artwork_funnels`, `bio_*`); Postgres evaluates those for the anon role too, so revoking anon EXECUTE would make every public read throw "permission denied for function". Verified: simulated `SET ROLE anon` reads of class_sessions/testimonials/artwork_funnels succeed. The fn returns false for anon, so this is harmless; clearing the WARN would require rewriting all those policies to `TO authenticated` (large, risky) — left for a follow-up.
- **1.9 [A-6,E-3] Resend webhook signature** — DONE. `svix` pinned in package.json (was transitive via resend). `webhooks/resend` now verifies the Svix signature whenever `RESEND_WEBHOOK_SECRET` is set (unsigned/tampered → 400). Runtime needs `RESEND_WEBHOOK_SECRET` in Vercel for enforcement.
- **1.10 [A-15] PII buckets private + signed URLs** — DONE. Migration `2026060805`: `commission-references` + `class-pet-photos` set `public=false`; dropped the actual public-read policies (`"Public read commission references"` / `"Public read pet photos"` — note: names differ from the findings doc, verified in DB); added admin-only SELECT. Public UPLOAD policies kept (the public forms still write). Added `src/lib/storage/signed.ts` (`signBucketUrls`/`extractStoragePath`, accepts an admin authed client so it works **without** the service key via the new admin SELECT policy; best-effort fallback). Wired into `admin/commissions/[id]` (reference images) and `admin/classes/[id]/bookings` (pet photos). Upload forms now store the bucket-relative **path** instead of a (now-dead) public URL. Advisor public-bucket-listing count 6→4 (the 2 PII buckets removed).
- **1.11 [A-4,A-11,A-12,A-13,B-18] Authz & rate-limit gaps** — DONE. `requireAdmin()` added to `GET /fulfillment/status/[orderId]` (was a fully open order-email/tracking leak; 0 callers in code, safe to lock; uses the authed client for the read). `fulfillment/submit` + `retry/[itemId]` now accept the cron secret OR an admin session. `rateLimit` added to `/checkout` (10/min), `/cart/shipping-quote` (30/min), `/gate` (5/5min).
- **1.12 [A-19] Leaked-password protection** — **BLOCKED (human action).** This is a Supabase Auth (GoTrue) setting with no SQL/MCP surface available in this run. HUMAN: Dashboard → Authentication → Password settings → enable "Check for leaked passwords" (HaveIBeenPwned).
- **Phase 1 Gate** — GREEN: typecheck clean, lint 0 errors (47 pre-existing warnings), build exit 0, 66/66 tests. **Advisors after → `audit/advisors-after-phase1.json` (+ `-performance.json`):** security 34→23 lints, **0 ERROR/CRITICAL, no new Critical/High**; `rls_enabled_no_policy` 4→0; public buckets 6→4; SECURITY DEFINER anon-executable 9→7 (record_order/rls_auto_enable/handle_new_user locked). Performance unchanged (197, all WARN/INFO).

### Phase 1 adversarial review (cloud workflow, 12 agents) — 6 confirmed findings, all REMEDIATED

Ran an adversarial review workflow over the Phase 1 diff. Fixes folded into Phase 2:
- **(HIGH, regression I introduced)** class checkout/signup Zod still required `z.string().url()` after I switched the upload forms to store paths → a photo attach would 400 the checkout. FIXED: relaxed both schemas to accept bucket-relative paths.
- **(MED)** commission notification email linked dead public-bucket paths. FIXED: sign refs via service client (7-day) before composing the email.
- **(LOW, real)** `sanitize.ts` allowed `style` but DOMPurify 3.x dropped its CSS filter → CSS-injection vector. FIXED: removed `style` from the attr allowlist (align + classes cover formatting).
- **(LOW)** `signBucketUrls` returned dead paths on failure with no logging. FIXED: logs on error and returns `''` (UI shows unavailable, not a broken img).
- **(MED ×2)** Stripe webhook idempotency: mark-seen-before-work could abandon a partial order on retry; non-atomic dedupe let concurrent deliveries double-process bookings/enrollments. FIXED in the Phase 2 webhook rewrite (see 2.1/2.5 below): removed the log-marker dedupe gate; idempotency is now per-entity (orders UNIQUE + resume-if-no-items, booking status-transition, enrollment onConflict(profile_id,course_id)); processing throws → Stripe retries.

---

## PHASE 2 — Complete the money path & fix broken flows

DB: migration `2026060806_money_path_atomicity` applied + verified. Code: checkout, Stripe webhook, class routes, fulfillment, admin orders, new cron + order-items route.

- **2.1 [B-5] Stop using Stripe metadata for line items** — DONE. `checkout` now persists validated items to `carts.items` (service client) and dropped `items_json` from Stripe metadata (500-char cap silently truncated 4+ item carts → empty orders). The webhook reads the item LIST from `carts.items` and re-derives price + fulfillment from authoritative server data in batched `.in()` lookups (fixes B-8 N+1 too; never trusts cart-stored price, which `track_cart` lets anon set). Residual `JSON.parse` removed entirely.
- **2.2 [B-6] Server-side shipping surcharge** — DONE. Added `carts.shipping_surcharge_cents`; `/api/cart/shipping-quote` now takes `cartId` and persists the computed surcharge (service client); `checkout` reads the surcharge from the cart, never the POST body. Cart page passes `cartId` to the quote. Posting `shippingSurcharge:0` no longer changes the charged total.
- **2.3 [B-7] Correct fulfillment routing** — DONE. `checkout` (and the webhook) derive `fulfillmentType` from server `product.fulfillment_type` with `variant.variant_type==='original' → 'self_ship'`. Originals no longer mis-route to Lumaprints.
- **2.4 [B-9,B-10] Atomic inventory & class capacity** — DONE. `reserve_original(variant_id)` (FOR UPDATE; clamps at 0; service-role only) called from the webhook to claim originals; `book_class_session(...)` (FOR UPDATE capacity check + insert; anon-callable SECURITY DEFINER) replaces the count-then-insert TOCTOU race in BOTH class checkout and signup routes.
- **2.5 [B-4,B-11] Full Stripe event handling + booking expiry** — DONE. Webhook now handles `checkout.session.expired`, `async_payment_failed`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`; `failed_payment`/`disputed` added to order `VALID_STATUSES` + the order detail page + OrderStatusControl. New `/api/cron/expire-bookings` (hourly, in `vercel.json`) cancels stale `awaiting_payment` bookings >2h AND enforces 90-day `webhook_logs` retention (B-3 / 2.9). `runtime='nodejs'` + `maxDuration` set.
- **2.6 [B-14] Real refunds** — DONE (env-guarded). Admin order PATCH now calls `stripe.refunds.create({payment_intent})` when transitioning to `refunded`; refund failure returns 502 and does NOT flip status. With no Stripe key the status updates and a note is returned (ready once keys are in Vercel).
- **2.7 [B-15,B-16,B-17] Fulfillment providers** — DONE. Printful: `confirmOrder` added + called after create (orders no longer stuck in Draft). Lumaprints: `{id:id}` self-map replaced with `orderItemOptions: number[]` (matches the pricing/shipping API shape). **JUDGMENT/HUMAN:** the full Lumaprints order payload (option array vs `{optionId}` objects, width/height/file wrapper) must be verified against Lumaprints docs with live keys before go-live (can't test without keys). ShipStation: **decision = keep as a library, do NOT wire a router case** — no flow sets `fulfillment_type='shipstation'` (originals use self_ship), so there is no unreachable provider; the router's default already fails safe.
- **2.8 [B-19,B-20] Promo integrity** — DONE. `stripe_coupon_id` now persisted via the service client (anon UPDATE was silently RLS-dropped → a fresh coupon every checkout bypassed `max_redemptions:1`). Unique index `promo_code_redemptions(promo_code_id, contact_id) WHERE contact_id IS NOT NULL` added so a single-use code's second redemption is a caught no-op.
- **2.9 [B-3] Redact webhook PII + retention** — DONE. Webhook now stores a PII-free summary (`id/type/created/livemode/object_id/amount_total` + kind) in `webhook_logs.payload`, never the raw Stripe object (was leaking customer email + full address). 90-day retention delete added to the expire-bookings cron.
- **2.10 [D-4] Funnel metrics** — DONE (views + add_to_cart); purchase DEFERRED. Fixed the admin route calling the non-existent `increment_funnel_views` → `increment_funnel_metric(p_funnel_id, p_metric:'views')`. Wired `add_to_cart` tracking into all 3 funnel templates' add-to-cart handlers. **DEFERRED:** the per-funnel `purchase` counter needs funnel→checkout attribution AND an order success page — see the gap below. (The route + RPC + counter already support `purchase`.)
- **2.11 [B-25] Self-ship tracking** — DONE. New `PATCH /api/admin/order-items/[id]` (requireAdmin) sets carrier/tracking_number/tracking_url + mark-shipped/delivered. New `OrderFulfillmentPanel` client component on the order detail page edits tracking per item.
- **2.12 [B-23] Reconcile margin formula** — JUDGMENT CALL: finding premise is INCORRECT, formula NOT changed. The canonical price-setter is `customerPriceCents` (cost-plus markup, margin as a percentage), used by `/api/admin/variants/refresh` + VariantsTab and frozen by the golden tests; stored `margin_override_pct` values (100, 120) only make sense as cost-plus markups (a gross margin can't be ≥100%). Switching to B-23's `cost/(1-margin)` would divide by zero at margin=100 and break prod prices + tests. The gross-margin `compute.ts` + `/api/admin/pricing/refresh` is the SUPERSEDED, dollar-based legacy path. Action taken: documented the canonical model in `variant-pricing.ts` and marked the legacy route deprecated; NO formula change, NO re-price. **HUMAN:** confirm the intended margin model and retire/align the legacy pricing/refresh route. Sample (16x20 canvas, cost $25.95, ship $13.00, margin 100): current cost-plus = $64.90; B-23 gross-margin at "100" = undefined (div/0); at 65% = $87.14.
- **Phase 2 Gate** — GREEN: typecheck clean, build exit 0, 66/66 tests, lint 0 errors (47 warnings). **Advisors after → `audit/advisors-after-phase2.json`:** security 23→25 lints, **0 ERROR/CRITICAL, no new Critical/High** (the +2 is `book_class_session` anon/authenticated SECURITY DEFINER — a legitimate public booking RPC, same pattern as `track_cart`). Performance unchanged.

**Notable gap discovered (HUMAN / follow-up):** Stripe `success_url` is `/order/{CHECKOUT_SESSION_ID}` but **there is no `/order/[session]` page** — customers land on a 404 after a product purchase (the confirmation email is the de-facto receipt). Recommend building an order-status success page (also unblocks the funnel `purchase` counter via attribution). Not in the explicit Phase 2 task list; logged for follow-up.
