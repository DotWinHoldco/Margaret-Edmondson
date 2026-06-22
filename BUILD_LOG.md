# BUILD LOG — Margaret-Edmondson

Authored by DotWin

Append-only, greppable history. Newest first. `STATE.md` references entries by tag.

---

## #harden-2026-06-22 — harden: P0 + 7 P1 (money path + comms + cron auth)

- **Date:** 2026-06-22
- **Module:** Stripe webhooks · fulfillment · crons/authz · Supabase RLS · email/newsletter
- **Category:** security hardening / idempotency / fail-closed authz
- **Summary:** Fixed every release-blocker from the 2026-06-21 adopt audit (1 P0 + 7 P1) in code, with
  one regression test each. DB side delivered as migration files only (user decision) — NOT applied to
  prod this run.

### What changed
- **FIN-1b (P0)** `supabase/migrations/2026062201_orders_payment_intent_unique.sql` — partial
  `UNIQUE(stripe_payment_intent_id) WHERE NOT NULL` so the webhook's existing 23505 guard is reachable
  for the embedded Payment Elements flow.
- **FIN-1 (P1)** `2026062202_order_items_idempotency.sql` + `src/app/api/webhooks/stripe/route.ts` —
  `UNIQUE(order_id,product_id,variant_id) NULLS NOT DISTINCT` + item upsert; one-shot side effects (CRM
  revenue, Meta Purchase, confirmation + owner emails) gated on an atomic flip of new column
  `orders.side_effects_completed_at` (NULL→now). Fulfillment routing stays ungated (idempotent).
- **FIN-2 (P1)** `2026062203_order_items_submitting_state.sql` + `src/lib/fulfillment/router.ts` — added
  `submitting` status; router atomically pre-claims pending/failed items to `submitting` before the
  LumaPrints/Printful call (both batch router and single-item retry). Lost write/retry no longer
  double-submits a real provider order.
- **AZ-1 (P1)** new `src/lib/auth/require-cron.ts` (`requireCron`, timingSafeEqual, 503 when CRON_SECRET
  unset) applied to all 7 `src/app/api/cron/*` routes. (fulfillment/submit+retry and admin/revalidate
  already fail closed — left as-is.)
- **DB-2 (P1)** `2026062204_newsletter_subscribers_admin_read.sql` — dropped
  `"Authenticated can read newsletter_subscribers"`, replaced with `is_admin_or_artist()` SELECT.
- **COM-1 (P1)** `src/lib/email/render.ts` — `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click`
  headers on marketing sends (POST handler already exists at `/api/unsubscribe`).
- **COM-2 (P1)** new `src/lib/email/suppression.ts` (`isSuppressed`) gating renderAndSend +
  abandoned-cart steps 1/2/3 + welcome + post-purchase. Transactional sends unaffected.
- **COM-3 (P1)** `src/lib/email/unsubscribe.ts` — signing secret is `UNSUBSCRIBE_SECRET` only (dropped
  CRON_SECRET/RESEND_API_KEY/hardcoded fallbacks); fail-closed in production; dropped the
  no-timestamp "accept forever" branch. `.env.example` + `scripts/check-env.mjs` updated.
- **Tests:** `test/require-cron.test.ts`, `test/unsubscribe-hardening.test.ts`,
  `test/email-suppression.test.ts`, `test/email-list-unsubscribe.test.ts`,
  `test/order-fulfillment-db-invariants.test.ts` (DB-guarded by `SUPABASE_TEST_URL`).

### Decisions / why it matters
- **Dedicated idempotency column, not a `processing→confirmed` status transition** (the audit's suggested
  mechanism): live `orders_status_check` has no `confirmed` value and `status` is customer-visible, so a
  status transition would violate the constraint / change observable state. Proven by reading the live
  constraint before coding.
- **DB-2 / FIN-1b applied via files only** (user choice). Respects git-discipline: the matching code is
  unpushed (no sandbox GitHub creds), so prod schema must not lead it.
- Prod verified read-only: **0 orders / 0 order_items** → all unique indexes build clean; P0 is latent
  (no live duplicate-order damage yet) but a correct stop-ship before launch.

### Apply-order (for the deploy that the user controls)
1. `2026062201` (FIN-1b) and `2026062204` (DB-2): pure tightenings, safe to apply anytime.
2. `2026062202` (FIN-1) and `2026062203` (FIN-2): **must ship together with the matching code** — the
   webhook writes `side_effects_completed_at` and the router writes `submitting`; applying schema without
   the code (or vice versa) breaks the live path.
3. Set `UNSUBSCRIBE_SECRET` in prod env (COM-3 fail-closed) — `openssl rand -hex 32`.

### Verification (this run)
- typecheck `tsc --noEmit`: PASS (0 errors). lint `eslint .`: PASS (0 errors, 53 pre-existing warnings).
- AZ-1 + COM-3 executed against real source via `node --experimental-strip-types`: 8/8 assertions pass.
- NOT run here (native/CI): `vitest` (5 specs), `next build`, DB constraint/RLS tests, prod migration apply.

### Related files / deps
`src/app/api/webhooks/stripe/route.ts`, `src/lib/fulfillment/router.ts`, `src/lib/auth/require-cron.ts`,
`src/lib/email/{render,suppression,unsubscribe,triggers}.ts`, `src/app/api/cron/*`, `supabase/migrations/2026062201..04`.
Deps: @supabase/supabase-js, stripe, resend, node:crypto.

### Search keywords
idempotency, payment_intent unique, side_effects_completed_at, NULLS NOT DISTINCT, submitting pre-claim,
double-submit, requireCron, timingSafeEqual, fail closed, List-Unsubscribe, RFC 8058, suppression,
UNSUBSCRIBE_SECRET, newsletter RLS, is_admin_or_artist.

### Relevant history
`#findings` (audit register), `#reg-financial`, `#reg-comms`, `#migration-drift`.
