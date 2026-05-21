-- print-masters storage bucket for mega-resolution source files.
--
-- Private bucket (no public reads). Admin/artist writes only.
-- Fulfillment router mints 1-hour signed URLs to share with Lumaprints
-- and Printful at order-fire time.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'print-masters',
  'print-masters',
  false,
  524288000, -- 500 MB
  array['image/jpeg','image/png','image/tiff','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin read print-masters" on storage.objects;
create policy "Admin read print-masters" on storage.objects
  for select to authenticated
  using (bucket_id = 'print-masters' and is_admin_or_artist());

drop policy if exists "Admin write print-masters" on storage.objects;
create policy "Admin write print-masters" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'print-masters' and is_admin_or_artist());

drop policy if exists "Admin update print-masters" on storage.objects;
create policy "Admin update print-masters" on storage.objects
  for update to authenticated
  using (bucket_id = 'print-masters' and is_admin_or_artist())
  with check (bucket_id = 'print-masters' and is_admin_or_artist());

drop policy if exists "Admin delete print-masters" on storage.objects;
create policy "Admin delete print-masters" on storage.objects
  for delete to authenticated
  using (bucket_id = 'print-masters' and is_admin_or_artist());
