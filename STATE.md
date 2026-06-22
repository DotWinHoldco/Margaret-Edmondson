# STATE — Margaret-Edmondson

Authored by DotWin
Last updated: 2026-06-22 (adopt green-push: security + docs gates cleared in-sandbox)
Baseline SHA: `4509d69` (adopt rails, on origin/main). Green-push changes are staged on top and
UNCOMMITTED. See BUILD_LOG `#adopt-green-push-2026-06-22`.
Supabase prod: `klwkajukicsoiwpsgftt` · GitHub: DotWinHoldco/Margaret-Edmondson

<!-- dotwin:build-status:begin -->
## Current Build Status

Status: failed
Last verified: 2026-06-22T18:20:14.631Z
Last command: build-check --green
Gates passed: 6/11 required
Failing gates: security, supabase-boundaries, authz, rls, docs
Unrun required gates: none
<!-- dotwin:build-status:end -->

> The status block above is the LAST runner verdict (before the green-push). The 5 gates it lists
> as failing are now resolved in-sandbox (see section 10/11). It is stale until you re-run
> `npm run build-check:write` natively, which is the only thing that may rewrite it. Expected: green.

> First thing read each session. Current-only, not history. History: `BUILD_LOG.md`,
> `audit/ADOPT-2026-06-21/`. Green is whatever `npm run build-check` prints, never hand-set.

## 1. What is the project?
ArtByME — Margaret Edmondson e-commerce art store + LMS + CRM/email + page builder/funnels. Next
16.2 (App Router), React 19, TS, Supabase (`@supabase/ssr`), Stripe, Resend, LumaPrints/Printful.
~130 API routes, 7 crons, 5 webhooks, 0 Server Actions (privileged logic in route handlers).

## 2. Current build state (green-pending native re-certify)
Adopt rails imported and the standards backlog cleared in code. Every gate that runs in the
sandbox now PASSES: typecheck, lint (0 err), secrets, security, supabase-boundaries, authz, rls,
migrations, docs. `build` (next) and `test` (vitest) require the native macOS toolchain; they
passed on the prior native run (2026-06-22). Re-run `npm run build-check:write` natively to
re-certify after the green-push and write `.dotwin/conformance.json`. No green claim until it does.

## 3. What is complete (green-push run)?
- **security**: replaced all 65 `select('*')` with explicit column lists (full prod columns, behavior
  preserved); typecheck surfaced + fixed one latent `commission.messages` access (non-column).
- **supabase-boundaries**: reworded the `OrderConfirmationPoll.tsx` comment that falsely tripped the
  service-role-in-client rule.
- **authz**: hardened shipstation/lumaprints/printful webhook verification to `timingSafeEqual`
  (constant-time + gate-recognized); annotated 9 intentional public-write routes with
  `dotwin-allow:public-write` + reason.
- **rls**: migration `2026062205_adopt_rls_conformance.sql` enables RLS + 4 policies for
  `product_categories` (matching prod), tightens anon insert on `carts` (`profile_id is null`) and
  `unsubscribe_events` (`email is not null`), and makes the `social_posts` admin policy's identity
  dependence explicit. 0 blocking rls findings.
- **docs**: intent doc comments added to all API route handlers (177 → 0 blocking).
- Earlier (adopt-finish): spawn-kit gates, rule pack, KNOWN_RISKS/DEPLOYMENT/SECURITY/TESTING/
  LESSONS/MEMORY_INDEX, docs/api+technical, CI, pre-commit, root error/loading/not-found, RLS
  deny-test. Drift `2026061501-05` verified applied-but-unrecorded on prod.

## 4. What is incomplete? (to certify green)
- **Apply migration `2026062205`** to prod `klwkajukicsoiwpsgftt` (RLS conformance + policy tightenings).
- **Commit + push** the green-push files (sandbox cannot write `.git`).
- **Run `npm run build-check:write` natively** to run build + test + all gates and write
  `.dotwin/conformance.json` (expected: green).
- Optional follow-ups (non-blocking): repair the prod migration ledger for `2026061501-05`;
  generate `database.types.ts`; clear the 5 advisory `: any` and 296 advisory non-route doc
  findings; wire a real commission-messages source.

## 5. What is blocked?
- Native `build` + `test`: sandbox `node_modules` are macOS-arm64; run on the user machine or CI.
- Git writes from the sandbox blocked (`.git` EPERM on the mount); the user commits.

## 6. What is unsafe or unresolved? (open risk)
- **Apply-before-deploy**: migration `2026062205` tightens live policies (carts, unsubscribe_events,
  social_posts) and adds product_categories RLS to git. Apply it and re-test the guest-cart and
  unsubscribe flows on a branch before relying on green.
- Advisory only (non-blocking): 5 `: any` (stripe webhook, a layout, 2 email paths); 296 non-route
  exported functions/components without doc comments; `commission.messages` has no backing column
  (renders empty, behavior preserved). See `KNOWN_RISKS.md`.

## 7. What modules exist?
auth/authz · admin · account/LMS · shop/checkout/cart · Stripe webhooks · fulfillment · discounts ·
CRM · email/newsletter · crons (7) · meta pixel/CAPI · page builder · funnels · storage · RLS.

## 8. Current module / focus
Apply `2026062205`, commit + push, re-run `build-check:write` natively to certify green.

## 9. Last commands run
`tsc --noEmit` (PASS) · `eslint .` (PASS, 54 warn) · `build-check --tier=pre` (all custom gates
PASS) · prod read-only verification (drift + product_categories RLS/policies/grants).

## 10/11. Checks passed / failed (in-sandbox, 2026-06-22 green-push)
PASS: typecheck, lint, secrets, security (5 advisory), supabase-boundaries, authz, rls (0 blocking;
4 advisory public-read), migrations (47 files), docs (0 blocking; 296 advisory), anchors.
SKIP (optional): module-isolation, contract (no `src/modules`). NOT RUN here (native/CI): `vitest`,
`next build`, full `build-check:write`, `.dotwin/conformance.json`.

## 12. Tags for deeper context
`#adopt-green-push-2026-06-22` -> `BUILD_LOG.md` (this run: select-star, webhooks, rls, route docs)
`#adopt-finish-2026-06-22` -> `BUILD_LOG.md` (rails, drift verify)
`#product-categories-rls-in-git` -> `KNOWN_RISKS.md` + migration `2026062205`
`#migration-drift` -> prod has 2026061501-05 applied but unrecorded
`#harden-2026-06-22` -> `BUILD_LOG.md` (P0 + 7 P1 money path + comms)
`#findings` -> `audit/ADOPT-2026-06-21/FINDINGS.md`
`#proxy-not-middleware` -> middleware is `src/proxy.ts` (Next 16); do not create middleware.ts
