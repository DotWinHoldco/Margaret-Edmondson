# ArtByME — Smoke-Test Remediation Build (single phased prompt)

Authored by DotWin · 2026-07-28
Source of truth: `audit/SMOKE-TEST-2026-07-28/` (click-by-click cloud smoke test of prod
`artbyme.studio`, main @ `0ec385b`, Stripe TEST mode, password-gated). Every finding below was
reproduced live with screenshots and DB/log evidence. Do not re-litigate whether a finding is
real; reproduce, fix forward, prove, move on.

## Global rules (read once, apply to every phase)

- Work on `main`. No branches. Push every commit. Before starting, create annotated restore tag
  `restore/pre-smoke-remediation-<date>`.
- Never stop on a failed gate: fix forward, log the call in `BUILD_LOG.md`.
- NEVER STUB. If a phase cannot be completed functionally, do not ship its surface; finish it.
- Missing keys are never a reason to skip a task: write complete code env-guarded so it activates
  the moment the key exists.
- Migrations: apply to prod ref `klwkajukicsoiwpsgftt` via Supabase MCP AND commit the matching
  `supabase/migrations/2026MMDDnn_*.sql` file in the same commit.
- Middleware lives in `src/proxy.ts` (Next 16). Do not create `src/middleware.ts`.

## Phase gate (referenced by every phase)

`npm run build-check` GREEN natively (typecheck, lint, vitest, next build, DotWin gates). New
behavior requires a new unit/integration test that fails before the fix and passes after. CI on
push to `main` is the authoritative GREEN. For money-path phases, additionally run the live
verification listed inside the phase against prod (test mode) and paste evidence into
`BUILD_LOG.md`.

---

## Status update (2026-07-30) — what is already DONE live vs still open

DONE in prod during the retest (migrations committed, changes applied via MCP, re-proven live):
- **F1 (money path)**: Stripe TEST webhook endpoint created (`we_1Tyfvf…`), `STRIPE_WEBHOOK_SECRET_TEST`
  set in Vercel. Full chain proven: Order #1 → items → self-ship auto-submit → inventory → account →
  emails → confirmation resolves → admin view → refund → auto-flip to refunded.
- **F13**: `class_bookings.payment_method` CHECK extended to allow `stripe`/`comp` (migration
  `2026073001`). Re-proven: a live $45 booking flips to paid/stripe.
- **F14**: admin SELECT RLS added to `orders`, `order_items`, `enrollments`, `blog_posts`
  (migration `2026073002`). Admin Orders now populates. **20 more tables still need the same policy —
  see Phase 4b.2.**
- **F4**: all 21 originals repriced from $0 to their `base_price` (live UPDATE). 0 remain mis-priced.
  The admin guard + warning chip in Phase 2a is still wanted so it can't regress.

STILL OPEN (need a human-supplied value or decision, cannot be done from the sandbox):
- **F3 embedded checkout**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` is in NO Vercel env, NO on-disk
  `.env`, and is not derivable from the secret key. Set it (Stripe → Test mode → Developers → API
  keys → Publishable key), redeploy, then the embedded retest can run. The fail-loud fallback (1b)
  should still be built regardless.
- **LumaPrints live submission**: production keys are valid against the live pricing API and the
  exact submit payload + real print-master image are verified, and the worker fires on real orders —
  but an actual order-submission 201 was not exercised (would print a real canvas). Do it on the
  sandbox host with sandbox keys (launch-checklist Steps 6-8), never silently against prod.

## Phase 0 — Ops prerequisites (human, ~10 min; verify before coding)

These are dashboard/config actions. If already done (check first), record evidence and skip.

1. Stripe dashboard → **Test mode** → Developers → Webhooks: an enabled endpoint for
   `https://artbyme.studio/api/webhooks/stripe` listening to the checklist events
   (`checkout.session.completed`, `checkout.session.async_payment_succeeded/failed`,
   `checkout.session.expired`, `payment_intent.succeeded/payment_failed`, `charge.refunded`,
   `charge.dispute.created`) — or all events. Its signing secret must equal
   `STRIPE_WEBHOOK_SECRET_TEST` in Vercel (Production). Evidence at smoke-test time: zero
   requests reached `/api/webhooks/stripe` in Vercel runtime logs while a test-mode hosted
   checkout completed payment (order never persisted).
2. Vercel → margaret-edmondson → Settings → Environment Variables (Production):
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` = the `pk_test_…` key. Missing at smoke-test time:
   the checkout page bundle fell back to `pk_live_…` against a test-mode PaymentIntent —
   `api.stripe.com/v1/elements/sessions` → 400 — and the embedded card form never mounted.
3. Redeploy (NEXT_PUBLIC vars are inlined at build).

Verification: place one hosted-checkout test purchase; confirm `webhook_logs` gets the
`checkout.session.completed` row and `orders` + `order_items` + buyer profile appear within ~60s.

## Phase 1 — Money-path closure (P0, code)

### 1a. Paid-but-unrecorded reconciliation sweep

Finding: a completed test payment produced NO order row because no webhook arrived, and
`/api/cron/ops-monitor` only sweeps orders that already exist with zero items — a
never-delivered webhook is invisible: no order, no alert, customer polls "finalizing your
order…" forever (evidence: paid session `cs_test_a11M4KE8…`, `orders` empty, `webhook_logs`
empty, ops-monitor silent).

Build: extend ops-monitor (or a sibling cron on the same schedule) to sweep
`checkout_snapshots` rows older than a 15-minute grace window that have no matching order by
`stripe_checkout_session_id`. For each, retrieve the session from Stripe (mode-aware key
selection, same helper the webhook uses); if `payment_status = paid`, run the SAME reconciliation
routine the webhook uses to build the order (do not duplicate logic — extract/reuse), then send
the owner-alert email marking it `reconciled_by_sweep`. If unpaid/expired, mark the snapshot
swept. Do the equivalent for paid course-enrollment sessions and class-booking sessions
(`class_bookings` stuck `awaiting_payment` past grace with a paid session → confirm; unpaid past
expiry is already handled by expire-bookings). Unit tests for: paid-no-order → order created +
alert; unpaid → no order; already-ordered → no-op; idempotent on rerun.

### 1b. Embedded checkout must fail loud, not dead

Finding: when Elements cannot mount (elements/sessions 400 from the pk/secret mode mismatch),
the page stays in `ready` phase and renders headings + a live-looking `PAY $125.00` button with
EMPTY Shipping/Payment sections. The existing "Checkout unavailable → Try express checkout"
fallback only renders when intent creation fails, so customers get a silently dead form.

Build: in `src/app/(marketing)/checkout/page.tsx`, detect Payment Element mount failure
(`onLoadError` on the PaymentElement / Elements `loaderror` event, plus a watchdog: element not
ready N seconds after `ready` phase) → transition to the existing error state offering hosted
express checkout, with a friendly line. Test: simulate loaderror → fallback UI renders; happy
path unaffected.

### 1c. Live verification (after 0 + 1a + 1b deployed)

Hosted purchase AND embedded purchase with 4242 in test mode. Both must produce: order +
items (correct price), `checkout_snapshots` linkage, buyer profile auto-created, confirmation
page resolves from "finalizing" to the receipt state, order-confirmation email in Resend,
order visible in `/admin/orders`, refund from admin flips status and Stripe shows the refund.
Paste order numbers + Resend message IDs into `BUILD_LOG.md`.

## Phase 2 — Data correctness (P1)

### 2a. Original variants priced $0 render as SOLD

Finding: all 22 kept original variants had `price = 0`; funnel templates treat
`price <= 0` as sold (`IntimateJournalTemplate.tsx:67` and siblings), so every original showed
"$0 / SOLD" while the hero showed `products.base_price` ($125 etc.) — nothing was purchasable.
Poolside was fixed live during the test (`price := base_price`, immediately purchasable and
then bought E2E).

Build: one migration/data fix: `UPDATE product_variants v SET price = p.base_price FROM
products p WHERE v.product_id = p.id AND v.variant_type='original' AND (v.price IS NULL OR
v.price <= 0) AND p.base_price > 0;` (expect 21 rows — Poolside already fixed). Add an admin
products-list warning chip when an active original variant has price ≤ 0 while `base_price > 0`,
and block flipping such a variant Live with the standard banner pattern. Regression test on the
sold-derivation helper. Separately REPORT (do not auto-price) the products whose `base_price`
itself is $0 — Solo, Girls Trip, Don't Mind Me, Love Birds, Saguaro, Graze Daze, and the second
Solo — Margaret must price them; surface them in the same warning chip.

### 2b. blog_posts: admins cannot create drafts (RLS)

Finding: `POST /api/admin/blog` with `status:'draft'` → 500, Postgres 42501 "new row violates
row-level security policy for table blog_posts"; `status:'published'` → 201. Cause:
`blog_posts` has INSERT/UPDATE/DELETE admin policies but NO admin SELECT policy (only
`status='published'`), so the insert's RETURNING fails for drafts — and the admin list cannot
show drafts at all. `testimonials` already has the correct pattern (`testimonials_admin_read_all`).

Build: migration adding `blog_posts_admin_read_all` SELECT policy `USING (is_admin_or_artist())`.
Verify: draft create 201 via UI, drafts visible in `/admin/blog`, public still sees only
published. Also drop the duplicate legacy SELECT policy ("Public can read published blog posts"
exists twice) in the same migration. Add a route test for draft create.

## Phase 3 — Cohort courses (feature; P1 for the course product line)

Finding: course_type allows only `on_demand` (evergreen) / `live` / `hybrid` — both the DB check
constraint and the builder dropdown. Requirement: evergreen, cohort, and live must all be
sellable.

Build additively: migration extends the check constraint with `'cohort'`; `courses` gains
nullable `cohort_starts_at`, `cohort_ends_at`, `enrollment_opens_at`, `enrollment_closes_at`;
builder UI shows the four fields when type=cohort (datetime-local, stored UTC, displayed in
site timezone); catalog + course detail render a cohort badge with start date and an
"Enrollment closes …" line; enrollment API rejects (friendly copy) when outside the enrollment
window or after cohort end; catalog "Filter by format" gains Cohort. Tests: constraint accepts
cohort; enroll inside window passes, outside fails with the friendly message; on_demand/live
behavior unchanged. No stub UI: every rendered control must function.

## Phase 4 — UX and integrity items (P2)

1. **AK/HI surcharge quotes $0.00 for originals** — cart quote for ZIP 99501 on an original
   returned "Alaska shipping surcharge: $0.00" (original variants carry no
   `worst_case_shipping`). Decide with Skylar: either a per-original flat AK/HI surcharge
   setting in site_settings, or copy that says AK/HI shipping is quoted after purchase by
   email. Implement the chosen path; never display a $0.00 surcharge line.
2. **Campaign validation toast leaks Zod copy** — "Too small: expected string to have >=1
   characters" when subject is empty. Map validation issues to friendly field-level messages
   ("Subject line is required.") via the existing friendly-error dictionary.
3. **Commission wizard step 3** — budget/timeline submit as empty strings. Either require a
   selection or store NULL + label the step optional. Pick one; empty-string enums in rows are
   not acceptable.
4. **Funnel pages have no h1** — the three funnel templates render the artwork title outside an
   h1; product funnel pages (`/art/[slug]`) and home have empty h1s. Add proper h1s (SEO) without
   design changes.
5. **"You May Also Like" shows $0.00 products** — exclude products with no sellable price from
   recommendation rails until priced.
6. **Watch item, no code yet**: `/cv.pdf` returned one transient 404 during the sweep, 200 on
   every retest. Add it to the LAUNCH-CHECKLIST verification list.
7. **Social autopublish** is Phase-2-by-design (email reminder fallback runs; documented in
   `api/cron/social-publish`). Leave as is; keep the flag off; no stub UI is exposed. Confirm the
   composer never promises direct publishing anywhere in copy.

## Phase 4b — Retest-round findings (2026-07-30; hot-fixes applied, finish the class)

The webhook retest surfaced two more platform bugs. Both were hot-fixed in prod via MCP with
migrations committed (`2026073001`, `2026073002`) and re-proven live. Finish the remaining work:

1. **F13 — class_bookings.payment_method CHECK rejected 'stripe'** (webhook's paid-flip silently
   failed; paid bookings sat awaiting_payment until the expiry cron CANCELLED them). Constraint
   extended to venmo/zelle/other/stripe/comp and re-proven (booking now paid/stripe). REMAINING:
   the webhook's class-booking branch destructures `{ data }` and ignores `error` — surface DB
   errors there (log + owner alert per the silent-side-write standard) and add a regression test
   that a constraint violation cannot pass silently. Also reconcile any booking stuck
   awaiting_payment whose Stripe session is paid (the 1a sweep should cover bookings — verify).
2. **F14 — admin-blind RLS: 24 tables have admin WRITE policies but no admin SELECT policy.**
   Where an admin surface reads with the user-scoped client and the public SELECT policy is
   restrictive, admins see nothing: /admin/orders showed "No orders found" while Order #1
   existed (buyer could see it; admin could not). Hot-fixed: orders, order_items, enrollments,
   blog_posts. REMAINING: one migration adding `<table>_admin_read_all` SELECT policies
   (`USING (is_admin_or_artist())`) to the other 20: bio_credentials_block, categories,
   change_requests, course_modules, courses, email_automation_steps, email_automations,
   email_campaigns, email_sends, email_templates, faqs, lessons, page_blocks, pages,
   product_categories, product_images, product_variants, products, site_content,
   testimonial_media. Add the factory gate check (rls audit) asserting: any table with an
   is_admin write policy must carry an is_admin (or equivalent) SELECT policy.
3. **Admin refund button**: the refund chain was proven via Stripe API → `charge.refunded`
   webhook → order auto-flipped to refunded. Click-verify the admin UI refund control once and
   add it to the launch checklist Step 9.

## Phase 5 — Permanent guards

1. `scripts/check-stripe-webhooks.mjs`: given `STRIPE_SECRET_KEY[_TEST]`, list webhook endpoints
   and assert an enabled endpoint for `<NEXT_PUBLIC_SITE_URL>/api/webhooks/stripe` exists in the
   active mode with the required events; print the endpoint id + last delivery status. Wire into
   LAUNCH-CHECKLIST Step 2B and the go-live runbook.
2. Extend `audit/LAUNCH-NIGHT` checklist: Step 7 buys must verify `webhook_logs` row +
   `side_effects_completed_at` on the order, not just the confirmation page.
3. `BUILD_LOG.md` entry per phase with evidence links; STATE.md "Current truth" block updated at
   the end. Re-run `npm run build-check:write` natively for the status block.
