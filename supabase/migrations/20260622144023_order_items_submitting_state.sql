-- FIN-2 (P1): allow an atomic 'submitting' pre-claim on order_items so the
-- fulfillment router can reserve an item BEFORE the external provider call.
--
-- Previously an item stayed 'pending' until AFTER the LumaPrints / Printful
-- order was created. A lost local write, a function kill, or a webhook retry
-- therefore re-read the item as 'pending' and submitted a SECOND real provider
-- order. The router now flips pending/failed/failed_validation -> submitting in
-- a single conditional UPDATE; only the run that wins the claim calls the
-- provider, then writes 'submitted' + external_order_id together. An item left
-- in 'submitting' (process killed mid-call) is a visible state for
-- reconciliation rather than a silent double-submit.
--
-- Additive change to the CHECK constraint: no existing row violates the widened
-- set, so this is safe to apply. MUST ship with the matching router code, which
-- writes the new 'submitting' value.
--
-- Down (manual revert):
--   ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_fulfillment_status_check;
--   ALTER TABLE public.order_items ADD CONSTRAINT order_items_fulfillment_status_check
--     CHECK (fulfillment_status = ANY (ARRAY['pending','submitted','in_production','shipped','delivered','cancelled','failed','failed_validation']));

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_fulfillment_status_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_fulfillment_status_check
  CHECK (fulfillment_status = ANY (ARRAY[
    'pending',
    'submitting',
    'submitted',
    'in_production',
    'shipped',
    'delivered',
    'cancelled',
    'failed',
    'failed_validation'
  ]));
