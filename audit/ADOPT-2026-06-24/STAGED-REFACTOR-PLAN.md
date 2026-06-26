# Staged Refactor Plan — Toward Tier B

Authored by DotWin
Date: 2026-06-24 · Mode: adopt (hybrid)

The smallest safe steps from today's baseline to Tier B, ordered by invariant risk, never a blind
rewrite. Each step lands one owner or one cell, ships its proving test, then flips its ratchet flag
in `.dotwin/conformance.json` from scored to blocking. Rule 1: never rewrite a money/safety
transaction without a failure-injection test that proves the new path is atomic and the old torn
state can no longer occur.

Nothing here is release-blocking. The app is green today under adopt; this plan is the path to
full Tier B, taken domain by domain instead of in one risky push.

## Ordering principle
Highest invariant risk first, but each step must be behavior-preserving or test-proven. Money and
safety before cosmetics. Consolidation (same writes, now atomic) before decomposition (never
decompose a transaction into events).

## Stage 1 — close the four P2 atomicity-of-record gaps (money/data first)

| # | Step | Owner RPC / change | Proving test | Ratchet to flip |
|---|---|---|---|---|
| 1.1 | Consolidate webhook order write (ACID-1) | `create_order_with_items(p jsonb)` — insert order + all items + mark cart converted in one SECURITY DEFINER tx; keep existing idempotency keys (session/PI unique, item onConflict). Route both webhook handlers through it. | failure-injection: kill between order and items → assert no itemless order; replay → exactly one order, one item set. | `atomicity` (commerce) |
| 1.2 | Make fulfillment finalize atomic (ACID-2) | `submit_order_item` — persist `external_order_id` and flip status in one statement, or store external id before leaving `submitting`. | inject crash after provider call → assert item not stuck without `external_order_id`; retry → at most one provider submit. | `atomicity` (fulfillment) |
| 1.3 | Make course delete atomic (ACID-3) | `admin_delete_course(p_course_id)` RPC, or simpler+safer: add `ON DELETE CASCADE` FKs on `course_modules`/`lessons`/`enrollments` → a single `delete courses` cascades. | delete a course mid-cascade (simulate) → assert no orphan `enrollments`. | `atomicity` (lms) |
| 1.4 | Make AI testimonial import idempotent (ACID-4) | `create_testimonial_from_ai(p_file_id ...)` that no-ops when `ai_processed` is true; OR set the `ai_processed` guard FIRST. | re-run after partial → assert exactly one `testimonials` row. | n/a (idempotency fix) |

After 1.1/1.2/1.3 land with tests, add each to `transaction-registry.ts` with exact `touches`;
`check-rpc-exists` then proves them real, and flip the `atomicity` ratchet for those domains.

## Stage 2 — write boundary at the database (defense in depth)
Add per-domain DB roles + `revoke insert/update/delete` on cross-written tables, so only the
declared `SECURITY DEFINER` owners may cross (`write-boundary-rls.md`). RLS already covers
tenant/row scoping (0 blocking). This adds the role layer the static gate can't. Lower urgency:
single-tenant studio app, RLS already the backstop.

## Stage 3 — context + read boundaries (the src/domains conversion)
Mechanical, behavior-preserving, lowest correctness risk. Convert one area at a time, highest
churn / clearest ownership first. Suggested order by blast-radius and money-proximity:
1. `commerce` (orders, order_items, carts) + `catalog` — pull route logic into
   `src/domains/commerce` + `src/domains/catalog`, add `manifest.ts` (tablePrefix or explicit
   `tables`), `public.ts`, move the webhook's order logic behind the commerce public surface.
2. `crm` + `promo` + `email` — already have the cleanest RPC ownership.
3. `lms` + `classes` — booking/enrollment owners already atomic.
4. `cms`, `social`, `workspace`, `media` — content areas, no money.
Each converted cell makes `check-domain-isolation`, `check-read-boundary`, `check-table-ownership`,
`check-event-boundaries` actually scan (they skip today). Publish `v_<key>_*` views where another
cell needs a foreign read; flip the per-domain ratchet as each cell passes.

## Stage 4 — fold the non-ACID observations
- Capture + log the swallowed side-write errors (`social/posts/[id]` PATCH L114/L122,
  `process-ai` L315) so a torn write is never silent.
- `cron/email-campaigns-send`: add a `FOR UPDATE SKIP LOCKED` claim RPC to close the theoretical
  concurrent-cron double-send window.
- `webhooks/lumaprints`: trigger the `order_id` fallback on zero-row match, not only on DB error.

## How the ratchet moves
`.dotwin/conformance.json.ratchet` starts all-false for the scored gates (no cells yet). As each
stage lands with its test, flip ONLY that domain's flag to true. The ratchet moves toward more
gates blocking, never fewer (`domain-cell-conformance-protocol.md`). Full Tier B is reached when
every domain's flag is true and the always-blocking gates (domain-isolation, contract,
read-boundary, rpc-exists) scan real cells.
