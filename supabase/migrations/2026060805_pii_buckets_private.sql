-- A-15: Make the two PII storage buckets private and remove anonymous read.
-- commission-references = customer-uploaded reference photos/PDFs.
-- class-pet-photos      = customer pet photos from class bookings.
-- Public UPLOAD policies stay (the public commission/class forms write here);
-- the public READ/list policies are dropped and replaced with admin-only read.
-- Admin UIs render these via service-role signed URLs (createSignedUrl).
-- NOTE: actual policy names verified in DB are "Public read commission references"
-- and "Public read pet photos" (spaces, not hyphens).
-- Down (manual revert):
--   UPDATE storage.buckets SET public = true WHERE id IN ('commission-references','class-pet-photos');
--   recreate the dropped "Public read ..." SELECT policies; drop the "Admins read ..." ones.

UPDATE storage.buckets SET public = false WHERE id IN ('commission-references', 'class-pet-photos');

DROP POLICY IF EXISTS "Public read commission references" ON storage.objects;
DROP POLICY IF EXISTS "Public read pet photos" ON storage.objects;
-- defensive: also drop the hyphenated names in case any env created them
DROP POLICY IF EXISTS "Public read commission-references" ON storage.objects;
DROP POLICY IF EXISTS "Public read class-pet-photos" ON storage.objects;

DROP POLICY IF EXISTS "Admins read commission references" ON storage.objects;
CREATE POLICY "Admins read commission references" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'commission-references' AND public.is_admin_or_artist());

DROP POLICY IF EXISTS "Admins read pet photos" ON storage.objects;
CREATE POLICY "Admins read pet photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'class-pet-photos' AND public.is_admin_or_artist());
