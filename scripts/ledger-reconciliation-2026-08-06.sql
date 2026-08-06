-- Migration ledger reconciliation for the ArtByME production project
-- (klwkajukicsoiwpsgftt), prepared 2026-08-06.
--
-- Scope: supabase_migrations.schema_migrations only. This script does NOT touch
-- application schema. It aligns the remote ledger with the reconciled contents of
-- supabase/migrations/ so that every file has exactly one ledger row and every
-- applied change has a file.
--
-- This file is deliberately NOT in supabase/migrations/. Review it, then run it once
-- against production. Every statement is guarded, so a second run is a no-op.
--
-- Contents: 14 name normalisations, 14 backfill inserts, 0 deletes.
--
-- No DELETE statements are proposed: no ledger row was found to be a provable
-- duplicate of another row for the same change.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Name normalisation.
--    These rows were recorded with the old file prefix embedded in the name
--    (for example "2026062201_orders_payment_intent_unique"). The version column
--    already carries the real apply order, so the embedded prefix is redundant and
--    it prevents the ledger name from matching the reconciled filename. Strip it so
--    each pair converges on <version>_<clean_name>.sql.
--    Guarded by the old name, so re-running changes nothing.
-- ---------------------------------------------------------------------------

UPDATE supabase_migrations.schema_migrations
   SET name = 'orders_payment_intent_unique'
 WHERE version = '20260622144000'
   AND name = '2026062201_orders_payment_intent_unique';

UPDATE supabase_migrations.schema_migrations
   SET name = 'newsletter_subscribers_admin_read'
 WHERE version = '20260622144007'
   AND name = '2026062204_newsletter_subscribers_admin_read';

UPDATE supabase_migrations.schema_migrations
   SET name = 'order_items_idempotency'
 WHERE version = '20260622144016'
   AND name = '2026062202_order_items_idempotency';

UPDATE supabase_migrations.schema_migrations
   SET name = 'order_items_submitting_state'
 WHERE version = '20260622144023'
   AND name = '2026062203_order_items_submitting_state';

UPDATE supabase_migrations.schema_migrations
   SET name = 'adopt_rls_conformance'
 WHERE version = '20260622212139'
   AND name = '2026062205_adopt_rls_conformance';

UPDATE supabase_migrations.schema_migrations
   SET name = 'variant_custom_sizing'
 WHERE version = '20260626001156'
   AND name = '2026061601_variant_custom_sizing';

UPDATE supabase_migrations.schema_migrations
   SET name = 'retire_legacy_print_variants'
 WHERE version = '20260626001204'
   AND name = '2026061602_retire_legacy_print_variants';

UPDATE supabase_migrations.schema_migrations
   SET name = 'master_print_status'
 WHERE version = '20260626003422'
   AND name = '2026061603_master_print_status';

UPDATE supabase_migrations.schema_migrations
   SET name = 'checkout_snapshots'
 WHERE version = '20260628030738'
   AND name = '2026062800_checkout_snapshots';

UPDATE supabase_migrations.schema_migrations
   SET name = 'g2_account_linkage'
 WHERE version = '20260628152929'
   AND name = '2026062801_g2_account_linkage';

UPDATE supabase_migrations.schema_migrations
   SET name = 'fulfillment_jobs'
 WHERE version = '20260629155434'
   AND name = '2026062900_fulfillment_jobs';

UPDATE supabase_migrations.schema_migrations
   SET name = 'class_bookings_allow_stripe_payment_method'
 WHERE version = '20260730154032'
   AND name = '2026073001_class_bookings_allow_stripe_payment_method';

UPDATE supabase_migrations.schema_migrations
   SET name = 'admin_read_policies_orders_items_enrollments_blog'
 WHERE version = '20260730154541'
   AND name = '2026073002_admin_read_policies_orders_items_enrollments_blog';

UPDATE supabase_migrations.schema_migrations
   SET name = 'admin_read_all_remaining_tables'
 WHERE version = '20260730191129'
   AND name = '2026073003_admin_read_all_remaining_tables';

-- ---------------------------------------------------------------------------
-- 2. Backfill rows for local files that were verified as already applied.
--    Each of these files exists in supabase/migrations/ and its objects were
--    confirmed present in the live catalog on 2026-08-06, but no ledger row
--    recorded it. Without these rows, "supabase db push" would try to re-apply
--    work that is already in production.
--
--    version is the canonical 14-digit version now used by the filename; it was
--    checked for collisions and it sorts between the neighbouring ledger versions.
--    statements is the file body split into top-level statements.
--    Guarded by WHERE NOT EXISTS on version, so re-running changes nothing.
-- ---------------------------------------------------------------------------

-- 20260515000001_margin_protected_pricing.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260515000001', 'margin_protected_pricing', ARRAY[
  $mig$-- Margin-protected pricing with baked-in CONUS shipping.
--
-- Adds a site_settings singleton (default margin %, list of CONUS quote zips),
-- a per-product margin override, and caches the worst-case CONUS shipping
-- cost on each variant so customer-facing prices are static.

create table if not exists site_settings (
  id boolean primary key default true check (id),
  default_margin_pct numeric not null default 0.65,
  shipping_quote_zips text[] not null default array['33101','98101','04401','92101'],
  updated_at timestamptz not null default now()
);$mig$,
  $mig$insert into site_settings (id) values (true) on conflict do nothing;$mig$,
  $mig$alter table products
  add column if not exists margin_pct numeric;$mig$,
  $mig$alter table product_variants
  add column if not exists wholesale_cost numeric,
  add column if not exists worst_case_shipping numeric,
  add column if not exists shipping_quoted_at timestamptz;$mig$,
  $mig$alter table site_settings enable row level security;$mig$,
  $mig$drop policy if exists site_settings_read on site_settings;$mig$,
  $mig$create policy site_settings_read on site_settings
  for select using (true);$mig$,
  $mig$drop policy if exists site_settings_write on site_settings;$mig$,
  $mig$create policy site_settings_write on site_settings
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260515000001'
 );

-- 20260519000001_cv_entries.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260519000001', 'cv_entries', ARRAY[
  $mig$-- Phase 4: CV builder schema

create table if not exists cv_entries (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('exhibitions','education','affiliations','experience')),
  year text not null,
  sort_year_numeric integer not null,
  title text not null,
  venue text,
  institution text,
  location text,
  juror text,
  award text,
  notes text,
  linked_artwork_slug text,
  display_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);$mig$,
  $mig$create index if not exists cv_entries_section_sort_idx
  on cv_entries (section, sort_year_numeric desc, display_order asc, title asc);$mig$,
  $mig$alter table cv_entries enable row level security;$mig$,
  $mig$drop policy if exists "Public can read published cv_entries" on cv_entries;$mig$,
  $mig$create policy "Public can read published cv_entries"
  on cv_entries for select
  using (is_published = true);$mig$,
  $mig$drop policy if exists "Admins manage cv_entries" on cv_entries;$mig$,
  $mig$create policy "Admins manage cv_entries"
  on cv_entries for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());$mig$,
  $mig$-- Singleton settings row for the CV header (intro paragraph + last updated override).
create table if not exists cv_settings (
  id boolean primary key default true check (id),
  intro text not null default 'Selected exhibitions, education, and teaching experience.',
  contact_email text not null default 'margaret117art@gmail.com',
  updated_at timestamptz not null default now()
);$mig$,
  $mig$alter table cv_settings enable row level security;$mig$,
  $mig$drop policy if exists "Public can read cv_settings" on cv_settings;$mig$,
  $mig$create policy "Public can read cv_settings"
  on cv_settings for select
  using (true);$mig$,
  $mig$drop policy if exists "Admins manage cv_settings" on cv_settings;$mig$,
  $mig$create policy "Admins manage cv_settings"
  on cv_settings for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());$mig$,
  $mig$insert into cv_settings (id) values (true) on conflict (id) do nothing;$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260519000001'
 );

-- 20260519000002_media_library.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260519000002', 'media_library', ARRAY[
  $mig$-- Central media library: every image upload registered here so the
-- /admin/media manager can list, filter, search, and reverse-link.
--
-- categories[] is a soft-tag list. Each image can belong to multiple
-- categories (e.g., a portrait that's used on both /products and /about).
-- Allowed values are checked at the app layer rather than via a CHECK
-- constraint so we can add new sources without a migration.

create table if not exists media_library (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null,
  storage_path text not null,
  url text not null,
  file_name text not null,
  mime_type text,
  byte_size integer,
  width integer,
  height integer,
  alt_text text,
  categories text[] not null default '{}',
  source text,                  -- free-form context: 'product:hot-air', 'about:origin', etc.
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);$mig$,
  $mig$create index if not exists media_library_categories_idx on media_library using gin (categories);$mig$,
  $mig$create index if not exists media_library_created_at_idx on media_library (created_at desc);$mig$,
  $mig$create index if not exists media_library_bucket_idx on media_library (storage_bucket);$mig$,
  $mig$alter table media_library enable row level security;$mig$,
  $mig$drop policy if exists "Admins manage media_library" on media_library;$mig$,
  $mig$create policy "Admins manage media_library"
  on media_library for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());$mig$,
  $mig$-- Library bucket: target for un-attributed uploads via the media manager.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', true, 20971520, array['image/jpeg','image/png','image/webp','image/avif','image/gif','image/svg+xml'])
on conflict (id) do nothing;$mig$,
  $mig$drop policy if exists "Public read library" on storage.objects;$mig$,
  $mig$create policy "Public read library" on storage.objects
  for select using (bucket_id = 'library');$mig$,
  $mig$drop policy if exists "Admins manage library" on storage.objects;$mig$,
  $mig$create policy "Admins manage library" on storage.objects
  for all to authenticated
  using (bucket_id = 'library' and is_admin_or_artist())
  with check (bucket_id = 'library' and is_admin_or_artist());$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260519000002'
 );

-- 20260519000003_phase5b_cleanup.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260519000003', 'phase5b_cleanup', ARRAY[
  $mig$-- This file groups the two ad-hoc migrations applied during the variant/about
-- cleanup pass: the print-variant backfill and the bio_sections image columns.
-- Both have already been applied to production; this is the canonical record.

-- 1) Backfill: pre-Phase-5 print variants had variant_type set but no medium.
update product_variants pv set
  medium = case when variant_type = 'framed_canvas_print' then 'framed_canvas' else 'canvas' end,
  size_label = replace(replace(fulfillment_metadata->>'size', '×', 'x'), ' ', ''),
  width_in = nullif(split_part(replace(replace(fulfillment_metadata->>'size', '×', 'x'), ' ', ''), 'x', 1), '')::numeric,
  height_in = nullif(split_part(replace(replace(fulfillment_metadata->>'size', '×', 'x'), ' ', ''), 'x', 2), '')::numeric,
  lumaprints_cost_cents = coalesce(lumaprints_cost_cents, round(coalesce(wholesale_cost, 0) * 100)::integer),
  shipping_cost_cents = coalesce(shipping_cost_cents, round(coalesce(worst_case_shipping, 0) * 100)::integer),
  last_priced_at = coalesce(last_priced_at, shipping_quoted_at, now())
where variant_type in ('canvas_print','framed_canvas_print')
  and medium is null
  and fulfillment_metadata ? 'size';$mig$,
  $mig$-- 2) About builder: optional image per section.
alter table bio_sections
  add column if not exists image_url text,
  add column if not exists image_alt text;$mig$,
  $mig$-- 3) Storage: about-images bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('about-images', 'about-images', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;$mig$,
  $mig$drop policy if exists "Public read about-images" on storage.objects;$mig$,
  $mig$create policy "Public read about-images" on storage.objects
  for select using (bucket_id = 'about-images');$mig$,
  $mig$drop policy if exists "Admins manage about-images" on storage.objects;$mig$,
  $mig$create policy "Admins manage about-images" on storage.objects
  for all to authenticated
  using (bucket_id = 'about-images' and is_admin_or_artist())
  with check (bucket_id = 'about-images' and is_admin_or_artist());$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260519000003'
 );

-- 20260519000004_variant_builder.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260519000004', 'variant_builder', ARRAY[
  $mig$-- Phase 5: Lumaprints variant builder

-- Products: rename / alias default margin. The existing column is products.margin_pct;
-- the spec calls for `default_margin_pct`. We add a generated alias view-column
-- as a literal column to avoid breaking existing writers.
alter table products
  add column if not exists default_margin_pct numeric;$mig$,
  $mig$update products
  set default_margin_pct = coalesce(default_margin_pct, margin_pct, 100.0)
  where default_margin_pct is null;$mig$,
  $mig$alter table products
  alter column default_margin_pct set default 100.0;$mig$,
  $mig$-- Variants: extend with the Phase 5 columns. Keep existing fields intact so
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
  add column if not exists last_priced_at timestamptz;$mig$,
  $mig$create index if not exists product_variants_product_medium_idx
  on product_variants (product_id, medium);$mig$,
  $mig$-- Pricing cache (medium × size).
create table if not exists lumaprints_pricing_cache (
  id uuid primary key default gen_random_uuid(),
  medium text not null,
  size_label text not null,
  cost_cents integer not null,
  shipping_cents integer not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (medium, size_label)
);$mig$,
  $mig$create index if not exists lumaprints_pricing_cache_expires_idx
  on lumaprints_pricing_cache (expires_at);$mig$,
  $mig$alter table lumaprints_pricing_cache enable row level security;$mig$,
  $mig$drop policy if exists "Admins read lumaprints_pricing_cache" on lumaprints_pricing_cache;$mig$,
  $mig$create policy "Admins read lumaprints_pricing_cache"
  on lumaprints_pricing_cache for select
  to authenticated
  using (is_admin_or_artist());$mig$,
  $mig$drop policy if exists "Admins write lumaprints_pricing_cache" on lumaprints_pricing_cache;$mig$,
  $mig$create policy "Admins write lumaprints_pricing_cache"
  on lumaprints_pricing_cache for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());$mig$,
  $mig$-- Note: server-side writes route through the admin auth helper, which uses
-- the auth.uid() session — RLS gates writes regardless of API path.$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260519000004'
 );

-- 20260520000001_lumaprints_mediums.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260520000001', 'lumaprints_mediums', ARRAY[
  $mig$-- Per-medium Lumaprints config: subcategory_id, default option_ids,
-- size grid. Populated by /api/admin/lumaprints/sync which walks the
-- live Lumaprints catalog and name-matches each medium key.

create table if not exists lumaprints_mediums (
  medium text primary key,
  category_id integer,
  subcategory_id integer,
  name text,                            -- as reported by Lumaprints
  option_ids integer[] not null default '{}',
  sizes jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  last_synced_at timestamptz,
  notes text
);$mig$,
  $mig$alter table lumaprints_mediums enable row level security;$mig$,
  $mig$drop policy if exists "Admins manage lumaprints_mediums" on lumaprints_mediums;$mig$,
  $mig$create policy "Admins manage lumaprints_mediums"
  on lumaprints_mediums for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());$mig$,
  $mig$drop policy if exists "Public read lumaprints_mediums" on lumaprints_mediums;$mig$,
  $mig$create policy "Public read lumaprints_mediums"
  on lumaprints_mediums for select
  using (true);$mig$,
  $mig$-- Pre-seed canvas + framed_canvas with the values already proven in
-- production (so the sync isn't required for the existing two mediums).
insert into lumaprints_mediums (medium, subcategory_id, name, option_ids, sizes, enabled, last_synced_at)
values
  ('canvas', 101002, 'Canvas (1.25" stretched)', '{}'::int[], '[
    {"size_label":"8x10","width":8,"height":10},
    {"size_label":"11x14","width":11,"height":14},
    {"size_label":"12x16","width":12,"height":16},
    {"size_label":"16x20","width":16,"height":20},
    {"size_label":"18x24","width":18,"height":24},
    {"size_label":"24x30","width":24,"height":30},
    {"size_label":"24x36","width":24,"height":36},
    {"size_label":"30x40","width":30,"height":40}
  ]'::jsonb, true, now()),
  ('framed_canvas', 102002, 'Framed Canvas (1.25")', '{27}'::int[], '[
    {"size_label":"8x10","width":8,"height":10},
    {"size_label":"11x14","width":11,"height":14},
    {"size_label":"12x16","width":12,"height":16},
    {"size_label":"16x20","width":16,"height":20},
    {"size_label":"18x24","width":18,"height":24},
    {"size_label":"24x30","width":24,"height":30},
    {"size_label":"24x36","width":24,"height":36},
    {"size_label":"30x40","width":30,"height":40}
  ]'::jsonb, true, now())
on conflict (medium) do nothing;$mig$,
  $mig$-- Placeholder rows for the other six mediums so the sync has something to
-- update. enabled stays false until sync populates subcategory_id.
insert into lumaprints_mediums (medium, name, enabled)
values
  ('fine_art_paper', 'Fine Art Paper', false),
  ('framed_fine_art_paper', 'Framed Fine Art Paper', false),
  ('foam_mounted_fine_art_paper', 'Foam-Mounted Fine Art Paper', false),
  ('metal', 'Metal Print', false),
  ('peel_and_stick', 'Peel & Stick', false),
  ('rolled_canvas', 'Rolled Canvas', false)
on conflict (medium) do nothing;$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260520000001'
 );

-- 20260521000002_email_campaigns.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260521000002', 'email_campaigns', ARRAY[
  $mig$-- ─── Email Campaigns ────────────────────────────────────────────────

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  preheader text,
  from_name text,
  from_email text,
  content_html text not null default '',
  content_json jsonb,
  status text not null default 'draft'
    check (status in ('draft','scheduled','sending','sent','failed','paused')),
  audience_list_id uuid references contact_lists(id) on delete set null,
  promo_code_id uuid references promo_codes(id) on delete set null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  opened_count integer not null default 0,
  clicked_count integer not null default 0,
  unsubscribed_count integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);$mig$,
  $mig$create index if not exists email_campaigns_status_idx on email_campaigns (status);$mig$,
  $mig$create index if not exists email_campaigns_scheduled_idx on email_campaigns (scheduled_at);$mig$,
  $mig$alter table email_campaigns enable row level security;$mig$,
  $mig$drop policy if exists "Admins manage email_campaigns" on email_campaigns;$mig$,
  $mig$create policy "Admins manage email_campaigns"
  on email_campaigns for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());$mig$,
  $mig$drop trigger if exists email_campaigns_touch on email_campaigns;$mig$,
  $mig$create trigger email_campaigns_touch before update on email_campaigns
  for each row execute function crm_contacts_touch_updated_at();$mig$,
  $mig$-- ─── Per-Recipient Send Queue ───────────────────────────────────────

create table if not exists email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  email_snapshot text not null,
  first_name_snapshot text,
  status text not null default 'queued'
    check (status in ('queued','sent','failed','bounced','unsubscribed','complained','skipped')),
  error text,
  resend_message_id text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz
);$mig$,
  $mig$create unique index if not exists email_campaign_recipients_unique
  on email_campaign_recipients (campaign_id, email_snapshot);$mig$,
  $mig$create index if not exists email_campaign_recipients_campaign_idx
  on email_campaign_recipients (campaign_id, status);$mig$,
  $mig$alter table email_campaign_recipients enable row level security;$mig$,
  $mig$drop policy if exists "Admins manage email_campaign_recipients" on email_campaign_recipients;$mig$,
  $mig$create policy "Admins manage email_campaign_recipients"
  on email_campaign_recipients for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());$mig$,
  $mig$-- ─── Automations (welcome series, nurture, post-purchase) ───────────

create table if not exists email_automations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  trigger_event text not null
    check (trigger_event in (
      'newsletter_signup',
      'cart_abandon_nurture',
      'order_placed',
      'class_enrolled'
    )),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);$mig$,
  $mig$alter table email_automations enable row level security;$mig$,
  $mig$drop policy if exists "Admins manage email_automations" on email_automations;$mig$,
  $mig$create policy "Admins manage email_automations"
  on email_automations for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());$mig$,
  $mig$drop trigger if exists email_automations_touch on email_automations;$mig$,
  $mig$create trigger email_automations_touch before update on email_automations
  for each row execute function crm_contacts_touch_updated_at();$mig$,
  $mig$create table if not exists email_automation_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references email_automations(id) on delete cascade,
  step_order integer not null,
  delay_minutes integer not null default 0,
  subject text not null,
  preheader text,
  content_html text not null default '',
  promo_code_kind text,
  promo_percent_off integer,
  promo_expires_in_hours integer,
  created_at timestamptz not null default now()
);$mig$,
  $mig$create index if not exists email_automation_steps_auto_idx
  on email_automation_steps (automation_id, step_order);$mig$,
  $mig$alter table email_automation_steps enable row level security;$mig$,
  $mig$drop policy if exists "Admins manage email_automation_steps" on email_automation_steps;$mig$,
  $mig$create policy "Admins manage email_automation_steps"
  on email_automation_steps for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());$mig$,
  $mig$-- Seed the cart-nurture automation so the cron has a template to read.
insert into email_automations (slug, name, description, trigger_event, is_active) values
  ('cart-nurture-weekly', 'Weekly Cart Nurture', 'Re-engagement email sent weekly to abandoned carts who exhausted the 1h/24h/72h sequence.', 'cart_abandon_nurture', true)
on conflict (slug) do nothing;$mig$,
  $mig$insert into email_automation_steps (automation_id, step_order, delay_minutes, subject, preheader, content_html, promo_code_kind, promo_percent_off, promo_expires_in_hours)
select
  a.id,
  1,
  0,
  'Still on your mind?',
  'A little something to spark the buy.',
  '<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Still thinking about it?</h2><p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">{{first_name_or_friend}}, your saved pieces are still here. If a nudge helps, use <strong>{{discount_code}}</strong> for {{discount_value}}% off at checkout, good for the next 7 days.</p><div style="text-align:center;margin:28px 0;"><a href="{{cart_url}}" style="display:inline-block;background:#3A7D7B;color:#fff;padding:14px 36px;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">Return to Your Cart</a></div>',
  'cart_abandon',
  10,
  168
from email_automations a where a.slug = 'cart-nurture-weekly'
on conflict do nothing;$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260521000002'
 );

-- 20260521000003_unsubscribes.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260521000003', 'unsubscribes', ARRAY[
  $mig$-- ─── Unsubscribe Events Audit Log ───────────────────────────────────

create table if not exists unsubscribe_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references crm_contacts(id) on delete cascade,
  list_id uuid references contact_lists(id) on delete set null,
  email text not null,
  reason text,
  source text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);$mig$,
  $mig$create index if not exists unsubscribe_events_contact_idx on unsubscribe_events (contact_id);$mig$,
  $mig$create index if not exists unsubscribe_events_email_idx on unsubscribe_events (email);$mig$,
  $mig$alter table unsubscribe_events enable row level security;$mig$,
  $mig$drop policy if exists "Admins read unsubscribe_events" on unsubscribe_events;$mig$,
  $mig$create policy "Admins read unsubscribe_events"
  on unsubscribe_events for select
  to authenticated
  using (is_admin_or_artist());$mig$,
  $mig$drop policy if exists "Anon insert unsubscribe_events" on unsubscribe_events;$mig$,
  $mig$create policy "Anon insert unsubscribe_events"
  on unsubscribe_events for insert
  to anon
  with check (true);$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260521000003'
 );

-- 20260615000001_margin_cascade_categories.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260615000001', 'margin_cascade_categories', ARRAY[
  $mig$-- Margin cascade (variant > product > category > site) + category default margins,
-- plus schema-drift fixes (product_categories was live-only; product_variants.updated_at
-- was written by code but never existed).

-- Category-level default markup % (NULL = inherit the site default).
alter table categories add column if not exists default_margin_pct numeric;$mig$,
  $mig$-- Product default margin becomes a true override: NULL = inherit category → site.
-- (Drop the old hard 100.0 default so an unset product actually inherits.)
alter table products alter column default_margin_pct drop default;$mig$,
  $mig$-- Many-to-many product↔category (cross-posting). Existed only in the live DB.
create table if not exists product_categories (
  product_id uuid not null references products(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);$mig$,
  $mig$create unique index if not exists product_categories_pk on product_categories(product_id, category_id);$mig$,
  $mig$-- Audit column the variant routes already write.
alter table product_variants add column if not exists updated_at timestamptz default now();$mig$,
  $mig$-- Single-statement re-price across the cascade. Pass a product OR a category OR
-- neither (= whole catalog). Re-applies the resolved markup
-- (variant ?? product ?? category ?? site ?? 100) to the stored Lumaprints cost
-- for every non-manual-override variant. Returns the count updated.
create or replace function reprice_variants(p_product uuid default null, p_category uuid default null)
returns integer language sql security definer as $$
  with site as (select coalesce(default_margin_pct, 100) m from site_settings where id = true),
  upd as (
    update product_variants v
    set price = (round(coalesce(v.lumaprints_cost_cents, 0)
                 * (1 + coalesce(v.margin_override_pct, p.default_margin_pct, c.default_margin_pct, (select m from site)) / 100.0))
                 + coalesce(v.shipping_cost_cents, 0)) / 100.0,
        updated_at = now()
    from products p
    left join categories c on c.id = p.category_id
    where v.product_id = p.id
      and v.manual_price_override_cents is null
      and (p_product is null or v.product_id = p_product)
      and (p_category is null or p.category_id = p_category)
    returning 1
  )
  select count(*)::int from upd;
$$;$mig$,
  $mig$revoke all on function reprice_variants(uuid, uuid) from anon;$mig$,
  $mig$grant execute on function reprice_variants(uuid, uuid) to authenticated, service_role;$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260615000001'
 );

-- 20260615000002_gross_margin_basis.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260615000002', 'gross_margin_basis', ARRAY[
  $mig$-- Margin now applies to the FULL landed cost (Lumaprints cost + shipping) instead
-- of being added after the markup:  price = (cost + shipping) × (1 + margin/100).
-- e.g. $35 cost + $12 shipping = $47, at 100% margin → $94.
create or replace function reprice_variants(p_product uuid default null, p_category uuid default null)
returns integer language sql security definer as $$
  with site as (select coalesce(default_margin_pct, 100) m from site_settings where id = true),
  upd as (
    update product_variants v
    set price = round((coalesce(v.lumaprints_cost_cents, 0) + coalesce(v.shipping_cost_cents, 0))
                 * (1 + coalesce(v.margin_override_pct, p.default_margin_pct, c.default_margin_pct, (select m from site)) / 100.0)) / 100.0,
        updated_at = now()
    from products p
    left join categories c on c.id = p.category_id
    where v.product_id = p.id
      and v.manual_price_override_cents is null
      and (p_product is null or v.product_id = p_product)
      and (p_category is null or p.category_id = p_category)
    returning 1
  )
  select count(*)::int from upd;
$$;$mig$,
  $mig$revoke all on function reprice_variants(uuid, uuid) from anon;$mig$,
  $mig$grant execute on function reprice_variants(uuid, uuid) to authenticated, service_role;$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260615000002'
 );

-- 20260615000003_product_category_sort.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260615000003', 'product_category_sort', ARRAY[
  $mig$-- Per-category manual display order for products. NULL = fall back to
-- created_at (newest first). Set per collection so the grid renders in a
-- deliberate, uniform order.
alter table public.product_categories
  add column if not exists sort_order integer;$mig$,
  $mig$-- Cactuses collection ordering. The shop grid renders row-major (left to right,
-- top to bottom), so this order is row-major and maps directly to the rows
-- Margaret laid out:
--   Row 1: Hot Air        | The Dual    | Solo
--   Row 2: Sometime       | Hot Air II  | Pins and Needles
--   Row 3: Don't Mind Me  | Saguaro     | Love Birds
with ord(slug, pos) as (
  values
    ('hot-air', 1), ('the-dual', 2), ('solo-print', 3),
    ('sometime', 4), ('hot-air-ii', 5), ('pins-and-needles', 6),
    ('dont-mind-me', 7), ('saguaro', 8), ('love-birds', 9)
)
update public.product_categories pc
set sort_order = ord.pos
from ord
join products p on p.slug = ord.slug
join categories c on c.slug = 'cactuses'
where pc.product_id = p.id and pc.category_id = c.id;$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260615000003'
 );

-- 20260615000004_rename_sometime_to_royal.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260615000004', 'rename_sometime_to_royal', ARRAY[
  $mig$-- Rename the cactus piece "Sometime" -> "Royal" across the catalog. Runs after
-- 2026061503 (which seeds the cactuses sort_order while the slug is still
-- 'sometime'), so replay order is correct. Storage object moves
-- (web/cactuses/sometime.webp -> royal.webp, masters/cactuses/sometime.jpg ->
-- royal.jpg) are handled by scripts/rename-royal.mjs; this migration repoints
-- the DB references.
update products
   set title = 'Royal', slug = 'royal', updated_at = now()
 where slug = 'sometime';$mig$,
  $mig$update product_images pi
   set alt_text = 'Royal - water gouache cactus painting',
       print_master_path = 'masters/cactuses/royal.jpg',
       url = replace(replace(url, 'cactuses/sometime.webp', 'cactuses/royal.webp'), '?v=2', '?v=3')
  from products p
 where pi.product_id = p.id and p.slug = 'royal';$mig$,
  $mig$update master_artworks
   set title = 'Royal', file_name = 'royal.jpg', storage_path = 'masters/cactuses/royal.jpg'
 where storage_path = 'masters/cactuses/sometime.jpg';$mig$,
  $mig$update product_variants pv
   set sku = replace(pv.sku, 'sometime-', 'royal-')
  from products p
 where pv.product_id = p.id and p.slug = 'royal' and pv.sku like 'sometime-%';$mig$,
  $mig$-- Repoint the media-library catalog entry for the old web asset to royal.webp.
update media_library
   set storage_path = 'web/cactuses/royal.webp',
       url = replace(url, 'cactuses/sometime.webp', 'cactuses/royal.webp'),
       file_name = 'royal.webp',
       updated_at = now()
 where storage_bucket = 'product-images' and storage_path = 'web/cactuses/sometime.webp';$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260615000004'
 );

-- 20260615000005_product_image_crop_original.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260615000005', 'product_image_crop_original', ARRAY[
  $mig$-- Non-destructive crop for product images. When an image is first cropped, its
-- pre-crop url + dimensions are saved here so "Revert to original" can restore
-- them. The original storage object is never deleted (crops upload to a separate
-- crops/<id>.webp key), so the original is always recoverable.
alter table public.product_images
  add column if not exists original_url text,
  add column if not exists original_width integer,
  add column if not exists original_height integer;$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260615000005'
 );

-- 20260805000001_public_print_readiness.sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260805000001', 'public_print_readiness', ARRAY[
  $mig$-- Expose only the minimum master-artwork facts the public storefront needs.
-- master_artworks itself remains admin-only because it contains private source
-- file names, storage paths, errors, and uploader metadata.

create or replace function public.get_public_print_readiness(p_product_ids uuid[])
returns table (
  product_id uuid,
  print_ready boolean,
  print_width_px integer,
  print_height_px integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id as product_id,
    coalesce(
      ma.print_status = 'ready' and ma.print_storage_path is not null,
      false
    ) as print_ready,
    ma.print_width_px,
    ma.print_height_px
  from public.products p
  left join public.master_artworks ma on ma.id = p.master_artwork_id
  where p.id = any(p_product_ids)
    and p.status in ('active', 'sold')
    and cardinality(p_product_ids) between 1 and 100;
$$;$mig$,
  $mig$revoke all on function public.get_public_print_readiness(uuid[]) from public, anon, authenticated;$mig$,
  $mig$grant execute on function public.get_public_print_readiness(uuid[]) to anon, authenticated, service_role;$mig$,
  $mig$comment on function public.get_public_print_readiness(uuid[]) is
  'Bounded public readiness projection; does not reveal private master-artwork storage paths.';$mig$
]::text[]
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260805000001'
 );

-- ---------------------------------------------------------------------------
-- 3. Verification. Both counts must be 0 before COMMIT.
-- ---------------------------------------------------------------------------

-- Rows whose name still carries an embedded numeric prefix (expect 0):
SELECT count(*) AS rows_with_embedded_prefix
  FROM supabase_migrations.schema_migrations
 WHERE name ~ '^[0-9]{6,}_';

-- Backfilled versions that failed to land (expect 0):
SELECT count(*) AS missing_backfills FROM (VALUES
  ('20260515000001'),
  ('20260519000001'),
  ('20260519000002'),
  ('20260519000003'),
  ('20260519000004'),
  ('20260520000001'),
  ('20260521000002'),
  ('20260521000003'),
  ('20260615000001'),
  ('20260615000002'),
  ('20260615000003'),
  ('20260615000004'),
  ('20260615000005'),
  ('20260805000001')
) AS v(version)
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = v.version
 );

COMMIT;
