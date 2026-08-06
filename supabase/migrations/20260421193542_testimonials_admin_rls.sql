-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260421193542
-- Ledger name:    testimonials_admin_rls


-- testimonials: admin/artist full write access
drop policy if exists "testimonials_admin_insert" on public.testimonials;
create policy "testimonials_admin_insert" on public.testimonials
  for insert with check (public.is_admin_or_artist());

drop policy if exists "testimonials_admin_update" on public.testimonials;
create policy "testimonials_admin_update" on public.testimonials
  for update using (public.is_admin_or_artist())
  with check (public.is_admin_or_artist());

drop policy if exists "testimonials_admin_delete" on public.testimonials;
create policy "testimonials_admin_delete" on public.testimonials
  for delete using (public.is_admin_or_artist());

drop policy if exists "testimonials_admin_read_all" on public.testimonials;
create policy "testimonials_admin_read_all" on public.testimonials
  for select using (public.is_admin_or_artist());

-- testimonial_media: tighten existing ALL policy to admin/artist only
drop policy if exists "Authenticated write testimonial_media" on public.testimonial_media;
drop policy if exists "testimonial_media_admin_insert" on public.testimonial_media;
create policy "testimonial_media_admin_insert" on public.testimonial_media
  for insert with check (public.is_admin_or_artist());

drop policy if exists "testimonial_media_admin_update" on public.testimonial_media;
create policy "testimonial_media_admin_update" on public.testimonial_media
  for update using (public.is_admin_or_artist())
  with check (public.is_admin_or_artist());

drop policy if exists "testimonial_media_admin_delete" on public.testimonial_media;
create policy "testimonial_media_admin_delete" on public.testimonial_media
  for delete using (public.is_admin_or_artist());
