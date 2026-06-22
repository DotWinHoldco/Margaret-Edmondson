# STATE — Margaret-Edmondson

Authored by DotWin
Last updated: 2026-06-22 (adopt finish: factory rails imported, drift verified, JS gates run)
Baseline SHA: `a941169` (harden commit, on origin/main). Adopt-finish file changes are staged on
top and UNCOMMITTED (sandbox cannot write `.git`). See BUILD_LOG `#adopt-finish-2026-06-22`.
Supabase prod: `klwkajukicsoiwpsgftt` · GitHub: DotWinHoldco/Margaret-Edmondson

<!-- dotwin:build-status:begin -->
_Build-status block is written only by `npm run build-check:write` on a native (macOS) toolchain.
Not yet populated. In-sandbox JS gate results as of 2026-06-22 are in section 10/11 and
BUILD_LOG `#adopt-finish-2026-06-22`._
<!-- dotwin:build-status:end -->

> First thing read each session. Current-only, not history. History: `BUILD_LOG.md`,
> `audit/ADOPT-2026-06-21/`. Green is whatever `npm run build-check` prints, never hand-set.

## 1. What is the project?
ArtByME — Margaret Edmondson e-commerce art store + LMS + CRM/email + page builder/funnels. Next
16.2 (App Router), React 19, TS, Supabase (`@supabase/ssr`), Stripe, Resend, LumaPrints/Printful.
~130 API routes, 7 crons, 5 webhooks, 0 Server Actions (privileged logic in route handlers).

## 2. Current build state (NOT certified green)
Adopt finish in progress. Audit + harden (P0 + 7 P1) done and LIVE on prod. Factory rails now
imported: gate scripts, package scripts, RULES/CLAUDE/AGENTS, KNOWN_RISKS/DEPLOYMENT/SECURITY/
TESTING/LESSONS/MEMORY_INDEX, docs/api + docs/technical, CI, pre-commit, root error/loading/
not-found, RLS deny-test. In-sandbox JS gates: typecheck PASS, lint PASS (54 warn),
secrets/migrations/anchors PASS; security/authz/rls/docs FAIL on the open P2 backlog (these are
legacy findings the gates now surface, not regressions from this run). First green needs that
backlog cleared and the full runner run natively. No green claim.

## 3. What is complete (this adopt-finish run)?
- **Push + harden migrations verified live**: local == origin/main; prod ledger has all four of
  `2026062201..2026062204`.
- **Drift 2026061501-05 verified** (read-only): APPLIED on prod (all schema objects present,
  `reprice_variants` uses the 2026061502 gross-margin formula, `royal` rename done) but
  UNRECORDED in the prod migration ledger. Low risk; files are idempotent and in git.
- **spawn-kit gates imported** into `scripts/` (+ `scripts/lib/`); no collisions; project's own
  `check-env.mjs`/`proxy.ts`/`eslint.config.mjs`/`.env.example` left untouched.
- **package.json merged**: `check:*`, `build-check`, `build-check:write`, `verify`; husky added.
- **Rule pack**: `RULES.md`; `CLAUDE.md` + `AGENTS.md` replaced with factory versions (stale
  "ACTIVE BUILD" + AI/prompt references cleared; proxy/branding/Supabase/inventory facts kept).
- **Docs**: KNOWN_RISKS, DEPLOYMENT, SECURITY, TESTING, LESSONS, MEMORY_INDEX, docs/api,
  docs/technical.
- **Boundaries**: root `error/loading/not-found.tsx` (COM-7 partial). RLS deny-test
  `test/rls/unauthorized-write.test.ts` (guarded by `SUPABASE_TEST_URL`).

## 4. What is incomplete? (remaining for first green)
- **Commit + push** the adopt-finish files (sandbox cannot write `.git`).
- **Run `npm run build-check:write` natively** to certify status + write `.dotwin/conformance.json`.
- **Clear the gate backlog for green**: document ~177 route/action handler exports (docs gate);
  replace `select('*')` + `: any` (security, 65 blocking); review permissive anon-insert policies
  on `carts` + `unsubscribe_events` and the `social_posts` predicate (rls); guard or annotate the
  shipstation webhook + intentional public-write routes (authz).
- **Capture prod RLS into git**: migration `2026061501` omits the `product_categories` RLS enable
  + 4 policies that exist on prod (see #product-categories-rls-in-git); generate
  `database.types.ts` (DB-8).
- Optional: repair the prod migration ledger for `2026061501-05`.

## 5. What is blocked?
- Native `build` + `test` + full `build-check`: sandbox `node_modules` are macOS-arm64, so
  `next build` + `vitest` cannot run here. Run on the user machine or CI. Not a project defect.
- Git writes from the sandbox blocked (`.git/index.lock` EPERM on the mount); the user commits.

## 6. What is unsafe or unresolved? (open risk)
- **`product_categories`**: PROD is SAFE (RLS on; admin-only INSERT/UPDATE/DELETE via
  `is_admin_or_artist()`; public SELECT). The GIT migration `2026061501` creates the table with
  NO RLS and NO policies, so a from-zero replay would be world-writable (anon holds full DML
  grants). Fix: a migration that enables RLS + recreates the 4 policies; capture full prod schema
  into git. Tag `#product-categories-rls-in-git`.
- **False positive**: `supabase-boundaries` flags `OrderConfirmationPoll.tsx` critical, but
  service-role is only named in a comment (no import/use). Silence with `// dotwin-allow:
  service-in-client` + reason, or reword the comment.
- **P2/P3 backlog open**: security `select('*')`/`any`, rls permissive public writes, authz
  public writes, zod gaps, rate limits, email HTML escaping (AZ-5), `class_bookings` capacity
  (DB-5). See `#findings`, `KNOWN_RISKS.md`.

## 7. What modules exist?
auth/authz · admin · account/LMS · shop/checkout/cart · Stripe webhooks · fulfillment · discounts ·
CRM · email/newsletter · crons (7) · meta pixel/CAPI · page builder · funnels · storage · RLS.

## 8. Current module / focus
Commit + push the adopt-finish files, then `build-check:write` natively, then work the P2 backlog
toward first green.

## 9. Last commands run
`tsc --noEmit` (PASS) · `eslint .` (PASS, 54 warn) · `node scripts/build-check.mjs --tier=pre`
(FAILED: security/authz/rls/docs) · prod read-only verification (drift objects + `product_categories`
RLS/policies/grants).

## 10/11. Checks passed / failed (in-sandbox JS gates, 2026-06-22)
PASS: typecheck, lint, secrets, migrations (1 medium: no generated types), anchors.
FAIL: security (65 blocking), authz (1 high + mediums), rls (4 blocking), docs (177 blocking of
473). SKIP: module-isolation, contract (no `src/modules`). NOT RUN here (native/CI): `vitest`,
`next build`, full `build-check:write`, `.dotwin/conformance.json`.

## 12. Tags for deeper context
`#adopt-finish-2026-06-22` -> `BUILD_LOG.md` (this run: files, gate results, drift, decisions)
`#product-categories-rls-in-git` -> `KNOWN_RISKS.md` (prod safe, git migration incomplete)
`#migration-drift` -> prod has 2026061501-05 applied but unrecorded; schema RLS not fully in git
`#harden-2026-06-22` -> `BUILD_LOG.md` (P0 + 7 P1 money path + comms)
`#findings` -> `audit/ADOPT-2026-06-21/FINDINGS.md` (master register + P2/P3 backlog)
`#proxy-not-middleware` -> middleware is `src/proxy.ts` (Next 16); do not create middleware.ts
