# STATE — Margaret-Edmondson

Authored by DotWin
Last updated: 2026-09-17 17:30 UTC (door OPEN since 16:06 UTC; print-quote resilience + slug redirects + crop revert live at c7c89d7; storage upload cap and dependency audit owed to people)
Baseline SHA: `0815f78` (adopt conformance import, committed). The rebuild is commits
`52a406b..0988e4c` on `origin/main`. Full record: `audit/BUILDER-REBUILD-LOG.md`.
Supabase prod: `klwkajukicsoiwpsgftt` · GitHub: DotWinHoldco/Margaret-Edmondson

> **Current truth (2026-09-17 17:30 UTC, session e37c5a7c) — THE CONFIGURATOR DOOR IS OPEN (owner flipped it 16:06 UTC; site password gate still ON). main = c7c89d7 (PR #20), production deploy READY at that SHA. Blueprint `docs/blueprints/2026-09-17-print-quote-resilience.md` (closed); the catalog program blueprint `2026-09-16-full-catalog.md` is closed too — its human gates live here, not in a unit.**
> What broke when the door opened, and what now stands: (1) "Our print partner is busy" on every print page within a minute
> was OUR key-wide request budget refusing public quotes on a 7-row price cache (LumaPrints never called). Now a pricing
> warmer prices every offered print type × size before a shopper asks — cron `/api/cron/pricing-warm` every 5 min, leased,
> paced one size per 25 s under a reserve that keeps shopper slots, plus "Price sizes now" and a readiness line on the
> Settings card (`GET/POST /api/admin/catalog/warm`); cache life 72 h; a stale answer never ships with free freight; a budget
> refusal carries its window reset (`retryAfterMs`, `Retry-After`) and the page retries along a one-minute ladder ("Checking
> the price…") before any error copy; the log names the refusing class. Surface today: 197 sizes; cold fill ≈ 100 minutes
> from the first tick after this deploy — watch `missing` fall on the Settings card. (2) `/shop/art/think-again` 404'd because
> the slug was renamed 09-14 and the homepage tile snapshotted it: `product_slug_redirects` (trigger on every rename, readable
> only while the product is sellable; six old slugs backfilled) → 308 on the product page; featured tiles take slug/title from
> the live row. (3) Print-master crops: a failed re-crop no longer un-shelves the product (the previous print file stays in
> service, the failure is recorded), the upload error names the storage answer + size, and "Revert to original" in the crop
> editor (`POST /api/admin/master-artworks/[id]/crop/revert`) always restores the uncropped master. Keepsake (failed 09-15)
> and The Dual (failed 09-17) were restored to `ready` on their previous files.
> OWED TO PEOPLE (in order): (a) Supabase dashboard → Project Settings → Storage → raise the upload file size limit (default
> 50 MB caps every bucket; The Dual's crop is a 62 MP PNG, Keepsake's 130 MP; the bucket itself allows 500 MB) — then re-save
> those two crops; (b) the CI `Dependency audit` step is red on every main run today: Next.js image-optimization RCE advisory
> (GHSA-2xp9-vwfh-vxw4, needs next@16.3.5), sharp < 0.35.4, sanitize-html — a dependency unit of its own, soon; (c) the
> catalog program's human gates unchanged: V7.2 dashboard cost comparison, V7.5 billing address + card on the production
> LumaPrints account, V7.9 real QC order, per-medium margins (§11), the two 2% overrides and five duplicate variant groups,
> a Print Catalog screenshot for help article 06a, the Supabase redirect allowlist for preview Google sign-in. Framed canvas
> offers only the 1.25in Black frame today: Oak/Walnut are switched off in Print Catalog; the 0.75in and 1.50in print types
> (white, silver, gold, barnwood, espresso, maple) are off entirely.
> Production DB migrations added today: 20260917130000 (`product_slug_redirects` + trigger + backfill) and 20260917140000
> (sellable-only read policy, `search_path=''`). Known pre-existing gap, not touched: `sold` products are invisible to
> anonymous readers (products policy is `status='active'` only), so a sold original's page and redirect 404 for shoppers.
> Verify at c7c89d7: build-check GREEN (15/15) · vitest 116 files / 1078 passed / 7 pre-existing skips · security pass 11
> findings, 8 fixed, 3 refuted with live evidence (blueprint Examine).
> SECOND UNIT, same session (blueprint `2026-09-17-size-depth-control.md`): a size now says which print types (depths) it
> is sold in — "Sold in" switches per size on the product page (`product_variants.excluded_subcategory_ids`, migration
> 20260917150000, live), honoured by the storefront, the public quote route (404), checkout (409), the warmer and the
> coverage report; family headers read "Canvas" / "Framed Canvas" / "Fine Art Paper" with the print types listed beneath;
> a size chip shows a price only under the depth it was priced for. What the depth means: 1.50in is the canvas edge
> (stretcher-bar depth), matched by the floater frame; frame colours are the options under each depth. This session
> reached the governor's usage ceiling during that unit (the security pass was refused; examined inline, receipts in the
> blueprint) — the NEXT session must be fresh.
> Owner flags: two Live variants carry a 2% margin override (Flower Power 20x20 paper, Think Again 12x9 canvas);
> production has 5 duplicate (product, medium, size) variant groups (clean before adding the unique index);
> a Print Catalog screenshot for the new help article is owed.
> Preview facts (fixed 2026-09-17): sign-in flows now return to the current origin (`authOrigin`), and previews read the
> production-host catalog rows (`CATALOG_READ_HOST=us.api.lumaprints.com` on Vercel preview; production ignores it).
> Supabase's redirect allowlist still needs `https://*-dotwinholdcos-projects.vercel.app/**` for Google sign-in on previews (dashboard, owner).
> Ops: the wave used 9 of the 12-agent budget (5 executors, 2 security reviewers, 1 more executor for P9, 1 for P8);
> `.cowork-transfer/`, `supabase/.temp/` and `*.cookie` are now ignored.

> **Current truth (2026-08-01 later) — OWNER LAUNCH SEQUENCE + ADMIN-CONTROLLED GATE SHIPPED (`55a6506`), live-verified.**
> The password gate is now DB-driven: `site_settings.gate_enabled/gate_password/gate_secret/
> gate_cookie_hours` (mig `2026080101`), read by `src/lib/gate/config.ts` (service-role PostgREST,
> 30s stale-while-error cache, env-var fallback only on cold failure) from BOTH `src/proxy.ts` and
> `/api/gate`. Secrets seeded operationally (NOT in git); the seeded token hash equals the pre-change
> cookie, so existing gate sessions carried over with zero interruption (verified live).
> **Settings → Site access**: gate on/off + password + cookie duration (Margaret can re-gate later).
> **Launch modal** on the admin dashboard (`LaunchSequence.tsx` + `/api/admin/launch`): 5 prep steps
> (Lumaprints login → permanent card+billing address → crop review → prices → margins at all 4
> levels) + GO LIVE. Hideable (floating pill); state in `site_settings.launch_checklist`.
> **Enforcement is server-side**: `/api/admin/settings/gate` refuses `enabled:false` until all 5 prep
> steps are done (verified live: 409 LAUNCH_INCOMPLETE with the missing list, then success after).
> Lumaprints credentials are served ONLY via the admin API from `launch_notes` (seeded, not in git,
> not in client bundles). Per Skylar: Margaret must NOT change the Lumaprints email/password until the
> first real-card purchase is verified (the modal says exactly this); card+address go in NOW.
> **/admin/print-review**: live crop gallery (39/39 print-ready, full-frame chips, per-piece editor
> links + how-to-recrop incl. "prints pause while the print file rebuilds").
> LIVE-VERIFIED end to end with a temp admin (since deleted): gate page/pass/401s, DB-driven cookie
> duration (48h→Max-Age 172800 observed, restored 720), step persistence, modal/pill/settings-card/
> print-review rendering (0 console errors), and the FULL go-live loop: steps done → gate off →
> homepage truly public at the edge → re-gated → checklist reset to `{}` for Margaret's real run.
> ProjectHubClient note: the hub bounces browsers without `artbyme_welcome_dismissed` localStorage to
> /welcome — the modal shows after the welcome letter, by design.
> LAUNCH-CHECKLIST.md Step 10 rewritten: go-live is now the in-admin switch; deleting
> SITE_PASSWORD/SITE_AUTH_SECRET env vars is optional (fallback only).

> **Current truth (2026-08-01) — FULL PURCHASE→PRINT CHAIN PROVEN END TO END (sandbox order 10000337514).**
> A real test purchase was driven through the live storefront (Stripe TEST, embedded intent, card
> confirmed via API, $52.75 canvas 6×12 of "The Dual"). The platform did all of it unaided:
> `payment_intent.succeeded` → **order #4 created** with shipping address → order_item carrying the
> correct purchase-time print snapshot (medium=canvas, 6×12, subcategory 101002, options [2,11],
> print_storage_path=masters/cactuses/the-dual.jpg) → **fulfillment auto-attempted 7 seconds later**.
> That auto-attempt FAILED only because `LUMAPRINTS_BASE_URL` had been set to the DASHBOARD host
> without a scheme (`sandbox.lumaprints.com`) → "Failed to parse URL". The correct API host is
> `https://us.api-sandbox.lumaprints.com`. The trigger wiring is therefore PROVEN.
> The submit was then completed by running the REAL `routeOrderToFulfillment()` from
> `src/lib/fulfillment/router.ts` locally (tsx, service-role client, sandbox LumaPrints env in-shell
> only, `suppressFailureAlert:true`) against that same real order: **LumaPrints order 10000337514**,
> `order_items.fulfillment_status='submitted'`, `external_order_id=10000337514`. Read-back confirms
> storeId 82222, externalId = the real order_item id, recipient = the real shipping address,
> 6.00×12.00 in, options Mirror Wrap + Sawtooth + Matte, image = OUR cropped print master.
> RESTORED AFTER THE TEST: `LUMAPRINTS_BASE_URL` DELETED from Vercel (production host again);
> production LUMAPRINTS_API_KEY/SECRET/STORE_ID were NEVER touched (still 2026-05-15); Stripe back to
> `stripe_test_mode=false` (LIVE); test order + snapshot deleted (0 orders, 0 zero-item orders).
> NOTE: Vercel injects these env vars at runtime — the added var took effect with no redeploy, so the
> delete propagates the same way; redeploy only as belt-and-braces.
> REMAINING GO-LIVE ITEM: both sandbox orders sit at **"Pending Payment"**. Production LumaPrints must
> have a default billing address + valid card or real orders park unprinted (LAUNCH-CHECKLIST 2C).

> **Current truth (2026-07-31) — LUMAPRINTS ORDER CREATION FINALLY PROVEN (sandbox order 10000337513).**
> Prior claims that "the sandbox proved the order pipeline" were WRONG. The three `audit/diag/
> sandbox-dryrun-*.json` runs from 2026-07-06 ALL failed at submit: 401, then 400 (webp not a valid
> file type), then 400 ("default billing address of this account has not been configured"). **No
> LumaPrints order had ever been created until now**, which is why the sandbox dashboard was empty.
> TODAY, using the real cropped master + the exact payload `src/lib/fulfillment/router.ts` builds:
> signed URL from the private `print-masters` bucket (fetchable, 206, image/jpeg, 34.5MB) → pricing 200
> ($15.94 for 6×12 canvas) → **checkImageConfig 200 "aspect ratio of the image is the same as the
> ordered size"** → **POST /api/v1/orders 201, orderNumber 10000337513** → read-back confirms
> storeId 82222, subcategory 101002, 6.00×12.00 in, options Mirror Wrap + Sawtooth + Matte, and OUR
> cropped print master as the image. Evidence: `/home/claude/luma/PROOF.json` (session-local).
> SANDBOX CREDS (rotate/keep safe): key = the 56-char string, secret = the 36-char string; the pair
> is `Basic base64(key:secret)`; **storeId 82222** is authoritative from `GET /api/v1/stores` (the
> hex tail embedded in the keys decodes to 1017934, which is NOT the store id and 404s).
> STILL NOT EXERCISED: the deployed fulfillment worker calling this on a real purchase — that needs
> `LUMAPRINTS_BASE_URL=https://us.api-sandbox.lumaprints.com` set in Vercel (this session's tool
> classifier blocked the env write). The payload was mirrored exactly, so only the trigger is unproven.
> GO-LIVE WATCH ITEM: the sandbox order sits at **"Pending Payment"** (sandbox test card). Production
> LumaPrints must have a valid card + default billing address or real orders park the same way
> (LAUNCH-CHECKLIST Step 2C). Aspect/DPI verified in bulk: all 169 live print sizes within 1% aspect
> (worst 0.36%) and ≥200 DPI.

> **Current truth (2026-07-30 later) — GA prep: went LIVE on Stripe (+ fixed a launch-blocking mode bug), priced everything, turned on the print catalog.**
> Commits this round on `origin/main`: `dfc1e0e` (F2 reconcile sweep + F14 remaining-tables admin RLS)
> and `65d4eaf` (Stripe live/test mode fix). Prod deploy = `65d4eaf`, READY.
> **STRIPE IS LIVE**: `site_settings.stripe_test_mode=false`. Proven — a live PaymentIntent was created
> through prod `/api/checkout/intent` (`mode:live`, correct amount) for both a product and a print.
> **Launch-blocking bug found + fixed (`65d4eaf`)**: `src/lib/stripe/index.ts` `readMode()` read
> `site_settings` with the ANON key, but that table has NO anon SELECT policy (admin-only RLS), so the
> read returned null and the mode silently pinned to `'test'` forever — flipping the toggle did nothing.
> Now reads with the service-role key (server-only path), anon kept only as a safe `'test'` fallback.
> **F2 + F14 CLOSED**: reconcile-orders cron deployed + gate-exempt (401 unauth) as the paid-but-no-order
> backstop; admin-read RLS now on all remaining tables (mig `2026073003`). Webhook + cron both reachable
> and gate-exempt in prod.
> **Prices set on everything** (no active sellable left at $0): 5 prints → $35 base; Graze Daze ORIGINAL
> → $450 (FLAG: inventory said TBD, Margaret to confirm); course "Mixed Media Foundations" → $79 (FLAG:
> was null = accidentally free); 2 custom-portrait SAMPLES (Dog and Daughter, Family Gift Painting)
> archived per inventory ("samples are not products"). Classes already priced.
> **Print catalog turned ON**: generated + priced (default margin, ~52% gross) Paper + Canvas S/M/L for
> the active Lumaprints pieces via the real admin endpoints — **37/39 now sell prints (160 live sizes)**.
> Was 0 before (no print variants existed anywhere; prints-only pieces showed "This piece has sold").
> Still print-blocked, need Margaret: **Due Date** (master too low-res for any standard size) and
> **Road Trip** (no master_artwork attached). Both still sell as originals / list fine.
> **Crops**: all 39 masters `print_status=ready`; before/after review gallery delivered + persisted as a
> desktop artifact (`artbyme-print-review`). **Owner's guide** (docx+pdf, Skylar voice) delivered.
> Temp admin `smoke-test@holdco.win` was recreated (auth.users insert + bcrypt) to drive variant
> generation, then deleted. REMAINING HUMAN CHECK: confirm the LIVE Stripe webhook endpoint is
> registered in Margaret's dashboard with a matching `STRIPE_WEBHOOK_SECRET` (F2 sweep backstops it).

> **Current truth (2026-07-30) — full-platform smoke test + money-path retest DONE; money flow proven end-to-end (Stripe test mode).**
> A cloud smoke test (Playwright vs prod, password-gated, Stripe TEST) click-tested the whole
> platform three levels deep with backend verification for every claim. Evidence report:
> `audit/SMOKE-TEST-2026-07-28/ArtByME-Smoke-Test-Report-2026-07-30.html`. **NEXT-AGENT BUILD SPEC:
> `audit/SMOKE-TEST-2026-07-28/REMEDIATION-BUILD.md`** (single phased prompt; also at repo root on the
> build machine as the gitignored `claude-code-prompt__smoke-test-remediation.md`). Read it before
> touching the money path, RLS, courses, or classes.
> FIXED LIVE this round (migrations committed + applied to prod, re-proven): **F1** Stripe TEST webhook
> endpoint created (`we_1Tyfvf…`) + `STRIPE_WEBHOOK_SECRET_TEST` set → a hosted test purchase writes
> Order #1 → order_items → self-ship fulfillment auto-submit → inventory 1→0 → buyer account →
> confirmation + welcome emails → admin order view → Stripe refund → order auto-flips to refunded;
> **F4** all 21 originals repriced from $0 to `base_price` (were all showing SOLD); **F13**
> `class_bookings.payment_method` now allows `stripe` (mig `2026073001`) — paid bookings were silently
> stranded before; **F14** admin SELECT RLS added to orders/order_items/enrollments/blog_posts (mig
> `2026073002`) — admin Orders showed "No orders found" before.
> STILL OPEN (need a human value or decision — cannot be done from the sandbox): **F3** embedded on-site
> checkout needs `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` (in no Vercel env, no on-disk `.env`, not
> derivable from the secret key — Stripe dashboard → Test mode → API keys); **F2** paid-but-no-order
> reconciliation sweep; **F5** 8 products have `base_price=0` (Margaret must price); **F14** 20 more
> tables still need admin-read RLS (list in the build spec); **F7** cohort course type; plus F9/F10/F11.
> LumaPrints: prod keys valid against the live pricing API, exact submit payload + real signed
> print-master PNG (4800×3600 @ 400 DPI, aspect-matched to 12×9 Mirror Wrap) verified, worker fires on
> real orders — a live print submission (201) was NOT exercised (needs sandbox keys or sign-off to print
> a real canvas). All ZZ-TEST data cleaned up; only the 3 real accounts remain; Poolside inventory
> restored to 1.

> **Current truth (2026-07-06) — LAUNCH NIGHT: sandbox-verified fulfillment + Mirror Wrap fix + US-only checkout.**
> All payment phases are merged AND deployed (prod = main `0947183`); the PHASE-5 runbook's deploy
> half is obsolete. Live LumaPrints sandbox probes (store 82222) closed three KNOWN_RISKS items:
> duplicate submits are rejected 409 on the same externalId (worker auto-retry is safe), fractional
> 0.05in sizes price AND submit (7.5×10 → $16.06, 201), and live bounds/DPI now replace the stale
> seed in `subcategory-bounds.ts`. CRITICAL find: implicit/empty `orderItemOptions` resolve to
> Image Wrap (option 1), which demands +3.75in bleed per axis and 406s every aspect-exact padded
> master — i.e. zero prints would ever have shipped. Canvas Border is now pinned to Mirror Wrap
> (2) in `wholesale-lookup.ts`, `mediums.ts`, the sync route seeds, `lumaprints_mediums.option_ids`
> (applied to prod: `{2,11}`/`{27,2,28}`/`{2,19}`), and tests; price-neutral (verified). Checkout
> is US-only (KNOWN_RISKS CA entry → MITIGATED). The stale legacy print draft variant was deleted;
> shipping-policy copy (tsx + `pages.content_html`) is US-only. Store has taken 0 orders ever;
> 39 masters await crops; print catalog starts clean. 2026-07-07: TIFF question ANSWERED —
> LumaPrints rejects `.tif` file URLs outright; the crop worker now emits lossless PNG
> (`print/<id>-<rev>.png`), tests updated; signed private-bucket URL fetch + Mirror Wrap
> validation proven live against a real master. Site is behind the password gate
> (webhooks/crons exempt) — lifting it is go-live step 2b. Remaining human gates:
> `audit/LAUNCH-NIGHT-2026-07-06.md` ·
> evidence: `audit/LAUNCH-VERIFICATION-2026-07-06.md` · Margaret's guide:
> `docs/product-setup-prints.md`.

> **Current truth (2026-07-01) — overnight UX + correctness hardening (branch `harden/overnight-2026-07-01`, restore tag `restore/pre-overnight-2026-07-01` = prod `90e909b`):** A uniform error/success UX now spans the platform. New foundation: `src/lib/errors/friendly.ts` (friendly-error dictionary + `resolveErrorMessage`), `apiFail`/`dbFail` in `src/lib/api/respond.ts` (log real detail, return friendly copy), `src/lib/api/client.ts` (`apiFetch`/`apiSend`/`errorMessage`, typed `ApiError`), an app-wide toast system (`ToastProvider`/`useToast`) + `StatusBanner`, segment `error.tsx`/`loading.tsx` for admin/shop/account/courses/checkout + `global-error.tsx`, and a committed `database.types.ts`. Raw Supabase/Postgres/Stripe/exception text no longer reaches customers or the studio owner; unique-violations return a friendly 409; every save/create/update/delete/upload confirms success loudly and refreshes values. Fixed 42 audited defects (1 P0 fulfillment schema `product_images.position`→`sort_order`; tax-safe hosted-checkout reconciliation; New Product create; FAQ write columns; subscribers ordering; commission messages table; class/course slug dedupe; v2–v6 newsletter forms now actually subscribe; campaign send persists unsaved edits; refund no-op warning; Printful terminal states; brand casing; +more) plus 6 adversarial-review fixes. No DB migrations (all schema fixes were code-side). Full `build-check` GREEN. Record: `audit/OVERNIGHT-2026-07-01-PLAN.md`.

> **Current truth (2026-06-29) — payment remediation Phases 0–5 implemented:** the full E2E fix plan
> is `audit/PAYMENT-E2E-REMEDIATION-PLAN.md`. **Phases 0–1** (money correctness + privacy, G2
> accounts) are DEPLOYED to prod (`main` @ `32f34d0`; migrations 2026062800 + 2026062801). **Phases
> 2–5** (fulfillment-reliability queue, G4 aspect/DPI safety, tracking/webhook hardening, live-test
> harness) are now IMPLEMENTED + COMMITTED on stacked branches `fix/payment-p2..p5` (off `4ec2999`),
> verified in-sandbox (tsc + lint + DotWin JS gates + unit logic). Migration `2026062900_fulfillment_jobs`
> is already applied to prod. NOT yet pushed/merged/deployed: the Cowork sandbox cannot push to GitHub
> or run `vitest`/`next build`, so CI is the authoritative GREEN and the human pushes + merges + deploys
> in branch order. **Next step: `audit/PHASE-5-GO-LIVE-RUNBOOK.md`** (deploy sequence + human prereqs +
> live test).

> **Current truth (2026-06-25):** the print variant system + admin product builder + storefront
> + LumaPrints ordering pipeline are rebuilt for true-to-aspect custom print sizing. Migrations
> 2026061601/02/03 applied to prod (844 legacy print variants retired, 22 originals kept). Gate
> green (typecheck/lint/build/test 130 passed), advisors 0 new criticals. Go-live is HUMAN-gated:
> set LumaPrints/CRON env in Vercel, crop each master + run the worker, generate/price/Live the
> variants, run the sandbox dry-run, then authorize the first production order. See the
> "Decisions & human action" section of `audit/BUILDER-REBUILD-LOG.md`.

<!-- dotwin:build-status:begin -->
## Current Build Status

Status: green
Last verified: 2026-09-17T17:28:33.294Z
Last command: build-check --green
Gates passed: 14/14 required
Failing gates: none
Unrun required gates: none
<!-- dotwin:build-status:end -->

> The status block above is the LAST native runner verdict (2026-06-22). This run is
> behavior-preserving (dev scripts + `src/contracts` + audit docs + a skipped test; no app runtime
> code changed), so the prior green still holds for the app. It is refreshed only by re-running
> `npm run build-check:write` natively, which now also writes `mode: adopt` into the baseline.

> First thing read each session. Current-only, not history. History: `BUILD_LOG.md`,
> `audit/ADOPT-2026-06-24/`, `audit/ADOPT-2026-06-21/`. Green is whatever `npm run build-check`
> prints, never hand-set.

## 1. What is the project?
ArtByME — Margaret Edmondson e-commerce art store + LMS + CRM/email + page builder/funnels. Next
16.2 (App Router), React 19, TS, Supabase (`@supabase/ssr`), Stripe, Resend, LumaPrints/Printful.
~135 API routes, 7 crons, 5 webhooks, 0 Server Actions (privileged logic in route handlers). No
`src/domains/` cells yet — a route-handler monolith on the factory rails.

## 2. Current build state (domain-cell adopt complete; green-pending native re-cert)
Re-ran the parts of adopt added after the 2026-06-22 green: the domain-cell conformance system.
Rails imported, `src/contracts` authored, `.dotwin/conformance.json` set to `mode: adopt` + ratchet,
Rule 1 / ACID audit done (`#acid-register-2026-06-24`). In-sandbox: typecheck, lint,
`check-rpc-exists` (1 declared tx), all security gates PASS; domain-cell gates skip cleanly (no
cells). `build` + `test` need the native macOS toolchain. Re-run `npm run build-check:write`
natively to refresh the status block + baseline. No green claim until it does.

## 3. What is complete (this run)?
- **Kit delta imported** (dev scripts only, behavior-preserving): 9 new domain-cell gates +
  `lib/cells.mjs`; 6 updated (`build-check`, `check-docs`, `check-contract`, `check-anchors`,
  `lib/report`, `check-module-isolation` shim); `package.json` `check:*` scripts; `check:modules`
  → `check:domains`.
- **`src/contracts/`** from the real 73-table schema: `domain-map.ts`, `table-ownership.ts`,
  `transaction-registry.ts` (`record_order_for_contact` declared; `check-rpc-exists` verifies its
  touches), `event-registry.ts`.
- **`.dotwin/conformance.json`** → `mode: adopt` + `ratchet` (hybrid enforcement).
- **Audit packet** `audit/ADOPT-2026-06-24/`: ACID register, per-boundary score, staged plan,
  domain map + collisions.
- **Regression test** `test/acid-transaction-owners.test.ts` (atomicity of the declared tx owner).

## 4. What is incomplete? (to re-certify green)
- **Run `npm run build-check:write` natively** (build + test + all gates in adopt mode) to refresh
  the status block and rewrite `.dotwin/conformance.json` with the new green commit + `mode: adopt`.
- **Commit + push** this run's staged files (sandbox cannot write `.git`).
- Optional follow-ups (non-blocking): the 4 P2 staged owner RPCs (`STAGED-REFACTOR-PLAN.md`);
  generate `database.types.ts`; clear 5 advisory `: any` + 296 advisory non-route doc findings.

## 5. What is blocked?
- Native `build` + `test`: sandbox `node_modules` are macOS-arm64; run on the user machine or CI.
- Git writes from the sandbox blocked (`.git` EPERM on the mount); the user commits + pushes.

## 6. What is unsafe or unresolved? (open risk)
- **No P0/P1.** 4 P2 atomicity-of-record gaps, each reconciled today and staged to a consolidating
  RPC (`#acid-register-2026-06-24`): ACID-1 webhook order write, ACID-2 fulfillment finalize,
  ACID-3 admin course-delete cascade, ACID-4 AI testimonial duplicate. Dated exceptions in
  `KNOWN_RISKS.md`. None release-blocking.
- Advisory only: 5 `: any`; 296 non-route exported symbols without doc comments. See `KNOWN_RISKS.md`.

## 7. What modules exist?
auth/authz · admin · account/LMS · shop/checkout/cart · Stripe webhooks · fulfillment · discounts ·
CRM · email/newsletter · crons (7) · meta pixel/CAPI · page builder · funnels · storage · RLS.
Declared as 17 domain areas in `src/contracts/domain-map.ts` (not yet folder-enforced).

## 8. Current module / focus
Native `build-check:write` re-cert (adopt mode), then commit + push. After that, Stage 1 of
`audit/ADOPT-2026-06-24/STAGED-REFACTOR-PLAN.md` (the 4 P2 owner RPCs) when scheduled.

## 9. Last commands run
`tsc --noEmit` (PASS) · `eslint src/contracts` (PASS) · `check-rpc-exists` (PASS, 1 declared tx) ·
`build-check --tier=pre` (custom + domain gates; domain gates skip; state tags resolve).

## 10/11. Checks passed / failed (in-sandbox, 2026-06-24)
PASS: typecheck, lint, secrets, security (5 advisory `: any`), supabase-boundaries, authz, rls
(0 blocking; 4 advisory permissive-read), migrations (47 files), rpc-exists (1 declared), anchors,
state, docs (0 blocking; 296 advisory).
SKIP (optional, no `src/domains/`): domain-isolation, contract, read-boundary, table-ownership,
atomicity, event-boundaries, no-duplicate-transactions.
NOT RUN here (native/CI): `vitest`, `next build`, full `build-check:write`.

## 12. Tags for deeper context
`#adopt-domain-cell-2026-06-24` -> `BUILD_LOG.md` (this run: kit delta, contracts, conformance mode)
`#acid-register-2026-06-24` -> `audit/ADOPT-2026-06-24/ACID-REGISTER.md` (Rule 1 audit; 0 P0/P1, 4 P2)
`#domain-cell-conformance` -> the adopt protocol this run implements
`#adopt-green-push-2026-06-22` -> `BUILD_LOG.md` (select-star, webhooks, rls, route docs)
`#harden-2026-06-22` -> `BUILD_LOG.md` (P0 + 7 P1 money path + comms)
`#findings` -> `audit/ADOPT-2026-06-21/FINDINGS.md`
`#migration-drift` -> prod has 2026061501-05 applied but unrecorded
`#proxy-not-middleware` -> middleware is `src/proxy.ts` (Next 16); do not create middleware.ts
