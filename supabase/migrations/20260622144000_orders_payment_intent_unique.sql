-- FIN-1b (P0): de-duplicate orders on Stripe payment_intent retry.
--
-- The embedded Payment Elements flow keys orders on stripe_payment_intent_id,
-- but only stripe_checkout_session_id had a UNIQUE constraint. The webhook's
-- 23505 idempotency guard was therefore unreachable for Elements payments, so
-- two payment_intent.succeeded deliveries could create duplicate orders, double
-- fulfillment submissions, and double confirmation emails.
--
-- A partial UNIQUE index (WHERE NOT NULL) guarantees at most one order per
-- payment intent while letting any legacy rows with a NULL payment_intent_id
-- coexist. Verified safe to build: prod currently holds 0 orders.
--
-- Apply-order note: this index is additive and the deployed webhook already
-- catches 23505, so it is safe to apply before/with the code deploy.
--
-- Down (manual revert):
--   DROP INDEX IF EXISTS public.orders_stripe_payment_intent_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_key
  ON public.orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
