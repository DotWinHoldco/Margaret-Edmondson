# Checkout regression audit, November 5, 2026

Authored by DotWin.

The original-artwork SQLSTATE 42702 failure is repaired in production by
`20261105012156_fix_original_hold_conflict_target.sql`. Both shop checkout
entry points use that function. Festive registrations use their own capability
and PaymentIntent flow; no artwork hold is involved in that class transaction.

The wider audit inspected all 14 Artbyme and 210 shared DOTWIN PL/pgSQL functions
containing an upsert, comparing input/output/local variable names with conflict
targets. It found one additional shared proposal-acceptance bug. That failure
was reproduced with disposable fixtures, fixed in DOTWIN migration
`20261105024108_proposals_checkout_ambiguity_fix`, and verified against the
production schema inside a rolled-back transaction. No actual proposal was
accepted, payment collected, or message sent.

## Checks that now run in the normal test/build gate

- `test/checkout-database.test.ts` runs actual migration functions in isolated
  PostgreSQL (PGlite), including later replacements of the named functions.
- Original reservations: acquire, retry/TTL, competing buyer, release, expiry,
  conversion, webhook replay, sold inventory, missing variants, prints and grants.
- Refunds: restock once; expired payments cannot consume another buyer's hold.
- Festive classes: group pricing, early/day price, token privacy, price tampering,
  invalid paintings, closure, global Stripe mode, matching payment evidence,
  immutable paid status and exactly one pair of durable confirmation records.
- Legacy class bookings: capacity, cancelled-seat reuse and nonexistent sessions.
- Mutation check: restore the original broken conflict target and require the
  real PostgreSQL error `42702`. A mocked RPC would not catch this incident.
- `test/sql-upsert-ambiguity.test.ts` scans active migration definitions for the
  same output/local-variable conflict pattern. This targeted source guard is not
  a general SQL parser or proof against all possible database errors.

The fixture uses PostgreSQL's built-in SHA-256 in place of PGlite's unavailable
pgcrypto extension. Payment, reservation and email-outbox functions themselves
come from the real migrations. No Stripe or email providers are called by tests.
Class test times are relative, so the suite remains useful after November 2026.

## Production evidence and limits

The prior live smoke checks returned HTTP 200 for original-artwork checkout and
festive class checkout in live mode. The artwork test hold was released and its
inventory remained one. Neither test was paid; capability secrets were discarded.
The owner separately confirmed embedded card fields in a normal browser.
See `original-checkout-reservation-fix.md` for deployment and smoke identifiers.

The seven-day shared-platform runtime review showed an October 30 invalid
Stripe excluded-method error. Current adapter code excludes only `klarna`, and
the existing payment-policy regression tests pass; the invalid historical
exclusion is absent. Other logged failures concerned unrelated owner/cron pages.

This audit addresses the reported database failure and critical checkout
invariants. Card declines, network/provider outages and every configuration of
every tenant were not exercised through real paid transactions. No claim of
permanent zero checkout failures is made.

## Workspace and verification record

Owner/task: checkout regression audit. Branch:
`DotWin-cx/margaret-festive-production`. Existing source and artwork are preserved.
Dependencies are reused; PostgreSQL fixtures live in memory. Full checks run in
CI to avoid adding a local Next.js build while internal free space is under 20 GiB.
Retain source/docs; retire only this task's inactive generated test/build output.

Focused database/checkout tests and typecheck pass. Full CI result is recorded
after the release candidate completes. No website rebuild or promotion is needed
for these tests or the shared database-only repair.
