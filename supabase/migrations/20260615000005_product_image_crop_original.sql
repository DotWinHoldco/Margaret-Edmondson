-- Non-destructive crop for product images. When an image is first cropped, its
-- pre-crop url + dimensions are saved here so "Revert to original" can restore
-- them. The original storage object is never deleted (crops upload to a separate
-- crops/<id>.webp key), so the original is always recoverable.
alter table public.product_images
  add column if not exists original_url text,
  add column if not exists original_width integer,
  add column if not exists original_height integer;
