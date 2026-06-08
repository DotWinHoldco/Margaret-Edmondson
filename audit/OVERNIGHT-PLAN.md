# ArtByME — Autonomous Overnight Hardening & Completion Plan

**You are Claude Code (ultracode), running autonomously and unattended.** Your job: take the ArtByME platform from "large but incomplete" to "flawless and launch‑ready" by executing the phases below **in order**. This single file is your complete brief; the detailed evidence and copy‑pasteable fixes live in `audit/findings/A…G-*.md` and `audit/AUDIT-REPORT.md` — **read the relevant finding before each task**.

Repo: `/Users/skylarwebber/Margaret-Edmondson` · Supabase project ref: `klwkajukicsoiwpsgftt` · Site: artbyme.studio (Next.js 16 App Router).

---

## 0. OPERATING RULES (read fully before starting)

> **Prime directive: DO NOT STOP. Fix forward.** Failed build/lint/test gate? Diagnose, fix it, re‑run — don't halt. Missing key or credential? Still write the complete, correct code so it works the moment the key exists, then continue. Make the judgment call, log it, keep moving. The only things you must refuse are the hard list below (especially **rule 9** — never recreate the middleware).

**Workflow — push to `main`, use restore tags (NO branches)**
1. Work directly on **`main`** — do **not** create feature branches (previews break on branches in this project). Before starting, create & push an annotated restore tag `restore/pre-overnight` at HEAD; create & push `restore/pre-phaseN` before each phase's DB work. These tags are the rollback points.
2. Commit after **each task** with a message referencing the finding ID (e.g. `fix(payments): service client in stripe webhook [B-1]`) and **push every commit to `main`** as you go. For each DB migration, include the inverse (down) SQL as a comment so a human can revert.
3. Maintain `audit/OVERNIGHT-LOG.md` continuously: one entry per task — **DONE / FIXED‑FORWARD / DEFERRED(reason)** — what changed, files touched, and **every judgment call you made**. This replaces stopping: when in doubt, make the call and log it. End the run with a "Decisions & human‑action" summary.
4. After **every phase**, run the **Phase Gate**: `npm run typecheck` → `npm run lint` → `npm run build` → `npm test`. **Do not stop on failure — fix it forward and re‑run until green.** Never leave `main` un‑buildable; if a commit breaks the build and you can't immediately fix it, revert that commit and log it. Keep going. Never force‑push.

**Database (you are authorized to apply migrations to PRODUCTION)**
5. For every schema/RLS change: write an **idempotent** migration file in `supabase/migrations/` named `20260608NN_<slug>.sql` (use `IF EXISTS` / `IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, `ON CONFLICT DO NOTHING`).
6. **Before** the first migration: capture a baseline — run the Supabase security + performance advisors and save to `audit/advisors-before.json`; `SELECT count(*)` on every table you will touch and log it.
7. Apply migrations to the production project (`klwkajukicsoiwpsgftt`) via the Supabase MCP `apply_migration` (or `supabase db push`). **After each migration, re‑query** the affected objects to confirm the change took, and log it.
8. **After** all DB work in a phase: re‑run advisors → `audit/advisors-after-phaseN.json`; diff against before. **No new Critical/High security advisor may be introduced.** If one is, revert that migration.

**Hard refusals — the ONLY things you must not do (log and keep going):**
9. ❌ **Do NOT create `src/middleware.ts`.** The middleware already exists as **`src/proxy.ts`** (Next.js 16 renamed `middleware`→`proxy`). The audit's "no middleware / admin exposed" items (`A-1`, `A-2`, `A-5`, `F-1`) are **FALSE POSITIVES** — do not act on them. Verify `src/proxy.ts` runs `gateCheck` → `updateSession` and move on.
10. ❌ Do NOT delete data, drop tables/columns, empty buckets, or hard‑delete rows. Soft‑archive only; keep DB changes additive/reversible (restore tags cover code, inverse‑SQL comments cover DB).
11. ❌ Do NOT enter, rotate, print, or invent secret values. Do NOT flip Stripe to live mode or execute live charges.
12. ❌ Do NOT touch visual design / styling / copy (the human handles aesthetics — see `AUDIT-REPORT.md` §13). Functional markup changes (e.g. wiring an upload button) are fine; restyling is not.
13. **Missing keys NEVER block a task.** You won't have live Stripe keys, and `SUPABASE_SERVICE_ROLE_KEY` may be unset — **write all code complete and correct anyway** (read creds from env; guard missing env gracefully so nothing crashes; it will be tested with keys later). Log which keys the human must add in Vercel for the code to take effect at runtime.

**Definition of done:** every Critical and High is resolved in code (working now, or correct‑and‑ready‑pending‑a‑key with that noted in the log); `main` builds green; advisors show no new criticals; `audit/OVERNIGHT-LOG.md` documents all changes, judgment calls, and the short human‑only action list (add keys, toggle leaked‑password protection, sign off margin prices, design pass).

---

## PHASE 0 — Preflight & safety (do not skip)

- **0.1 Clean install & baseline.** `npm ci`. Run the Phase Gate and record results in the log (this is the "before" state). If `npm test` can't run, fix the environment (`npm ci` on this OS) — tests are required for later gates.
- **0.2 Env verification.** Create `scripts/check-env.mjs` that asserts presence (not values) of: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET_TEST`, `RESEND_API_KEY`, `LUMAPRINTS_API_KEY/SECRET`, `PRINTFUL_ACCESS_TOKEN`, `SHIPSTATION_API_KEY`, `META_CAPI_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `SITE_PASSWORD`, `SITE_AUTH_SECRET`. Run it. **Log which are missing.** Update `.env.example` to add the missing‑from‑docs vars: `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET_TEST`, `ANTHROPIC_API_KEY`. **Missing keys do NOT block any task** — write all code complete and correct regardless; just log which keys the human must add in Vercel for the code to take effect at runtime (expected at minimum: `SUPABASE_SERVICE_ROLE_KEY` and the live Stripe keys).
- **0.3 Confirm site stays in Stripe TEST mode** for the whole run (`site_settings.stripe_test_mode = true`). Do not flip to live.
- **0.4 DB baseline snapshot.** Advisors → `audit/advisors-before.json`; row counts of all tables → log.
- **0.5 Restore tag + log** — create & push `restore/pre-overnight`; initialize `audit/OVERNIGHT-LOG.md`.

---

## PHASE 1 — Critical security & the money path (launch‑blockers)

> Goal: the platform can securely accept a payment and persist the order, emails/crons can run, no stored‑XSS, signups provision profiles. Detail: `findings/A-security.md`, `findings/B-payments.md`, `findings/E-…md`.

- **1.1 [B‑1, B‑12, E‑1, E‑2, D‑2, D‑3] Service client in all webhooks & crons.** In every handler under `src/app/api/webhooks/*` and `src/app/api/cron/*`, replace `await createClient()` with `createServiceClient()` (import from `@/lib/supabase/server`). **Grep anchor:** `grep -rn "createClient()" src/app/api/webhooks src/app/api/cron`. **Acceptance:** zero `createClient()` remain in those dirs; service client used for all DB writes.
- **1.2 [C‑BLOCK‑2] Allowlist callbacks in the gate.** In `src/proxy.ts` `gateCheck()` early‑return block (currently `src/proxy.ts:20-30`), add `pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/cron')`. **Acceptance:** a request to `/api/webhooks/stripe` and `/api/cron/*` is NOT rewritten to `/gate`.
- **1.3 [B‑2] Webhook idempotency.** Migration: `ALTER TABLE orders ADD CONSTRAINT orders_stripe_checkout_session_id_key UNIQUE (stripe_checkout_session_id)`; add `webhook_logs.stripe_event_id TEXT` + unique partial index. In `webhooks/stripe/route.ts`, pre‑check `event.id` and existing order before processing; on dupe, return 200 without side effects. **Acceptance:** replaying the same event creates no second order.
- **1.4 [A‑9] `handle_new_user` trigger.** Migration with the exact SQL in `findings/A-security.md` §A‑9 (function + `on_auth_user_created` AFTER INSERT trigger on `auth.users`, default role `customer`). **Acceptance:** inserting a test `auth.users` row creates a matching `profiles` row (verify, then clean up the test row).
- **1.5 [A‑14, F‑3] Policies for the four policy‑less tables.** Migration: admin‑read (+ admin‑manage for `commission_milestones`) policies on `audit_log`, `commission_milestones`, `meta_events`, `webhook_logs` (SQL in `findings/A-security.md` §A‑14). Writes come via service client (1.1). **Acceptance:** an admin client can read these; `commission_milestones` admin CRUD works.
- **1.6 [C‑1, C‑2] Kill stored‑XSS.** Add `src/lib/sanitize.ts` exporting `sanitizeHtml(html)` using `isomorphic-dompurify` (allowlist safe tags/attrs). Apply to **every** `dangerouslySetInnerHTML` site. **Grep anchor:** `grep -rn "dangerouslySetInnerHTML" src`. Full list in `findings/C-builder-content.md` cross‑area note (blog `[slug]`, `PageBodyShell`, `ProductDetail`, `about`, `AboutSplitBlock`, admin `commissions/[id]`, `orders/[id]`, `ProjectHubClient`). Sanitize on render; also sanitize TipTap/page‑editor HTML on write. **Acceptance:** no unsanitized `dangerouslySetInnerHTML`; a `<script>onerror>` test string is stripped.
- **1.7 [F‑2] Commission status update.** Add `PATCH` (and as needed `PUT`) to `src/app/api/commissions/route.ts` (or a `[id]` route) with `requireAdmin()`; convert `admin/commissions/[id]/page.tsx` interactions to a client component that calls it. Remove the inline `<script>`+`dangerouslySetInnerHTML` status hack. **Acceptance:** changing a commission's status persists (no 405).
- **1.8 [A‑7, A‑8, A‑18] Lock SECURITY DEFINER grants.** Migration: `REVOKE EXECUTE … FROM anon, authenticated` on `rls_auto_enable`; `REVOKE … FROM anon, authenticated; GRANT … TO service_role` on `record_order_for_contact`; `REVOKE … FROM anon` on `is_admin_or_artist`. **Acceptance:** advisors no longer list these under anon‑executable SECURITY DEFINER; public flows still work (newsletter, promo validate, cart track — those stay granted).
- **1.9 [A‑6, E‑3] Verify Resend webhook signatures.** `npm i svix`; verify `svix-id/timestamp/signature` against `RESEND_WEBHOOK_SECRET` before parsing in `src/app/api/webhooks/resend/route.ts`. **Acceptance:** unsigned POST → 400.
- **1.10 [A‑15] PII buckets private + signed URLs.** Migration: `UPDATE storage.buckets SET public=false WHERE id IN ('commission-references','class-pet-photos')`; drop public SELECT policies; add admin‑only SELECT (SQL in §A‑15). Update any code that renders these to mint signed URLs via service client (`createSignedUrl(path, 3600)`) — e.g. admin commission detail, class bookings. **Acceptance:** anonymous bucket listing/download fails; admin still sees images via signed URLs.
- **1.11 [A‑4, A‑11, A‑13, A‑12, B‑18] Authz & rate‑limit gaps.** Add `requireAdmin()` (or order‑email match) to `GET /api/fulfillment/status/[orderId]`; add `requireAdmin()` to `fulfillment/submit` & `retry` (keep CRON_SECRET as secondary); add `rateLimit` to `/api/checkout`, `/api/cart/shipping-quote`, `/api/gate`. **Acceptance:** unauth status request → 401/403; rate limits return 429 past threshold.
- **1.12 [A‑19] Leaked‑password protection.** This is a Supabase Auth dashboard setting (or Management API). If you have Management API access, enable it; otherwise **log BLOCKED** with instructions for the human (Auth → Password settings → enable HaveIBeenPwned).
- **Phase 1 Gate** + advisors‑after diff (`audit/advisors-after-phase1.json`).

---

## PHASE 2 — Complete the money path & fix broken flows

> Goal: a multi‑item order flows correctly through checkout → webhook → order+items → fulfillment → email, with refunds, correct routing, and no oversell. Detail: `findings/B-payments.md`.

- **2.1 [B‑5] Stop using Stripe metadata for line items.** Persist validated items on the `carts` row in `checkout/route.ts`; read them from the cart in the webhook; remove `items_json`; wrap any residual parse in try/catch. **Acceptance:** a 6‑item cart produces an order with 6 `order_items`.
- **2.2 [B‑6] Server‑side shipping surcharge.** Add `carts.shipping_surcharge_cents`; set it in `/api/cart/shipping-quote`; read it (not the POST body) in `checkout/route.ts`. **Acceptance:** posting `shippingSurcharge:0` no longer changes the charged total.
- **2.3 [B‑7] Correct fulfillment routing.** In `checkout/route.ts`, derive `fulfillmentType` from server‑fetched `product.fulfillment_type` with `variant.variant_type==='original' → 'self_ship'`. **Acceptance:** originals route to `self_ship`, prints to `lumaprints`/`printful` correctly.
- **2.4 [B‑9, B‑10] Atomic inventory & class capacity.** Add `reserve_original(variant_id)` and `book_class_session(...)` RPCs (SQL in §B‑9/B‑10) using `FOR UPDATE`; call them from checkout/booking instead of read‑then‑write. **Acceptance:** concurrent buyers cannot oversell (write a test).
- **2.5 [B‑4, B‑11] Full Stripe event handling + booking expiry.** Handle `checkout.session.expired`, `async_payment_failed`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`; add statuses `failed_payment`/`disputed` to `admin/orders/[id]` `VALID_STATUSES`. Add `/api/cron/expire-bookings` (+ `vercel.json` entry) to cancel stale `awaiting_payment` bookings. **Acceptance:** an expired session cancels the held booking.
- **2.6 [B‑14] Real refunds.** When admin sets status `refunded`, call `stripe.refunds.create({ payment_intent })`, reading the key from env and guarding if absent. **Acceptance:** with Stripe keys present a refund is issued and the order updates; without keys the code path is complete and fails safe (logged), ready to work once keys are added.
- **2.7 [B‑15, B‑16, B‑17] Fulfillment providers.** Printful: add `POST /orders/{id}/confirm` after create. Lumaprints: fix `options` mapping to the real API shape (verify against Lumaprints docs / `lumaprints_mediums.option_ids`). ShipStation: add a router case in `fulfillment/router.ts` **or** remove the unused integration (log the decision). **Acceptance:** Printful order leaves Draft; router has no unreachable provider.
- **2.8 [B‑19, B‑20] Promo integrity.** Persist `stripe_coupon_id` via service client; add unique index on `promo_code_redemptions(promo_code_id, contact_id) WHERE contact_id IS NOT NULL`; reserve/own redemption at checkout to prevent single‑use bypass. **Acceptance:** a single‑use code cannot be redeemed twice.
- **2.9 [B‑3] Redact webhook PII + retention.** Store a safe summary in `webhook_logs.payload`; add a retention delete (90 days) to a cron. **Acceptance:** no raw email/address in new `webhook_logs` rows.
- **2.10 [D‑4] Funnel metrics.** Fix admin route to call `increment_funnel_metric` (not the non‑existent `increment_funnel_views`); wire `add_to_cart`/`purchase` tracking calls in funnel templates/checkout. **Acceptance:** all three funnel counters increment.
- **2.11 [B‑25] Self‑ship tracking entry.** `PATCH /api/admin/order-items/[id]` + admin order‑detail UI to set `tracking_number/url/carrier/shipped_at`. **Acceptance:** admin can record tracking; customer order view shows it.
- **2.12 [B‑23] Reconcile margin formula.** Determine which function sets `product_variants.price` and standardize on the gross‑margin formula `cost/(1−margin)`; re‑price via the admin refresh. **Acceptance:** computed prices match the intended 65% margin; log before/after sample prices for human review.
- **Phase 2 Gate** + advisors diff.

---

## PHASE 3 — Builder & content completeness (CRUD down to the submit button)

> Detail: `findings/C-builder-content.md`, `findings/F-commerce-lms-admin.md`.

- **3.1 [C‑3] Blog featured‑image upload** — replace the URL input in `admin/blog/new` & `[id]` with the existing media upload/picker (reuse `MediaPicker`/`media/upload`); persist to `blog_posts.cover_image`. **Acceptance:** uploading an image sets the cover and it renders on `/blog/[slug]`.
- **3.2 [C‑4] Wire `RichTextEditor`** into both blog forms (replace the raw textarea); sanitize on save (1.6). **Acceptance:** blog body is rich text, stored sanitized.
- **3.3 [C‑5, F‑5, F‑6] Archive/edit/delete coverage** — add `archived` to the blog status select; add archive + delete controls to the products list (wire to existing `DELETE` soft‑archive API); add edit + delete to promo codes. **Acceptance:** each entity supports create/edit/archive/delete from the UI.
- **3.4 [C/D] Blog scheduled publish** — add `blog_posts.publish_at` + `scheduled` status; `/api/cron/publish-scheduled` (+ `vercel.json`) flips due posts to `published`. **Acceptance:** a post scheduled in the past becomes published on cron run.
- **3.5 [C‑6, C‑7, C‑8, C‑11] Page builder fixes** — unify/redirect the legacy raw‑HTML "new page" forms to the section editor; fix the PATCH response‑shape so the edit form refreshes (`admin/pages/[id]/EditPageForm.tsx`); add server‑side MIME/size validation to `media/upload`; make the generic‑pages adapter support multiple sections + per‑section images. **Acceptance:** creating/editing any page uses the unified multi‑section editor with image upload.
- **3.6 [C‑13, C‑15] Remove dead content paths** — delete `site_content` query helpers + table usage and the unreachable `AboutEditor.tsx` (confirm no references first). **Acceptance:** build clean, no refs.
- **Phase 3 Gate.**

---

## PHASE 4 — Missing major features

> Detail: `findings/D-social-cron.md` (full build spec in §D‑1), `findings/F-commerce-lms-admin.md`, `findings/E-…md`.

- **4.1 [D‑1] Social content calendar (PRIMARY).** Build per the §D‑1 spec:
  - **DB migration:** `social_accounts` (provider, handle, status, **encrypted** token via Supabase Vault — never plaintext), `social_posts` (channel, body, link, media refs, status enum `draft|scheduled|publishing|published|failed`, `scheduled_at`, `published_at`, `progress`, `error`, optional `blog_post_id`/`product_id`), `social_post_media`; admin‑only RLS; index `(status, scheduled_at)`; `updated_at` triggers.
  - **API:** CRUD for posts, reschedule, status‑transition, calendar‑feed by range.
  - **Admin UI:** month/week calendar with **drag‑to‑reschedule** (reuse `@dnd-kit`), list/kanban by status, composer with media picker (reuse media library) + per‑channel preview + status/progress badges. Add nav link.
  - **Scheduler — Phase 1 (no OAuth):** `/api/cron/social-publish` (+ `vercel.json`) that, at `scheduled_at`, emails the owner a reminder and supports **mark‑as‑posted**; full Meta Graph API publishing left behind a feature flag for a later human‑assisted Phase 2 (log this boundary).
  - **Tie‑in:** "create a social post from this blog/product" action.
  - **Acceptance:** can compose, schedule on the calendar, drag to reschedule, see it progress to published via the cron, and track status. Log Meta‑publish as deferred.
- **4.2 [F‑7, F‑9] LMS student front‑end.** Public course catalog, course page, **lesson player**, progress tracking, and comments UI under `(marketing)`; fix the `profiles.auth_user_id` references (use `profiles.id = auth.uid()`); enforce enrollment gating. **Acceptance:** an enrolled test user can view a course, play lessons, and progress is recorded.
- **4.3 [F‑8] Account self‑service.** Implement `/account/wishlist`, `/account/classes`, `/account/settings` (currently 404), address book (`addresses`), and password change. **Acceptance:** no 404s from the account nav; profile/address/password editable.
- **4.4 [E] Integrations hub.** Expand `/admin/settings` Integrations into a real surface: per‑provider configured/connected status + a **"Send test"/"Verify credentials"** action (Resend test email, Lumaprints catalog ping, Stripe key check, Meta test event). **Acceptance:** each integration shows live status and a working test button.
- **4.5 [F‑15, F‑13] Settings model.** Add the ~20 missing settings (business/contact info, email from‑name/address, shipping origin + rates, tax, social links, SEO/OG defaults, announcement bar, maintenance mode, currency, order‑notification recipients) with a typed settings store; implement the "Clear All Carts" / "Revalidate Cache" placeholder actions for real. **Acceptance:** settings persist and are consumed where currently hardcoded.
- **4.6 [E‑4, E‑8, E‑10] Email engine completeness.** Add `welcome` and `post_purchase` automation triggers; add expiry to unsubscribe HMAC tokens; filter Resend open/click updates by `campaign_id`. **Acceptance:** a new signup receives the welcome automation (test mode); expired token rejected.
- **Phase 4 Gate** + advisors diff.

---

## PHASE 5 — Enterprise hardening

> Detail: `findings/G-quality-build.md`, plus `A-10`.

- **5.1 [G] Standardize API responses.** Route all ~63 non‑conforming routes through `src/lib/api/respond.ts` (`apiOk`/`apiError`); never return raw Supabase/Postgres error strings to clients. **Acceptance:** `grep -rn "error: .*\.message" src/app/api` ~0; consistent shapes.
- **5.2 [A‑10] CSP header.** Add `Content-Security-Policy` to `next.config.ts` (template in §A‑10) in **Report‑Only** first; log violations to review before enforcing.
- **5.3 [G] Cron robustness.** Add `export const maxDuration` (e.g. 60–300s) + `runtime='nodejs'` to cron/long routes; add an overlap lock to `email-campaigns-send`. **Acceptance:** no route relies on the default timeout.
- **5.4 [G] Observability.** Add Sentry (or structured logging) on the money path (checkout, webhook, fulfillment, cron) with error capture. **Acceptance:** a thrown error in the webhook is captured.
- **5.5 [G] Regenerate types.** `supabase gen types typescript` → `src/lib/types/database.ts`; remove the `any` casts that existed due to missing types. **Acceptance:** types cover all 68 tables; typecheck passes.
- **5.6 [G] Remove dead code.** Delete `(marketing)/v2`–`v6`, `archives/`, `claude-code-build/`, and other confirmed‑dead modules (the human confirmed only the original site is used). Confirm zero references first. **Acceptance:** build clean; bundle shrinks.
- **5.7 [G] SEO.** Add `app/sitemap.ts`, `app/robots.ts`, a default OG image, and `metadata`/`generateMetadata` on the 9 public pages missing it. **Acceptance:** `/sitemap.xml` and `/robots.txt` resolve; public pages have metadata.
- **5.8 [G] Runtime dashboard stats.** Replace the hand‑maintained stats array in `admin/.../ProjectHubClient.tsx` with runtime‑computed counts; remove the manual‑update instruction from `CLAUDE.md`. **Acceptance:** stats reflect reality automatically.
- **5.9 [G] Tests + CI.** Add tests for the money path (stripe webhook, checkout pricing, fulfillment router, `requireAdmin`, discount validation) and a `.github/workflows/ci.yml` running typecheck+lint+test on PRs. **Acceptance:** new tests pass; CI workflow present.
- **5.10 [G, optional] `next/image` migration** for the `<img>` lint warnings (non‑visual; perf/LCP). Mark optional; skip if it risks layout. (Any actual restyling stays with the human.)
- **Phase 5 Gate.**

---

## PHASE 6 — Final verification & handoff

- **6.1** Full Phase Gate (typecheck, lint, build, test) — all green.
- **6.2** Re‑run Supabase advisors → `audit/advisors-after-final.json`; diff vs `advisors-before.json`. Confirm: the four policy‑less tables resolved, SECURITY DEFINER grants locked, PII buckets private, **no new Critical/High**.
- **6.3** Smoke the money path: if Stripe test keys are present, trigger a `checkout.session.completed`; **otherwise add an integration test that feeds a mocked event to the webhook handler.** Either way confirm: one order + items written via the service client, fulfillment routed, confirmation email attempted, idempotent on replay. Hit each cron route with the `CRON_SECRET` → 200 + real work. Exercise: blog image upload, a scheduled blog post, social‑calendar CRUD + reschedule, a commission status change, an admin product archive.
- **6.4** Update `audit/OVERNIGHT-LOG.md` with a final summary: what shipped, what's BLOCKED and why (expected: `SUPABASE_SERVICE_ROLE_KEY` set in Vercel if it was missing; leaked‑password toggle; Meta publish Phase‑2/OAuth; the aesthetic/design list; any margin‑price changes needing human sign‑off).
- **6.5** Ensure all commits are pushed to `main`; create & push the final restore tag `restore/post-overnight`. The normal `main` deploy proceeds. Put the final summary + "Decisions & human‑action" list at the top of `audit/OVERNIGHT-LOG.md`.

---

## Quick reference — finding ID → file
`A-*` security → `audit/findings/A-security.md` · `B-*` payments → `B-payments.md` · `C-*` builders → `C-builder-content.md` · `D-*` social/cron → `D-social-cron.md` · `E-*` email/CRM/integrations → `E-email-crm-integrations.md` · `F-*` commerce/LMS/admin → `F-commerce-lms-admin.md` · `G-*` quality → `G-quality-build.md` · schema/RLS reference → `audit/00-backend-reference.md` · narrative → `audit/AUDIT-REPORT.md`.

**Remember rule #9: the middleware is `src/proxy.ts`. Do not create `src/middleware.ts`. Do not act on A‑1/A‑2/A‑5/F‑1. And per the prime directive — never stop on a failed gate or a missing key: fix it or write the code anyway, log the call, keep going.**
