-- Extend order_items.fulfillment_status with two failure states used by
-- the fulfillment router's pre-fire validation and provider-error path.
--
--   failed_validation : the order item could not be sent to the provider
--                       because something on the product / variant /
--                       address was incomplete. The reason is logged to
--                       webhook_logs.
--   failed            : the provider rejected the order (network error,
--                       bad SKU, etc.). Admin can refire from the order
--                       detail page.

alter table order_items
  drop constraint if exists order_items_fulfillment_status_check;

alter table order_items
  add constraint order_items_fulfillment_status_check
  check (fulfillment_status = any (array[
    'pending',
    'submitted',
    'in_production',
    'shipped',
    'delivered',
    'cancelled',
    'failed',
    'failed_validation'
  ]));
