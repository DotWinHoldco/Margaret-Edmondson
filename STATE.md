# STATE — Margaret-Edmondson

Authored by DotWin
Last updated: 2026-06-22 (adopt run — harden phase: P0 + 7 P1 fixed, targeted checks passed)
Baseline SHA: `2311869` (audit checkpoint; this harden work is staged on top, see BUILD_LOG #harden-2026-06-22)
Supabase prod: `klwkajukicsoiwpsgftt` · GitHub: DotWinHoldco/Margaret-Edmondson

> First thing read each session. Current-only, not history. History: `audit/ADOPT-2026-06-21/`,
> `BUILD_LOG.md`. No hand-set green status: authoritative `build-check` runner is not imported yet.

## 1. What is the project?
ArtByME — Margaret Edmondson e-commerce art store + LMS + CRM/email + page builder/funnels. Next 16.2
(App Router), React 19, TS, Supabase (@supabase/ssr), Stripe, Resend, LumaPrints/Printful fulfillment.
130 API routes, 7 crons, 5 webhooks, 0 Server Actions (privileged logic in route handlers).

## 2. Current build state (NOT certified green)
Adopt **in progress**. Audit done; **harden of P0 + all 7 P1 done in code** + migrations + regression
tests. Targeted checks PASS here: typecheck 0 errors, lint 0 errors (53 pre-existing warnings), and the
two pure security modules executed (AZ-1 + COM-3, 8/8). `vitest` + `next build` + DB constraint tests
must run native/CI (sandbox node_modules is macOS-arm64). No `green` claim.

## 3. What is complete (this harden run)?
- **FIN-1b (P0)** orders UNIQUE(stripe_payment_intent_id) — migration `2026062201`.
- **FIN-1** order_items UNIQUE(order_id,product_id,variant_id) NULLS NOT DISTINCT + upsert; one-shot
  side-effects gated on atomic `orders.side_effects_completed_at` claim — migration `2026062202` + webhook.
- **FIN-2** fulfillment pre-claim to `submitting` before provider call — migration `2026062203` + router.
- **AZ-1** shared fail-closed `requireCron()` (timingSafeEqual, 503 when unset) across all 7 cron routes.
- **DB-2** newsletter SELECT → `is_admin_or_artist()` — migration `2026062204`.
- **COM-1** List-Unsubscribe + List-Unsubscribe-Post (one-click) in central send path.
- **COM-2** central `isSuppressed()` gate on renderAndSend + abandoned-cart + welcome/post-purchase.
- **COM-3** unsubscribe token: dedicated secret only, fail-closed in prod, no accept-forever branch.
- Prod read-only verified: 0 orders/0 order_items (constraints build clean); P0 latent, not yet live damage.

## 4. What is incomplete? (remaining adopt steps)
- **Apply the 4 migrations to prod** `klwkajukicsoiwpsgftt` and **push** to GitHub (this session = files only;
  see Apply-order in #harden-2026-06-22). Migrations 2026062202/2026062203 MUST ship with their code.
- Reconcile prod←git drift `2026061501..2026061505` (still pending from audit).
- **P2 batch** (AZ-2/3/5, DB-3/5/6/8, FIN-4..8, COM-4/5/6) — not started.
- Import `spawn-kit/` (build-check runner + RLS deny-test harness) → run native `build-check --write-state`.
- Capture prod base schema into git (DB-8); fix stale anon grant in git (FIN-3).

## 5. What is blocked?
- Native `build` + `test` + DB-constraint tests: sandbox can't run them (wrong-platform node_modules /
  multi-minute build). Run on user machine or CI. Not a project defect.
- Local git commit blocked once by a stale `.git/index.lock` — see BUILD_LOG if unresolved.

## 6. What is unsafe or unresolved? (open risk)
- P0 + 7 P1 are **fixed in code but NOT yet enforced on prod** (migrations unapplied, code unpushed).
  Until applied: FIN-1b/FIN-1/FIN-2/DB-2 risks remain live on prod.
- **P2/P3 still open**: zod gaps, rate limits, email HTML escaping (AZ-5), reprice_variants
  search_path+anon (DB-3), class_bookings capacity bypass (DB-5), schema-not-in-git (DB-8), no error
  boundaries (COM-7), root CLAUDE.md AI refs (authorship). See `#findings`.

## 7. What modules exist?
auth/authz · admin · account/LMS · shop/checkout/cart · Stripe webhooks · fulfillment · discounts ·
CRM · email/newsletter · crons (7) · meta pixel/CAPI · page builder · funnels · storage · RLS.

## 8. Current module / focus
Money path + comms hardened. Next up = apply migrations + push, then P2 batch, then spawn-kit import.

## 9. Last commands run
`tsc --noEmit` (pass) · `eslint .` (pass, 53 warn) · `node --experimental-strip-types` AZ-1/COM-3 (8/8) ·
Supabase read-only prod verification (constraints/policies/columns/row-counts).

## 10/11. Checks passed / failed-not-run
PASS: typecheck, lint, AZ-1+COM-3 executable proof. NOT RUN here: vitest (5 new specs authored), next
build, DB constraint/RLS deny tests (guarded spec authored). P0/P1 regression tests authored.

## 12. Tags for deeper context
`#harden-2026-06-22` -> `BUILD_LOG.md` (this run: files, apply-order, decisions)
`#findings` -> `audit/ADOPT-2026-06-21/FINDINGS.md` (master register + P2/P3 backlog)
`#reg-financial` `#reg-comms` `#reg-db` `#reg-identity` -> `audit/ADOPT-2026-06-21/registers/`
`#migration-drift` -> prod behind git `2026061501..2026061505`; apply with the 4 new harden migrations.
`#proxy-not-middleware` -> middleware is `src/proxy.ts` (Next 16); do not create middleware.ts.
