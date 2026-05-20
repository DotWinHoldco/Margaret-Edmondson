-- Central media library: every image upload registered here so the
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
);

create index if not exists media_library_categories_idx on media_library using gin (categories);
create index if not exists media_library_created_at_idx on media_library (created_at desc);
create index if not exists media_library_bucket_idx on media_library (storage_bucket);

alter table media_library enable row level security;

drop policy if exists "Admins manage media_library" on media_library;
create policy "Admins manage media_library"
  on media_library for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

-- Library bucket: target for un-attributed uploads via the media manager.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', true, 20971520, array['image/jpeg','image/png','image/webp','image/avif','image/gif','image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists "Public read library" on storage.objects;
create policy "Public read library" on storage.objects
  for select using (bucket_id = 'library');

drop policy if exists "Admins manage library" on storage.objects;
create policy "Admins manage library" on storage.objects
  for all to authenticated
  using (bucket_id = 'library' and is_admin_or_artist())
  with check (bucket_id = 'library' and is_admin_or_artist());
