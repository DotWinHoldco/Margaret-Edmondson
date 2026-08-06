-- 2026080606_storage_upload_lockdown.sql
-- Authored by DotWin
--
-- Close anonymous direct writes to the two PII storage buckets.
--
-- commission-references and class-pet-photos each carried an INSERT policy
-- granted to PUBLIC whose only condition was the bucket id:
--
--   "Public upload commission references"  for insert  with check (bucket_id = 'commission-references')
--   "Public upload pet photos"             for insert  with check (bucket_id = 'class-pet-photos')
--
-- Anyone holding the publishable anon key (it ships in the browser bundle)
-- could therefore write objects into these private buckets directly, at any
-- path and in any quantity, without ever touching an API route. Every control
-- the application had (rate limits, input validation, file-count caps, the
-- pending/<folder>/ path shape) sat on a door the traffic did not have to use,
-- and the resulting objects are billed storage the studio cannot see from the
-- admin UI because they are attached to no commission or booking.
--
-- After this migration the only anonymous path in is POST /api/uploads/signed-url,
-- which rate limits, requires an anti-bot intent token, enforces the per-bucket
-- file-count / size / MIME ceilings, generates the storage path itself, and
-- mints a signed upload URL with the service-role client. Uploading with such a
-- token requires no storage.objects policy at all, so the buckets can stay shut
-- to anonymous writers while the public forms keep working.
--
-- The admin media uploader (POST /api/admin/media/upload) writes to these two
-- buckets with the *authenticated admin* client and, until now, relied on the
-- same PUBLIC insert policy. Admin-gated INSERT/UPDATE policies are added here
-- so that path keeps working on its own authorization rather than on a policy
-- that let the whole internet in. Admin read and delete policies already exist
-- (2026060805_pii_buckets_private.sql).
--
-- Idempotent / replay-safe: every drop uses "if exists" and every create is
-- preceded by a drop.

-- 1) Remove the anonymous write grants.
drop policy if exists "Public upload commission references" on storage.objects;
drop policy if exists "Public upload pet photos"            on storage.objects;
-- defensive: hyphenated variants some environments created by hand.
drop policy if exists "Public upload commission-references" on storage.objects;
drop policy if exists "Public upload class-pet-photos"      on storage.objects;

-- 2) Keep the admin media uploader working on admin authorization.
drop policy if exists "Admins write commission references"  on storage.objects;
create policy "Admins write commission references" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'commission-references' and public.is_admin_or_artist());

drop policy if exists "Admins update commission references" on storage.objects;
create policy "Admins update commission references" on storage.objects
  for update to authenticated
  using (bucket_id = 'commission-references' and public.is_admin_or_artist())
  with check (bucket_id = 'commission-references' and public.is_admin_or_artist());

drop policy if exists "Admins write pet photos"  on storage.objects;
create policy "Admins write pet photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'class-pet-photos' and public.is_admin_or_artist());

drop policy if exists "Admins update pet photos" on storage.objects;
create policy "Admins update pet photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'class-pet-photos' and public.is_admin_or_artist())
  with check (bucket_id = 'class-pet-photos' and public.is_admin_or_artist());
