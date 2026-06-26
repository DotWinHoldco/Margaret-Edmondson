# ACID-Violation Register — Rule 1 Audit (Phase 3)

Authored by DotWin
Date: 2026-06-24 · Baseline: `074ffc8` (post prior-adopt green) · Mode: adopt (hybrid)

The Rule 1 / ACID-invariant audit required by the current adopt process
(`domain-cell-conformance-protocol.md`, phase 3). It scans the REAL code (src/app, src/lib) for
cross-table writes that are not a single declared transaction, because `check-atomicity` only
scans `src/domains/` and this app has none yet. Evidence is machine-derived (a function-scoped
multi-table-write scan, same logic as the gate) then classified by hand and by three independent
review passes.

## Headline

**0 P0. 0 P1.** No torn or duplicate money movement; no non-atomic safety invariant; no
deterministic loss of core records without idempotency or reconciliation. The money paths
(checkout, Stripe webhook order creation, promo redemption, class booking, course enrollment) are
either committed inside a `SECURITY DEFINER` RPC or protected by a unique constraint plus a
status/claim guard. This is consistent with the 2026-06-21 security adopt + 2026-06-22 harden,
which already closed the dangerous money-path defects (oversell, double-submit, duplicate
side-effects). What the Rule 1 lens adds is four **atomicity-of-record** gaps (P2) and a P3
backlog — the Tier-B "one RPC per multi-table invariant" upgrades, none of them stop-ship.

Scan evidence: 28 multi-table-write functions across src/app + src/lib (full list in
`STAGED-REFACTOR-PLAN.md`). The rest of this file classifies them.

## Already atomic / correct (credited, no action)

| Path | Why it is safe |
|---|---|
| Class booking — `classes/[slug]/signup`, `classes/[slug]/checkout` | Seat claim is entirely inside `book_class_session` (locks `class_sessions` FOR UPDATE, capacity-checks, inserts `class_bookings`). No `class_bookings` write outside the RPC. migration `2026060806`. |
| Promo redemption + CRM revenue — Stripe webhook | Inside `record_order_for_contact` (updates `crm_contacts`, inserts `promo_code_redemptions`, increments `promo_codes.usage_count`) — one transaction; single-use unique index; runs at most once per order via the `side_effects_completed_at` claim. Declared in `src/contracts/transaction-registry.ts`. |
| Original-artwork inventory — Stripe webhook | `reserve_original` locks `product_variants` FOR UPDATE and clamps at 0 (no oversell, safe on resume). migration `2026060806`. |
| Course enrollment — `courses/[id]/enroll` (free) | Single `enrollments` insert guarded by existence check + DB `UNIQUE(profile_id, course_id)`. A race loses on the unique index, never duplicates. Paid path writes nothing pre-payment; the webhook upserts with `onConflict` ignoreDuplicates. |
| Discount validation — `discounts/validate`, `lib/discounts/validate.ts` | Read-only `validate_promo_code_public` RPC; mutates nothing. No "validate increments usage" race. |
| Commission create — `commissions` POST | Single `commissions` insert; CRM mirror is a separate atomic RPC in try/catch. `commission_messages` / `commission_milestones` are not written anywhere in code. |

## P2 findings — non-atomic core multi-table writes WITH compensating controls

These do not lose data under partial failure today (idempotency / resume / status-claim makes them
self-correct), but they do not meet Tier B's "one declared transaction owner" standard. Register +
stage to an RPC; do not blind-rewrite live money code. Each carries a dated exception in
`KNOWN_RISKS.md`.

### ACID-1 — Stripe webhook builds an order from sequential PostgREST writes
Files: `src/app/api/webhooks/stripe/route.ts`
- `handleCheckoutCompleted` (L192): writes `orders` (L327), `order_items` (L407, upsert), `carts`
  (L424). Tables CORE.
- `handleElementsPaymentSucceeded` (L559): writes `orders` (L601), `order_items` (L677, upsert),
  `carts` (L694). Tables CORE.

`orders` and `order_items` are two separate PostgREST calls (no wrapping RPC). Compensating
controls present and verified: order dedup on `stripe_checkout_session_id`/`stripe_payment_intent_id`
(unique → 23505 acked), **resume** of an itemless order on the next delivery (L304-313), `order_items`
`onConflict: order_id,product_id,variant_id ignoreDuplicates` (unique index, migration `2026062202`),
and the one-shot `side_effects_completed_at` claim (L445-451). On any error it throws → Stripe
retries → resume completes the order.
- Severity **P2**: the inter-statement window is reconciled by Stripe redelivery, so it is an
  accepted Tier-C-style reconciliation, not a torn write. Residual: if Stripe ever exhausts
  retries on a persistent fault, an order could remain itemless (low-probability, monitored via
  the oversell/`logEvent` alerts).
- Target owner: `create_order_with_items(p jsonb)` — one RPC that inserts the order + all items
  (+ marks the cart converted) atomically. Replaces the sequential writes; keeps the existing
  idempotency keys. Flip the `atomicity` ratchet for `commerce` after it lands with a failure-
  injection test.

### ACID-2 — Fulfillment submit/retry: external call between status writes
Files: `src/lib/fulfillment/router.ts` (`routeOrderToFulfillment` L389/L435/L484;
`retryFulfillmentForItem` L604), reached by `api/fulfillment/submit`, `api/fulfillment/retry/[itemId]`,
and the webhook.
- Writes `order_items` (status) + `webhook_logs` (REC). The FIN-2 single-statement pre-claim
  (`update fulfillment_status='submitting' ... .in(['pending','failed','failed_validation'])`)
  guarantees the provider order fires at most once. Residual: provider order is placed, then a
  crash before `update(status='submitted', external_order_id)` leaves the item in `submitting`
  with a real upstream order and no `external_order_id` — visible + reconcilable, not silent loss.
- Severity **P2** (at-most-once already holds; the gap is finalize-after-call ordering).
- Target owner: `submit_order_item` — persist `external_order_id` and flip status in one
  statement, or store the external id before leaving `submitting`.

### ACID-3 — Admin class/course delete cascade is four unguarded deletes
File: `src/app/api/admin/classes/[id]/route.ts` DELETE (L148): deletes `lessons` (L166),
`course_modules` (L170), `enrollments` (L173), `courses` (L176). All CORE. No idempotency key and
no DB-side cascade in this path.
- A partial failure can orphan `enrollments` (a paid-access record) against a half-deleted course.
  Held at **P2** only because it is admin-only (negligible concurrency) and a re-issued DELETE
  converges the state.
- Target owner: `admin_delete_course(p_course_id)` RPC, or `ON DELETE CASCADE` foreign keys so a
  single `delete courses` cascades. The FK option is the smaller, safer change.

### ACID-4 — AI testimonial import can duplicate on re-run
File: `src/app/api/admin/shared-files/process-ai/route.ts` POST (L211): inserts `testimonials`
(L292, CORE), inserts `testimonial_media` (L315, REC), updates `shared_files.ai_processed` (L329,
the resume flag) — written LAST.
- A crash between the testimonial insert and the flag write leaves `ai_processed=false`, so a
  re-run inserts a SECOND `testimonials` row (no dedupe on `shared_files.id`). Bounded to **P2**:
  admin-only, single-operator, rows are `status:'pending'` (unpublished, no money), duplicate is
  manually deletable.
- Target owner: `create_testimonial_from_ai(p_file_id ...)` that no-ops when `ai_processed` is
  already true; or simply set the `ai_processed` guard FIRST.

## P3 findings — backlog (recoverable-only, or admin low-concurrency CRUD, idempotent enough)

No RPC required; re-saving fully remedies. Listed so the next audit can grep them.

- Admin product create/update (`admin/products[/[id]]`): `products` + `product_variants`
  (+ `product_categories` upsert with unique-index onConflict). Admin-only; idempotent on retry.
- Admin deletes: `categories/[id]` (nulls products then deletes category; FK cascade),
  `classes/[id]/modules/[moduleId]` (lessons then module). Admin-only; self-healing.
- Media side-writes: `products/[id]/images`, `images/from-library` — both tables recoverable;
  `media_library` upsert idempotent.
- `admin/lumaprints/sync`: `lumaprints_mediums` upsert + `lumaprints_pricing_cache` delete
  (cache eviction; re-derives). Declared idempotent.
- `checkout` POST: writes `carts.items` (single overwrite) + `promo_codes.stripe_coupon_id`
  (coupon-id CACHE so a `max_redemptions:1` coupon is reused — an idempotency-PRESERVING write,
  NOT a usage counter, NOT a money movement). No order is created in checkout. **Correctly P3.**
- Engagement CRUD pairing a core write with a `*_audit_log` / `*_media` side-write: `social/posts`
  (POST/PATCH), `feedback` (POST/PATCH), `work-requests` (POST/PATCH), `notes` DELETE. The second
  table is recoverable; torn = missing audit line / cosmetic media mismatch.
- Email campaign send: `email-campaigns/[id]/send` and `cron/email-campaigns-send` — recipients
  upsert (unique `(campaign_id, email_snapshot)` + ignoreDuplicates) and a status-driven queue
  (`.eq('status','queued')` → flip to `sent`). No double-send. Concurrent-cron overlap is the only
  theoretical window → P3 hardening: a `FOR UPDATE SKIP LOCKED` claim RPC.
- Fulfillment + Resend webhooks (`lumaprints`, `printful`, `shipstation`, `resend`): signature/secret
  verified; `order_items` / `crm_contacts` / recipient updates are idempotent convergent state-sets;
  `webhook_logs` append-only. Replay-safe.
- `cron/expire-bookings`: status-guarded `.eq('status','awaiting_payment')` cancel; seat occupancy
  is derived by `COUNT(*)` (no stored counter to desync), so the single-table update is correct.

## Non-ACID observations (fold into fix backlog — not Rule 1 violations)

- **Silent side-writes**: `social/posts/[id]` PATCH (L114, L122) and `process-ai` (L315) `await`
  a `.delete()/.insert()` with no `error` check, converting a torn write into an INVISIBLE one.
  Capture + log these errors.
- **Lumaprints fallback match-key**: `webhooks/lumaprints` retries the `order_items` update keyed
  on `order_id` only when the first (`external_order_id`) update returns a DB error, not when it
  matches zero rows. Display-status nuance on a recoverable/idempotent path; note only.

## Method note

`src/lib/page-editor/server-registry.ts` was the scanner's scariest hit ("7 tables"). It is a
FALSE POSITIVE: four independent per-section adapter `saveSection` handlers, each writing exactly
one table (branched by `sectionKey` with early return). True per-function write set = 1 table.
No cross-table write. Recorded so it is not re-flagged.
