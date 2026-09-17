-- Authored by DotWin
-- Order line identity for configured prints (plan §4.2, ADR-2, F1/F16/F23; phase P5).
--
-- A cart may now hold two lines for the SAME variant that differ only in their print
-- configuration (a 0.75in and a 1.5in canvas of one size share option ids; a coloured
-- wrap differs by hex alone). The webhook's idempotent upsert keyed those lines on
-- (order_id, product_id, variant_id), so the second configuration would be silently
-- dropped as a "replay". The key gains the line hash:
--
--   line_hash = sha256(subcategory_ref ‖ sorted option_ids ‖ solid_hex)   ('' for a legacy line)
--
-- The default '' keeps every pre-existing row and every in-flight v2 snapshot exactly as
-- idempotent as before. `solid_color_hex` freezes the customer's colour for a Solid Color
-- wrap: the provider never echoes it back (P16), so this row is the record.
--
-- Verified safe to build: production holds 0 order_items (2026-09-17).
--
-- Down (manual revert):
--   DROP INDEX IF EXISTS public.order_items_order_product_variant_line_key;
--   CREATE UNIQUE INDEX order_items_order_product_variant_key
--     ON public.order_items (order_id, product_id, variant_id) NULLS NOT DISTINCT;
--   ALTER TABLE public.order_items DROP COLUMN line_hash, DROP COLUMN solid_color_hex;

alter table public.order_items
  add column if not exists line_hash text not null default '',
  add column if not exists solid_color_hex text;

alter table public.order_items drop constraint if exists order_items_solid_color_hex_check;
alter table public.order_items
  add constraint order_items_solid_color_hex_check
  check (solid_color_hex is null or solid_color_hex ~ '^#[0-9a-f]{6}$');

-- The new key first, the old one second: there is never a moment without an
-- idempotency key on the table.
create unique index if not exists order_items_order_product_variant_line_key
  on public.order_items (order_id, product_id, variant_id, line_hash) nulls not distinct;

drop index if exists public.order_items_order_product_variant_key;
