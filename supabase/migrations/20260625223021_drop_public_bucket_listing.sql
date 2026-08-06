-- Authored by DotWin
-- Stop anonymous object enumeration of the public storage buckets
-- (advisor: public_bucket_allows_listing) for about-images, library,
-- product-images, and testimonials.
--
-- A PUBLIC bucket serves object bytes at
--   /storage/v1/object/public/<bucket>/<path>
-- with no storage.objects SELECT policy required. The broad "Public read ..."
-- SELECT policies on storage.objects do NOT enable those public URLs; they only
-- let any anon/authenticated client call the storage list()/download() API and
-- enumerate every object in the bucket. The storefront renders public URLs
-- stored in the database and never lists these buckets, and admin tooling reads
-- the media_library table and writes through the per-bucket admin-manage
-- policies, so removing the public-read SELECT policies closes the enumeration
-- hole without affecting any read or write path.
--
-- Scope: drop ONLY the broad public-read SELECT policies. The admin-manage
-- (write) policies and the private PII buckets are left untouched.
--
-- Idempotent / replay-safe: every drop uses "if exists", so this is a no-op on
-- a database where the policies were already removed or never created.

drop policy if exists "Public read about-images" on storage.objects;

drop policy if exists "Public read library" on storage.objects;

drop policy if exists "Public read access" on storage.objects;

drop policy if exists "Public read testimonials bucket" on storage.objects;
