-- Phase 5: Lumaprints variant builder

-- Products: rename / alias default margin. The existing column is products.margin_pct;
-- the spec calls for `default_margin_pct`. We add a generated alias view-column
-- as a literal column to avoid breaking existing writers.
alter table products
  add column if not exists default_margin_pct numeric;

update products
  set default_margin_pct = coalesce(default_margin_pct, margin_pct, 100.0)
  where default_margin_pct is null;

alter table products
  alter column default_margin_pct set default 100.0;

-- Variants: extend with the Phase 5 columns. Keep existing fields intact so
-- the old refresh/shipping-quote endpoints continue to work during cutover.
alter table product_variants
  add column if not exists medium text,
  add column if not exists size_label text,
  add column if not exists width_in numeric,
  add column if not exists height_in numeric,
  add column if not exists lumaprints_sku text,
  add column if not exists lumaprints_cost_cents integer,
  add column if not exists shipping_cost_cents integer,
  add column if not exists margin_override_pct numeric,
  add column if not exists manual_price_override_cents integer,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_lumaprints_available boolean not null default true,
  add column if not exists last_priced_at timestamptz;

create index if not exists product_variants_product_medium_idx
  on product_variants (product_id, medium);

-- Pricing cache (medium × size).
create table if not exists lumaprints_pricing_cache (
  id uuid primary key default gen_random_uuid(),
  medium text not null,
  size_label text not null,
  cost_cents integer not null,
  shipping_cents integer not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (medium, size_label)
);

create index if not exists lumaprints_pricing_cache_expires_idx
  on lumaprints_pricing_cache (expires_at);

alter table lumaprints_pricing_cache enable row level security;

drop policy if exists "Admins read lumaprints_pricing_cache" on lumaprints_pricing_cache;
create policy "Admins read lumaprints_pricing_cache"
  on lumaprints_pricing_cache for select
  to authenticated
  using (is_admin_or_artist());

drop policy if exists "Admins write lumaprints_pricing_cache" on lumaprints_pricing_cache;
create policy "Admins write lumaprints_pricing_cache"
  on lumaprints_pricing_cache for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

-- Note: server-side writes route through the admin auth helper, which uses
-- the auth.uid() session — RLS gates writes regardless of API path.
