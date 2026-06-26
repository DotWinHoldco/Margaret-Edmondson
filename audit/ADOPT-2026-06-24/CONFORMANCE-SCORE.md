# Per-Boundary Conformance Score — Tier B

Authored by DotWin
Date: 2026-06-24 · Baseline: `074ffc8` · Mode: adopt (hybrid)

How close ArtByME already is to Tier B (`architecture-doctrine.md`, "the five boundaries"), scored
one boundary at a time so the gaps are actionable. Not a single number. Each score is backed by a
gate result or `file:line` evidence.

Legend: ●●●● converted · ●●●○ mostly · ●●○○ partial · ●○○○ minimal · ○○○○ none.

| Boundary | Mechanism (Tier B) | Gate | M-E today | Score |
|---|---|---|---|---|
| Context | folder per domain + manifest + public surface | check-domain-isolation | route-organized monolith; no cells | ●○○○ |
| Write | table ownership by prefix + RLS + per-domain DB role | check-table-ownership + RLS | RLS on all 73 tables (real backstop); ownership declared, not prefix-enforced; no per-domain roles | ●●○○ |
| Transaction | one declared owner, one DB transaction (RPC) | check-rpc-exists / atomicity | 4 real SECURITY DEFINER owners; 1 declared+gated; order-record consolidation staged | ●●●○ |
| Event | events write only recoverable tables | check-event-boundaries | no event bus; inline idempotent side effects on recoverable tables; invariant committed first | ●●●○ |
| Read | published `v_<key>_*` views / public surface | check-read-boundary | direct cross-area `.from().select`; no views | ●○○○ |

The shape is the encouraging part: the **highest-risk boundary (transaction/money) is the most
converted**, because the prior harden already drove the money invariants into RPCs. The least
converted (context, read) are the lowest-risk to leave — they are cosmetic/coupling concerns, not
correctness, and converting them is the mechanical `src/domains/` refactor, not a money rewrite.

## Context — ●○○○ minimal
Tier B wants one folder per business area with a manifest + a single public surface, so the AI
loads one cell to change one area. ArtByME is a Next.js App Router monolith: ~135 route handlers
under `src/app/(admin|marketing)/**` plus shared `src/lib/**`, no `src/domains/`, no manifests.
`check-domain-isolation` skips (no cells). The derived target structure is in `domain-map.ts`
(17 areas). Conversion is the largest, lowest-risk piece of the staged plan.

## Write — ●●○○ partial
Tier B wants table ownership enforced statically (by prefix) AND at the database (RLS + per-domain
role). ArtByME has the database half done well: `check-rls` reports 0 blocking findings, RLS is on
all 73 tables, and that is the unbypassable backstop the doctrine values most
(`write-boundary-rls.md`). The static half is not in place: tables use bare names (no domain
prefix), there are no per-domain DB roles, and `check-table-ownership` skips for lack of cells.
Ownership is now DECLARED in `src/contracts/table-ownership.ts` (every table → owner + core/
recoverable). Enforcing it statically needs either explicit `tables: []` in future manifests or a
prefix migration. Naming collisions recorded: `categories` vs `product_categories`; `orders`/
`order_items` vs `carts`/`wishlist_items` (commerce has no common prefix); `webhook_logs` +
`audit_log` written by several areas by design (recoverable logs).

## Transaction — ●●●○ mostly (the boundary that matters most)
Tier B wants every cross-domain atomic op under one declared owner, one DB transaction.
ArtByME already runs its critical invariants inside `SECURITY DEFINER` RPCs:
- `record_order_for_contact` (crm × promo) — DECLARED in `transaction-registry.ts` and verified by
  `check-rpc-exists` (PASS: body writes exactly the declared touches).
- `book_class_session` (atomic seat claim, FOR UPDATE), `reserve_original` (atomic inventory),
  `upsert_contact_to_list` — same-domain owners, enumerated in the registry comments.
Remaining gap: the Stripe webhook still assembles `orders` + `order_items` from sequential
PostgREST writes (ACID-1, P2) and fulfillment finalizes after the provider call (ACID-2, P2). Both
are reconciled today; both are staged to a consolidating RPC. `check-rpc-exists` is ACTIVE and
blocking; `check-atomicity` is scored until cells land.

## Event — ●●●○ mostly
Tier B wants async work to touch only recoverable tables, never complete an invariant. ArtByME has
no event bus; side effects (CRM revenue, Meta Purchase, emails, fulfillment status) run inline in
webhook/cron handlers, each idempotent (dedupe key / status guard / onConflict). Crucially, the
core order + redemption invariant is committed SYNCHRONOUSLY (RPC + unique constraints) BEFORE any
side effect runs, gated by the `side_effects_completed_at` claim — so no invariant is completed in
an unguarded async flow, which is exactly what the boundary forbids. `event-registry.ts` documents
the three implicit flows. `check-event-boundaries` skips until handler files live in cells.

## Read — ●○○○ minimal
Tier B wants cross-domain reads through published `v_<key>_*` views or a public surface. ArtByME
reads raw tables directly across areas (e.g., the Stripe webhook reads `products`,
`product_variants`, `carts`). No published views. Normal for a monolith; converting is part of the
`src/domains/` refactor and is pure coupling cleanup, no correctness risk. `check-read-boundary`
skips until cells exist.

## What "green under adopt" means here
Adopt does not require Tier B everywhere on day one — it requires the baseline established, the
always-blocking gates enforced, and the data-model gates SCORED with a ratchet
(`domain-cell-gates-spec.md`, "spawn hard, adopt hybrid"). M-E satisfies that: `check-rpc-exists`
is active+passing, the other domain gates are scored (skip without cells), `.dotwin/conformance.json`
is `mode: adopt` with the ratchet, the ACID register has no open P0/P1, and the P2s carry dated
exceptions + staged owners. The ratchet flips toward more blocking as `STAGED-REFACTOR-PLAN.md`
lands, domain by domain.
