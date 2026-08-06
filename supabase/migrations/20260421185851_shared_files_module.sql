-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260421185851
-- Ledger name:    shared_files_module


-- shared_files: two-way file sharing between Margaret (artist) and super-admin (admin)
create table if not exists public.shared_files (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('testimonial','work_request','note','general')),
  entity_id uuid,
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  tag text not null default 'general',
  notes text,
  ai_processed boolean not null default false,
  ai_result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shared_files_entity_idx on public.shared_files(entity_type, entity_id);
create index if not exists shared_files_tag_idx on public.shared_files(tag);
create index if not exists shared_files_created_at_idx on public.shared_files(created_at desc);

alter table public.shared_files enable row level security;

-- Helper: is the caller an admin or artist?
create or replace function public.is_admin_or_artist()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','artist')
  );
$$;

drop policy if exists "shared_files_read_admins" on public.shared_files;
create policy "shared_files_read_admins" on public.shared_files
  for select using (public.is_admin_or_artist());

drop policy if exists "shared_files_insert_admins" on public.shared_files;
create policy "shared_files_insert_admins" on public.shared_files
  for insert with check (public.is_admin_or_artist() and uploaded_by = auth.uid());

drop policy if exists "shared_files_update_admins" on public.shared_files;
create policy "shared_files_update_admins" on public.shared_files
  for update using (public.is_admin_or_artist());

drop policy if exists "shared_files_delete_admins" on public.shared_files;
create policy "shared_files_delete_admins" on public.shared_files
  for delete using (public.is_admin_or_artist());

-- Private bucket for shared files
insert into storage.buckets (id, name, public)
values ('shared-files','shared-files', false)
on conflict (id) do nothing;

-- Storage RLS: only admins/artists can read/write the shared-files bucket
drop policy if exists "shared_files_bucket_read" on storage.objects;
create policy "shared_files_bucket_read" on storage.objects
  for select using (bucket_id = 'shared-files' and public.is_admin_or_artist());

drop policy if exists "shared_files_bucket_insert" on storage.objects;
create policy "shared_files_bucket_insert" on storage.objects
  for insert with check (bucket_id = 'shared-files' and public.is_admin_or_artist());

drop policy if exists "shared_files_bucket_update" on storage.objects;
create policy "shared_files_bucket_update" on storage.objects
  for update using (bucket_id = 'shared-files' and public.is_admin_or_artist());

drop policy if exists "shared_files_bucket_delete" on storage.objects;
create policy "shared_files_bucket_delete" on storage.objects
  for delete using (bucket_id = 'shared-files' and public.is_admin_or_artist());
