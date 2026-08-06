-- Smoke-test finding F13: the Stripe webhook marks paid class bookings with
-- payment_method='stripe', but the CHECK constraint only allowed venmo/zelle/other,
-- so the update silently failed and paid bookings stayed awaiting_payment
-- (and were later cancelled by the expiry cron). Extend the allowed set.
-- Applied to prod via MCP 2026-07-30.
ALTER TABLE public.class_bookings DROP CONSTRAINT IF EXISTS class_bookings_payment_method_check;
ALTER TABLE public.class_bookings ADD CONSTRAINT class_bookings_payment_method_check
  CHECK (payment_method = ANY (ARRAY['venmo'::text, 'zelle'::text, 'other'::text, 'stripe'::text, 'comp'::text]));
