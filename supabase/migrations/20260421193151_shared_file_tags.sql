-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260421193151
-- Ledger name:    shared_file_tags


create table if not exists public.shared_file_tags (
  slug text primary key,
  label text not null,
  sort_order int not null default 100,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.shared_file_tags enable row level security;

drop policy if exists "shared_file_tags_read" on public.shared_file_tags;
create policy "shared_file_tags_read" on public.shared_file_tags
  for select using (public.is_admin_or_artist());

drop policy if exists "shared_file_tags_insert" on public.shared_file_tags;
create policy "shared_file_tags_insert" on public.shared_file_tags
  for insert with check (public.is_admin_or_artist());

drop policy if exists "shared_file_tags_update" on public.shared_file_tags;
create policy "shared_file_tags_update" on public.shared_file_tags
  for update using (public.is_admin_or_artist());

drop policy if exists "shared_file_tags_delete" on public.shared_file_tags;
create policy "shared_file_tags_delete" on public.shared_file_tags
  for delete using (public.is_admin_or_artist() and not is_default);

insert into public.shared_file_tags (slug, label, sort_order, is_default) values
  ('testimonial',       'Testimonials',            10, true),
  ('work_request',      'Work Request Document',   20, true),
  ('note',              'Notes',                   30, true),
  ('website_image',     'Website Images',          40, true),
  ('product_image',     'Product Images',          50, true),
  ('social_media_post', 'Social Media Posts',      60, true),
  ('creative',          'Creatives',               70, true),
  ('contract',          'Contracts',               80, true),
  ('reference',         'Reference Files',         90, true),
  ('general',           'General / Other',        999, true)
on conflict (slug) do nothing;
