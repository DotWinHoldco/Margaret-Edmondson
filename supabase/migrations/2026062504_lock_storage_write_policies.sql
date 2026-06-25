-- Authored by DotWin
-- Lock storage write/read authorization to admins. Several buckets carried broad
-- "any authenticated user" storage.objects policies alongside (or instead of) the
-- admin-gated ones, so any signed-in customer could:
--   * read, overwrite, or delete the PRIVATE high-resolution print-master scans
--     (the artist's source IP) — confidentiality + integrity;
--   * upload/overwrite/delete product-catalog images — integrity/vandalism;
--   * write/delete testimonial-bucket objects — integrity.
-- Replace the broad policies with admin-gated equivalents. The legitimate paths are
-- unaffected: admin upload/delete routes use the authenticated admin client
-- (is_admin_or_artist() = true), and fulfillment reads masters via the service-role
-- client (RLS bypass). Idempotent / replay-safe (drop-if-exists then create).

-- print-masters (PRIVATE, high-res source IP): drop the any-authenticated over-grants.
-- The admin-gated "Admin read/write/update/delete print-masters" policies remain and
-- cover the admin path; fulfillment uses the service-role client.
drop policy if exists "Auth can read print-masters"   on storage.objects;
drop policy if exists "Auth can write print-masters"  on storage.objects;
drop policy if exists "Auth can update print-masters"  on storage.objects;
drop policy if exists "Auth can delete print-masters"  on storage.objects;

-- product-images (PUBLIC bucket; objects served via public URL, no SELECT policy needed):
-- replace broad authenticated write with an admin-gated manage policy.
drop policy if exists "Authenticated users can upload" on storage.objects;
drop policy if exists "Authenticated users can update" on storage.objects;
drop policy if exists "Authenticated users can delete" on storage.objects;
drop policy if exists "Admins manage product-images"   on storage.objects;
create policy "Admins manage product-images" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-images' and is_admin_or_artist())
  with check (bucket_id = 'product-images' and is_admin_or_artist());

-- testimonials (PUBLIC bucket): replace broad authenticated write with admin-gated.
drop policy if exists "Auth write testimonials bucket" on storage.objects;
drop policy if exists "Admins manage testimonials"     on storage.objects;
create policy "Admins manage testimonials" on storage.objects
  for all to authenticated
  using (bucket_id = 'testimonials' and is_admin_or_artist())
  with check (bucket_id = 'testimonials' and is_admin_or_artist());
