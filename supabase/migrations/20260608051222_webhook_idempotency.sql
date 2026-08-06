-- B-2: Webhook idempotency for the Stripe handler.
-- Forward:
--   * orders.stripe_checkout_session_id UNIQUE  (one order per checkout session)
--   * webhook_logs.stripe_event_id TEXT + unique partial index (dedupe replays)
-- Down (manual revert):
--   ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_stripe_checkout_session_id_key;
--   DROP INDEX IF EXISTS public.webhook_logs_stripe_event_id_key;
--   ALTER TABLE public.webhook_logs DROP COLUMN IF EXISTS stripe_event_id;

-- orders: one order per Stripe checkout session (NULLs remain allowed/distinct).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_stripe_checkout_session_id_key'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_stripe_checkout_session_id_key UNIQUE (stripe_checkout_session_id);
  END IF;
END $$;

-- webhook_logs: stripe_event_id powers the replay-dedupe guard in the handler.
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS stripe_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_logs_stripe_event_id_key
  ON public.webhook_logs (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
