# Original artwork checkout reservation repair — November 4, 2026

The public on-site checkout and its existing express fallback returned `original_hold_failed` for originals. Production logs show five failures from 2026-11-05 00:04:41 to 00:09:20 UTC (November 4, 6:04–6:09 PM Central). PostgreSQL reported SQLSTATE 42702, `column reference "variant_id" is ambiguous`, inside `hold_originals`.

The function returns a field named `variant_id`. Its `ON CONFLICT (payment_ref, variant_id)` target collided with that PL/pgSQL output variable. Migration `20261105012156_fix_original_hold_conflict_target` names the existing `original_holds_payment_ref_variant_id_key` constraint explicitly. This is the only behavior change; the signature, inventory row locks, hold expiration, repeat-call behavior and service-only grants remain intact. No Stripe integration or checkout presentation was changed.

The error was reproduced against the actual database with a temporary original and transaction rollback. After applying the repair, `supabase/tests/original_hold_conflict_target.sql` passed acquisition, repeat acquisition/TTL refresh, competing-buyer exclusion, release, expired-hold recovery, conversion, duplicate conversion, sold-inventory refusal, print passthrough, missing variants and access checks. All fixture products, holds and inventory changes were rolled back. No real payment was submitted.

PostgreSQL references: [variable conflicts](https://www.postgresql.org/docs/current/plpgsql-implementation.html), [named conflict constraints](https://www.postgresql.org/docs/current/sql-insert.html).
