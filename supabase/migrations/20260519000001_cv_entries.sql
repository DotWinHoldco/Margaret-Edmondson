-- Phase 4: CV builder schema

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
);

create index if not exists cv_entries_section_sort_idx
  on cv_entries (section, sort_year_numeric desc, display_order asc, title asc);

alter table cv_entries enable row level security;

drop policy if exists "Public can read published cv_entries" on cv_entries;
create policy "Public can read published cv_entries"
  on cv_entries for select
  using (is_published = true);

drop policy if exists "Admins manage cv_entries" on cv_entries;
create policy "Admins manage cv_entries"
  on cv_entries for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

-- Singleton settings row for the CV header (intro paragraph + last updated override).
create table if not exists cv_settings (
  id boolean primary key default true check (id),
  intro text not null default 'Selected exhibitions, education, and teaching experience.',
  contact_email text not null default 'margaret117art@gmail.com',
  updated_at timestamptz not null default now()
);

alter table cv_settings enable row level security;

drop policy if exists "Public can read cv_settings" on cv_settings;
create policy "Public can read cv_settings"
  on cv_settings for select
  using (true);

drop policy if exists "Admins manage cv_settings" on cv_settings;
create policy "Admins manage cv_settings"
  on cv_settings for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

insert into cv_settings (id) values (true) on conflict (id) do nothing;
