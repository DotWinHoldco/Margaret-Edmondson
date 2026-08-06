-- This file groups the two ad-hoc migrations applied during the variant/about
-- cleanup pass: the print-variant backfill and the bio_sections image columns.
-- Both have already been applied to production; this is the canonical record.

-- 1) Backfill: pre-Phase-5 print variants had variant_type set but no medium.
update product_variants pv set
  medium = case when variant_type = 'framed_canvas_print' then 'framed_canvas' else 'canvas' end,
  size_label = replace(replace(fulfillment_metadata->>'size', '×', 'x'), ' ', ''),
  width_in = nullif(split_part(replace(replace(fulfillment_metadata->>'size', '×', 'x'), ' ', ''), 'x', 1), '')::numeric,
  height_in = nullif(split_part(replace(replace(fulfillment_metadata->>'size', '×', 'x'), ' ', ''), 'x', 2), '')::numeric,
  lumaprints_cost_cents = coalesce(lumaprints_cost_cents, round(coalesce(wholesale_cost, 0) * 100)::integer),
  shipping_cost_cents = coalesce(shipping_cost_cents, round(coalesce(worst_case_shipping, 0) * 100)::integer),
  last_priced_at = coalesce(last_priced_at, shipping_quoted_at, now())
where variant_type in ('canvas_print','framed_canvas_print')
  and medium is null
  and fulfillment_metadata ? 'size';

-- 2) About builder: optional image per section.
alter table bio_sections
  add column if not exists image_url text,
  add column if not exists image_alt text;

-- 3) Storage: about-images bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('about-images', 'about-images', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Public read about-images" on storage.objects;
create policy "Public read about-images" on storage.objects
  for select using (bucket_id = 'about-images');

drop policy if exists "Admins manage about-images" on storage.objects;
create policy "Admins manage about-images" on storage.objects
  for all to authenticated
  using (bucket_id = 'about-images' and is_admin_or_artist())
  with check (bucket_id = 'about-images' and is_admin_or_artist());
