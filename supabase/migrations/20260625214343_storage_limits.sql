-- Authored by DotWin
-- Bound the 'testimonials' storage bucket. The bucket was created without a
-- file_size_limit or allowed_mime_types, so an admin upload could write an
-- arbitrarily large (or non-image) object and exhaust storage. Cap it at the
-- same 10 MB image budget used by the 'about-images' bucket
-- (20260519_phase5b_cleanup.sql).
--
-- Idempotent / replay-safe: file_size_limit is set unconditionally (bounding it
-- is the fix); allowed_mime_types is only narrowed when currently unconstrained
-- (coalesce keeps any existing constraint). Targets the live bucket by id, so it
-- is a no-op if the bucket does not exist.
update storage.buckets
set
  file_size_limit = 10485760, -- 10 MB, matching about-images
  allowed_mime_types = coalesce(
    allowed_mime_types,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  )
where id = 'testimonials';
