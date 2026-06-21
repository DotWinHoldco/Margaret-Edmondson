# STATE — Margaret-Edmondson

Authored by DotWin
Last updated: 2026-06-21 (adopt run, audit phase complete)
Baseline SHA: `5dda51840fbf21f8622e65f34f769bb6efff00ea` (clean tree, local == origin)
Supabase prod: `klwkajukicsoiwpsgftt` · GitHub: DotWinHoldco/Margaret-Edmondson

> This document is the first thing read each session. It is current-only, not history.
> History lives in `audit/ADOPT-2026-06-21/` and is referenced by tag below.
> The build `Status:` line is written only by `build-check --write-state`, never by hand.

## 1. What is the project?
ArtByME — Margaret Edmondson's e-commerce art store + LMS (courses/classes/lessons) + CRM/email
marketing + page builder + sales funnels. Next.js 16.2 (App Router), React 19, TypeScript, Supabase
(@supabase/ssr), Stripe, Resend, fulfillment via LumaPrints/Printful (ShipStation inbound only).
Inventory: 41 marketing pages, 43 admin pages, 130 API route handlers, 7 Vercel crons, 5 webhook
handlers (stripe, lumaprints, printful, resend, shipstation), 42 migration files, 0 Server Actions
(all privileged logic is in route handlers).

## 2. Current build state (NOT certified)
Adopt is **in progress**. Audit phase complete and evidence-backed; **hardening not started**.
Authoritative `build-check` (test + build) has NOT been run — it must run native (user machine / CI)
because the sandbox node_modules is macOS-arm64 and can't run Linux native bindings. No `green`.

## 3. What is complete?
- Phase 0 baseline pinned; full inventory captured.
- Full ultimate audit (phases 0-12) by 4 independent reviewers; detail in `audit/ADOPT-2026-06-21/`.
- Highest-impact findings re-verified against **live prod**.
- Gate evidence (this env): typecheck PASS (0 errors), lint PASS (0 errors / 53 warnings).
- Prior June audit reconciled: A-security and ~19/20 B-payments findings verified FIXED in current code.

## 4. What is incomplete? (the remaining adopt steps)
- **Harden**: fix 1 P0 + 7 P1 (+ P2 batch), one regression test per P0/P1. See
  `audit/ADOPT-2026-06-21/FINDINGS.md` (#findings) for the ordered remediation plan.
- Import `spawn-kit/` (gates, proxy, supabase client trio, guards, helpers, error/loading/not-found,
  ESLint, CI, pre-commit) MERGING not clobbering; merge package scripts.
- Import compact rule pack (`RULES.md`, `CLAUDE.md`, `AGENTS.md`) tuned to project, no AI references.
- Emit `docs/technical/` + `docs/api/`; add `BUILD_LOG.md`, `LESSONS.md`, `MEMORY_INDEX.md`,
  `KNOWN_RISKS.md`.
- Establish conformance: native `build-check --write-state --docs-strict` -> `.dotwin/conformance.json`.

## 5. What is blocked?
- Native `build` + `test` gates: blocked in this sandbox (wrong-platform node_modules; multi-minute
  build exceeds limits). Run on the user's machine or CI. Not a project defect.

## 6. What is unsafe or unresolved? (open risk — fix in harden)
- **P0** `#fin-1b-stripe-pi-unique` — `orders` has no UNIQUE/index on `stripe_payment_intent_id`
  (verified live) -> Stripe retry double-creates order/fulfillment/email on the embedded Elements flow.
- **P1** `#fin-1-order-items-unique` — `order_items` no `(order_id,product_id,variant_id)` unique ->
  side-effects re-run on webhook resume.
- **P1** `#fin-2-fulfillment-dedup` — provider order created before local `submitted` write -> retry
  double-submits to LumaPrints/Printful.
- **P1** `#az-1-cron-secret` — cron auth passes `Bearer undefined` when `CRON_SECRET` unset.
- **P1** `#db-2-newsletter-select` — any authenticated user can read the full newsletter email list.
- **P1** `#com-unsubscribe` — one-click unsubscribe headers never sent; suppression not enforced on
  abandoned-cart/transactional; unsubscribe token secret degrades to a forgeable hardcoded value.
- **P2/P3** — see `#findings` (zod gaps, rate limits, email HTML escaping, `reprice_variants`
  search_path+anon grant, class_bookings capacity bypass, DB-8 schema-not-in-git, no error boundaries,
  root CLAUDE.md AI references).

## 7. What modules exist?
auth/authz · admin dashboard · account/LMS (courses/classes/lessons) · shop/checkout/cart ·
Stripe webhooks · fulfillment (lumaprints/printful) · discounts/promo · CRM · email/newsletter ·
crons (7) · meta pixel/CAPI · page builder · sales funnels · storage (buckets) · RLS policies.

## 8. What module is currently being worked on?
None mid-edit. Next up = **harden**, starting with the money path (FIN-1b, FIN-1, FIN-2).

## 9. What commands were last run?
`git rev-parse HEAD` (5dda518) · `tsc --noEmit` (pass) · `eslint .` (pass, 53 warn) ·
Supabase `get_advisors`/`list_migrations`/`execute_sql` (prod verification) · 4 audit reviewers.

## 10. What checks have passed?
typecheck (0 errors); lint (0 errors); prod-grant verification of FIN-3 (service-role-only on prod).

## 11. What checks have failed / not run?
test + build: NOT run here (native pending). No `build-check` green yet. P0/P1 regression tests: not
yet written.

## 12. Tags for deeper context
`#findings` -> `audit/ADOPT-2026-06-21/FINDINGS.md` (master register + remediation order)
`#reg-identity` -> `audit/ADOPT-2026-06-21/registers/01-identity-authz-ingress.md`
`#reg-db` -> `audit/ADOPT-2026-06-21/registers/02-database-rls-storage.md`
`#reg-financial` -> `audit/ADOPT-2026-06-21/registers/03-financial-integrity.md`
`#reg-comms` -> `audit/ADOPT-2026-06-21/registers/04-comms-crons-reliability-arch.md`
`#migration-drift` -> prod is behind git by `2026061501..2026061505` (margin/category/rename/crop,
non-destructive); apply to prod during harden. `#db-8-schema-not-in-git` -> capture prod base schema.
`#proxy-not-middleware` -> middleware is `src/proxy.ts` (Next 16 rename); do not create middleware.ts.
