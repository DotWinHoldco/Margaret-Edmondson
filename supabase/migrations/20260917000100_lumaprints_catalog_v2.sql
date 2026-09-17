-- =============================================================================
-- Catalog v2: the three print-catalog tables plus the sync-run cursor.
--
-- Why these tables exist (plan §4.1, ADR-1): today every LumaPrints id, bound,
-- DPI and option list is a compile-time constant collapsed into one
-- `lumaprints_mediums` row per family, so offering a second canvas depth or a
-- new frame profile is a deploy. These tables separate the three axes the
-- provider actually has -- medium (family) -> subcategory (the pricing and
-- ordering unit) -> option (grouped, per subcategory) -- and carry an `enabled`
-- toggle at every level, so the catalog changes without a deploy.
--
-- `lumaprints_mediums` is KEPT and untouched: it still drives the live store
-- until the P5 cutover. Nothing here reads or writes it.
--
-- Merge, never reset (ADR-7): sync writes only API-sourced fields on rows that
-- already exist. `enabled`, `is_default`, `display_label`, `description`,
-- `customer_note`, `sort_order`, `swatch`, `geometry`, `pricing_mode` and
-- `acknowledged_at` are the admin's, and a row that vanishes from the provider
-- is tombstoned (`removed_from_api`), never deleted -- order history points at
-- these rows by id.
-- =============================================================================

-- ── The pricing/ordering unit. One row per subcategory we can sell.
create table if not exists lumaprints_subcategories (
  id                uuid primary key default gen_random_uuid(),
  medium            text not null references lumaprints_mediums(medium),
  subcategory_id    integer not null,                 -- provider id (host-specific, §9 F12)
  api_host          text not null,                    -- which host that id came from
  name              text not null,                    -- provider name, verbatim
  display_label     text not null,                    -- customer label, admin-editable
  description       text,                             -- PDP copy, admin-editable
  min_width_in      numeric not null,
  max_width_in      numeric not null,
  min_height_in     numeric not null,
  max_height_in     numeric not null,
  required_dpi      integer not null,
  max_glass_w_in    numeric,                          -- null = the bounds are the ceiling (P4)
  max_glass_h_in    numeric,
  enabled           boolean not null default false,   -- admin toggle; new rows arrive OFF
  sort_order        integer not null default 0,
  customer_note     text,                             -- physical-product caveat shown on the PDP
  pricing_mode      text not null default 'additive'
    check (pricing_mode in ('additive', 'whole_config')),
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  acknowledged_at   timestamptz,                      -- null = still badged NEW in the admin
  removed_from_api  boolean not null default false,   -- sync tombstone
  last_synced_at    timestamptz,
  unique (api_host, subcategory_id)
);

comment on table lumaprints_subcategories is
  'One provider subcategory (the pricing and ordering unit: canvas depth, paper type, frame profile, metal surface) per host. Written only by catalog sync v2; enabled and every display field belong to the admin.';

create index if not exists lumaprints_subcategories_medium_idx
  on lumaprints_subcategories (medium);
create index if not exists lumaprints_subcategories_host_enabled_idx
  on lumaprints_subcategories (api_host, enabled);

-- ── Option groups, per subcategory. `group_key` is the canonical, host- and
-- depth-independent name so one rule covers every sibling subcategory.
create table if not exists lumaprints_option_groups (
  id                  uuid primary key default gen_random_uuid(),
  subcategory_ref     uuid not null references lumaprints_subcategories(id) on delete cascade,
  group_key           text not null,
  api_group_name      text not null,                  -- provider name, verbatim
  display_label       text not null,
  required            boolean not null default false, -- learned: the provider rejects an empty set (P1)
  customer_visible    boolean not null default true,  -- false = admin-pinned, never shown
  enabled             boolean not null default false,
  display_kind        text not null default 'list'
    check (display_kind in ('swatch', 'list', 'radio')),
  depends_on_group    text,                           -- group_key gating this group's visibility
  depends_hidden_when jsonb,                          -- sibling option ids that hide this group
  sort_order          integer not null default 0,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  acknowledged_at     timestamptz,
  removed_from_api    boolean not null default false,
  unique (subcategory_ref, group_key)
);

comment on table lumaprints_option_groups is
  'A provider option group on one subcategory. `required` is seeded from the recorded probe of an empty options array, never from id arithmetic.';

create index if not exists lumaprints_option_groups_subcategory_idx
  on lumaprints_option_groups (subcategory_ref);

-- ── Options, per group.
create table if not exists lumaprints_options (
  id                uuid primary key default gen_random_uuid(),
  group_ref         uuid not null references lumaprints_option_groups(id) on delete cascade,
  option_id         integer not null,                 -- provider id (host-specific)
  api_option_name   text not null,                    -- provider name, verbatim
  display_label     text not null,
  enabled           boolean not null default false,
  is_default        boolean not null default false,   -- OUR geometry-neutral default
  provider_default  boolean not null default false,   -- what the provider resolves for an empty set
  sort_order        integer not null default 0,
  swatch            jsonb,                            -- preview material (ADR-6)
  geometry          jsonb,                            -- physical effect (ADR-4)
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  acknowledged_at   timestamptz,
  removed_from_api  boolean not null default false,
  unique (group_ref, option_id)
);

comment on table lumaprints_options is
  'One selectable provider option. `is_default` is OUR geometry-neutral choice (Mirror Wrap, No Bleed), deliberately not the provider default, which resolves to geometry-hostile values for an empty options array.';

create index if not exists lumaprints_options_group_idx
  on lumaprints_options (group_ref);

-- Exactly one default per group, enforced by the database rather than by hope:
-- the quote, checkout and submit paths all fill untouched groups from it, so two
-- defaults (or none) would silently change which physical product is ordered.
create unique index if not exists lumaprints_options_one_default_per_group
  on lumaprints_options (group_ref)
  where is_default;

-- ── The chunked sync cursor (ADR-7 / §9 F24). A full walk is minutes of
-- provider time and the house invocation ceiling is 60s, so a run is a row that
-- successive invocations advance.
create table if not exists catalog_sync_runs (
  id          uuid primary key default gen_random_uuid(),
  api_host    text not null,
  status      text not null check (status in ('running', 'completed', 'failed', 'cancelled')),
  dry_run     boolean not null default false,
  cursor      jsonb not null default '{"stage":"categories"}'::jsonb,
  stats       jsonb not null default '{}'::jsonb,
  diff        jsonb,                                  -- dry run only: what a real run would change
  error       text,
  started_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  finished_at timestamptz
);

comment on table catalog_sync_runs is
  'One catalog sync run. Chunked and cursor-resumable: each invocation advances the cursor only after its writes succeeded, so a timeout never leaves a half-merged catalog.';

-- At most one run in flight per host, so a cron tick and an admin button press
-- cannot walk the same catalog at the same time and burn the shared rate limit.
create unique index if not exists catalog_sync_runs_one_running_per_host
  on catalog_sync_runs (api_host)
  where status = 'running';

-- =============================================================================
-- Row level security. Mirrors the lumaprints_mediums pattern: staff manage,
-- the public reads only rows that are enabled and still in the provider catalog.
-- Sync itself runs as the service role, which bypasses RLS by design.
-- =============================================================================

alter table lumaprints_subcategories enable row level security;
alter table lumaprints_option_groups enable row level security;
alter table lumaprints_options       enable row level security;
alter table catalog_sync_runs        enable row level security;

drop policy if exists "Admins manage lumaprints_subcategories" on lumaprints_subcategories;
create policy "Admins manage lumaprints_subcategories"
  on lumaprints_subcategories for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

drop policy if exists "Public read enabled lumaprints_subcategories" on lumaprints_subcategories;
create policy "Public read enabled lumaprints_subcategories"
  on lumaprints_subcategories for select
  using (enabled = true and removed_from_api = false);

drop policy if exists "Admins manage lumaprints_option_groups" on lumaprints_option_groups;
create policy "Admins manage lumaprints_option_groups"
  on lumaprints_option_groups for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

drop policy if exists "Public read enabled lumaprints_option_groups" on lumaprints_option_groups;
create policy "Public read enabled lumaprints_option_groups"
  on lumaprints_option_groups for select
  using (enabled = true and removed_from_api = false);

drop policy if exists "Admins manage lumaprints_options" on lumaprints_options;
create policy "Admins manage lumaprints_options"
  on lumaprints_options for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

drop policy if exists "Public read enabled lumaprints_options" on lumaprints_options;
create policy "Public read enabled lumaprints_options"
  on lumaprints_options for select
  using (enabled = true and removed_from_api = false);

-- Sync runs carry operational detail (cursor, counts, failure text) and nothing
-- a customer needs: staff only, and no public policy at all.
drop policy if exists "Admins read catalog_sync_runs" on catalog_sync_runs;
create policy "Admins read catalog_sync_runs"
  on catalog_sync_runs for select
  to authenticated
  using (is_admin_or_artist());

-- =============================================================================
-- Grants. The policy layer decides WHICH rows; the grant layer decides which
-- verbs exist at all. Browser roles never hold DELETE on catalog rows: a
-- disappeared option is tombstoned, and order history references it forever.
-- P3's admin toggles are UPDATEs that pass through the "Admins manage" policy.
-- =============================================================================

revoke all on public.lumaprints_subcategories from anon, authenticated;
revoke all on public.lumaprints_option_groups from anon, authenticated;
revoke all on public.lumaprints_options       from anon, authenticated;
revoke all on public.catalog_sync_runs        from anon, authenticated;

grant select on public.lumaprints_subcategories to anon, authenticated;
grant select on public.lumaprints_option_groups to anon, authenticated;
grant select on public.lumaprints_options       to anon, authenticated;

grant insert, update on public.lumaprints_subcategories to authenticated;
grant insert, update on public.lumaprints_option_groups to authenticated;
grant insert, update on public.lumaprints_options       to authenticated;

-- Staff read their own run history through the policy above; runs are created
-- and advanced only by the sync process, which is the service role.
grant select on public.catalog_sync_runs to authenticated;

grant all on public.lumaprints_subcategories to service_role;
grant all on public.lumaprints_option_groups to service_role;
grant all on public.lumaprints_options       to service_role;
grant all on public.catalog_sync_runs        to service_role;
