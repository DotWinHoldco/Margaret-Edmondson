-- Authored by DotWin
-- A print size decides which depths / print types it is sold in.
--
-- A variant is a size for a medium family (canvas, framed canvas, …); every switched-on
-- print type of that family that can take the size offers it (Fits). Until now that was
-- all-or-nothing: switching on "1.50in Framed Canvas" in Print Catalog put every existing
-- framed-canvas size on sale in the new depth with no per-product say. This column is the
-- per-size veto: the provider subcategory ids this size is NOT sold in. Empty (the default)
-- keeps today's behaviour. Read by the storefront configurator, the public print-quote
-- route, checkout validation, the pricing warmer and the coverage report; written only by
-- the admin variant route (existing RLS on product_variants applies unchanged).

alter table public.product_variants
  add column if not exists excluded_subcategory_ids integer[] not null default '{}';

comment on column public.product_variants.excluded_subcategory_ids is
  'Provider subcategory ids (print types / depths) this size is NOT sold in. Empty = every switched-on print type of the medium that fits.';
