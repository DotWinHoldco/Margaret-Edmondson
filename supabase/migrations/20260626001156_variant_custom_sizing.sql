-- Custom (true-to-aspect) print sizing + non-destructive master cropping +
-- order-time fulfillment snapshot. Purely ADDITIVE and idempotent — safe to
-- re-run. No existing column is dropped or renamed. Companion data migration
-- 2026061602 retires the legacy print variants; the variant builder then
-- regenerates S/M/L defaults with live pricing.
--
-- DOWN (manual): the ALTER ... ADD COLUMN statements below are reversible with
--   ALTER TABLE <t> DROP COLUMN IF EXISTS <c>;  (listed per block).

-- ---------------------------------------------------------------------------
-- product_variants — flag custom sizes, remember the tier + locked aspect.
-- (width_in, height_in, medium, size_label, lumaprints_cost_cents,
--  shipping_cost_cents, margin_override_pct, manual_price_override_cents,
--  price, is_active already exist. is_active is the LIVE/DRAFT flag:
--  true = live (shown on storefront), false = draft.)
-- DOWN: drop columns is_custom_size, size_tier, aspect_ratio.
-- ---------------------------------------------------------------------------
alter table public.product_variants
  add column if not exists is_custom_size boolean not null default false,
  add column if not exists size_tier text,        -- 'S' | 'M' | 'L' | null(custom)
  add column if not exists aspect_ratio numeric;   -- width_in / height_in the variant is locked to

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'product_variants_size_tier_check') then
    alter table public.product_variants
      add constraint product_variants_size_tier_check
      check (size_tier is null or size_tier in ('S','M','L'));
  end if;
end $$;

-- (Dedupe of (product, medium, size) is handled in the variant builder, not a
--  DB unique index — a custom variant may intentionally match a default tier's
--  dimensions, and enforcing uniqueness here would also be order-sensitive
--  against the legacy rows retired in 2026061602.)

-- Fast storefront read of live print variants.
create index if not exists product_variants_live_print_idx
  on public.product_variants (product_id, medium)
  where medium is not null and is_active = true;

-- ---------------------------------------------------------------------------
-- master_artworks — non-destructive crop of the print master. The original
-- scan stays in storage_path/width_px/height_px untouched (revertible). The
-- cropped + aspect-padded print-ready file is print_storage_path; fulfillment
-- prefers it over storage_path.
-- DOWN: drop columns crop_box, print_storage_path, print_width_px,
--       print_height_px, border_mode, border_color, print_updated_at.
-- ---------------------------------------------------------------------------
alter table public.master_artworks
  add column if not exists crop_box jsonb,                       -- {x,y,w,h} normalized 0..1 on the ORIGINAL
  add column if not exists print_storage_path text,              -- cropped/padded master in print-masters bucket
  add column if not exists print_width_px integer,
  add column if not exists print_height_px integer,
  add column if not exists border_mode text not null default 'full_bleed',
  add column if not exists border_color text not null default '#ffffff',
  add column if not exists print_updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'master_artworks_border_mode_check') then
    alter table public.master_artworks
      add constraint master_artworks_border_mode_check
      check (border_mode in ('full_bleed','matte'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- order_items — SNAPSHOT the exact print spec at purchase so an order can be
-- fulfilled deterministically even if the variant is later edited or deleted.
-- (variant_id FK has no ON DELETE CASCADE, so we never rely on the live row.)
-- DOWN: drop the columns added below.
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists medium text,
  add column if not exists size_label text,
  add column if not exists print_width_in numeric,
  add column if not exists print_height_in numeric,
  add column if not exists lumaprints_subcategory_id integer,
  add column if not exists lumaprints_option_ids integer[] not null default '{}',
  add column if not exists print_storage_path text,            -- master file sent to LumaPrints
  add column if not exists external_item_id text;               -- our id echoed to LumaPrints (defaults to order_items.id)

comment on column public.order_items.print_width_in is
  'Snapshot of variant.width_in at purchase. Fulfillment uses this, never the live variant.';

-- ---------------------------------------------------------------------------
-- NOTE on reprice_variants(): the existing RPC (2026061502_gross_margin_basis)
-- is dimension-agnostic — price = (lumaprints_cost_cents + shipping_cost_cents)
-- × (1 + margin/100), manual overrides preserved. It already works for custom
-- sizes; no change needed here. The custom-size builder must populate
-- lumaprints_cost_cents/shipping_cost_cents from the LIVE products-cost API
-- before pricing (see the build prompt, Phase 3).
-- ---------------------------------------------------------------------------
