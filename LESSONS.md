# Lessons

Authored by DotWin

Every correction becomes a durable one-line rule. Newest first. If a lesson can be enforced by a
gate, add the gate and reference its rule here.

## #idempotency-column-not-status — gate side effects on a dedicated column

Date: 2026-06-22
Module: Stripe webhooks
Why: the audit suggested a `processing -> confirmed` status transition for one-shot side
effects, but the live `orders_status_check` has no `confirmed` value and `status` is
customer-visible, so a status transition would break the constraint and change observable state.
How to apply: gate one-shot side effects on an atomic flip of a dedicated, non-visible column
(`orders.side_effects_completed_at`, NULL to now()). Read the live constraint before coding.
Enforced by: judgment + `test/order-fulfillment-db-invariants.test.ts`.

## #cron-fail-closed — cron auth fails closed, constant-time

Date: 2026-06-22
Module: crons / authz
Why: a cron route with a missing or loosely compared secret is an open mutation boundary.
How to apply: use a shared `requireCron()` with `timingSafeEqual` that returns 503 when
`CRON_SECRET` is unset. Apply it to every cron route.
Enforced by: check-authz (CRON_GUARD) · `test/require-cron.test.ts`.

## #unsubscribe-dedicated-secret — one purpose, one secret, fail closed

Date: 2026-06-22
Module: email
Why: signing unsubscribe tokens with a reused secret (CRON_SECRET/RESEND_API_KEY) let tokens be
forged, and an "accept forever" no-timestamp branch never expired.
How to apply: sign with a dedicated `UNSUBSCRIBE_SECRET`, fail closed in production when unset,
and drop any timestamp-less accept branch.
Enforced by: `test/unsubscribe-hardening.test.ts`.

## #proxy-not-middleware — Next 16 middleware is src/proxy.ts

Date: 2026-06-21
Module: routing
Why: Next 16 renamed middleware to `proxy`. Creating `src/middleware.ts` does nothing, and audit
tools that assume `middleware.ts` raise false positives about an unprotected app.
How to apply: edit `src/proxy.ts` (exports `proxy`). Never create `src/middleware.ts`.
Enforced by: AGENTS.md · judgment.

## #migration-ledger-drift — applying SQL directly leaves the ledger behind

Date: 2026-06-22
Module: deployment / Supabase
Why: `2026061501`–`2026061505` were applied to prod by direct SQL, so the schema is correct but
the migration ledger has no record of them. A from-zero replay would skip them.
How to apply: apply schema through the migration runner, or repair the ledger
(`supabase migration repair --status applied <versions>`) right after a manual apply. Keep
migration files idempotent (`if not exists`, `create or replace`).
Enforced by: check-migrations · judgment.

## Format

### #tag — short rule

Date:
Module:
Why: what went wrong, briefly.
How to apply: the concrete rule to follow next time.
Enforced by: gate · rule (or "judgment" if not yet automatable)
