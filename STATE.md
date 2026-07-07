# STATE — Margaret-Edmondson

Authored by DotWin
Last updated: 2026-06-28 (Payment E2E remediation — Phases 0 + 1 shipped + deployed; Phases 2–5 pending)
Baseline SHA: `0815f78` (adopt conformance import, committed). The rebuild is commits
`52a406b..0988e4c` on `origin/main`. Full record: `audit/BUILDER-REBUILD-LOG.md`.
Supabase prod: `klwkajukicsoiwpsgftt` · GitHub: DotWinHoldco/Margaret-Edmondson

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
Last verified: 2026-06-22T21:27:12.930Z
Last command: build-check --green
Gates passed: 11/11 required
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
