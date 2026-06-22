-- FIN-1 (P1): make order side-effects exactly-once on webhook replay / resume.
--
-- 1. order_items had only a primary key, so a resumed webhook (an order row that
--    exists with no items after a crash) re-ran the item loop and inserted
--    duplicate item rows -> double fulfillment + wrong order totals. A UNIQUE
--    (order_id, product_id, variant_id) NULLS NOT DISTINCT lets the handler
--    upsert idempotently. NULLS NOT DISTINCT (PostgreSQL 15+; prod is 17) makes
--    a NULL variant_id collide instead of being treated as always-distinct.
--
-- 2. orders.side_effects_completed_at gates the one-shot side effects (CRM
--    revenue bump, Meta Purchase, confirmation + studio-owner emails). The
--    webhook flips it from NULL -> now() in a single atomic UPDATE and only the
--    delivery that wins that transition runs the side effects. A dedicated
--    column is used rather than a 'processing -> confirmed' status transition
--    because orders_status_check has no 'confirmed' value and status is
--    customer-visible; overloading it would change observable order state.
--
-- Apply-order note: this migration MUST be applied together with (or before) the
-- matching webhook code, which upserts items and reads/writes
-- side_effects_completed_at. Verified safe to build: prod holds 0 order_items.
--
-- Down (manual revert):
--   DROP INDEX IF EXISTS public.order_items_order_product_variant_key;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS side_effects_completed_at;

CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_product_variant_key
  ON public.order_items (order_id, product_id, variant_id) NULLS NOT DISTINCT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS side_effects_completed_at timestamptz;
