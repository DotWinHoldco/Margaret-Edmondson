-- Margin-protected pricing with baked-in CONUS shipping.
--
-- Adds a site_settings singleton (default margin %, list of CONUS quote zips),
-- a per-product margin override, and caches the worst-case CONUS shipping
-- cost on each variant so customer-facing prices are static.

create table if not exists site_settings (
  id boolean primary key default true check (id),
  default_margin_pct numeric not null default 0.65,
  shipping_quote_zips text[] not null default array['33101','98101','04401','92101'],
  updated_at timestamptz not null default now()
);

insert into site_settings (id) values (true) on conflict do nothing;

alter table products
  add column if not exists margin_pct numeric;

alter table product_variants
  add column if not exists wholesale_cost numeric,
  add column if not exists worst_case_shipping numeric,
  add column if not exists shipping_quoted_at timestamptz;

alter table site_settings enable row level security;

drop policy if exists site_settings_read on site_settings;
create policy site_settings_read on site_settings
  for select using (true);

drop policy if exists site_settings_write on site_settings;
create policy site_settings_write on site_settings
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
