-- Master Artworks: first-class library of mega-resolution source files.
--
-- A master artwork is the 300dpi source file Margaret uploads once. Many
-- products (canvas SKU, metal SKU, future t-shirt SKU) can reference the
-- same artwork via products.master_artwork_id. The fulfillment router
-- mints a signed URL from print-masters bucket at order time and POSTs it
-- to Lumaprints / Printful.

create table if not exists master_artworks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  storage_path text not null,
  file_name text not null,
  file_size_bytes bigint not null default 0,
  mime_type text not null,
  width_px integer,
  height_px integer,
  dpi integer,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists master_artworks_storage_path_uidx
  on master_artworks (storage_path);

create index if not exists master_artworks_created_idx
  on master_artworks (created_at desc);

alter table master_artworks enable row level security;

drop policy if exists master_artworks_admin_all on master_artworks;
create policy master_artworks_admin_all on master_artworks
  for all to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

alter table products
  add column if not exists master_artwork_id uuid references master_artworks(id) on delete set null;

create index if not exists products_master_artwork_idx
  on products (master_artwork_id);

-- Idempotent backfill: create one master_artworks row per unique
-- print_master_path on a primary product image, then link every product
-- whose primary image has that path. Re-running is a no-op because
-- the unique index on storage_path blocks duplicates and the WHERE
-- master_artwork_id is null guard prevents re-linking.

insert into master_artworks (title, storage_path, file_name, file_size_bytes, mime_type)
select
  p.title,
  pi.print_master_path,
  split_part(pi.print_master_path, '/', -1),
  0,
  coalesce(
    case
      when pi.print_master_path ilike '%.jpg' or pi.print_master_path ilike '%.jpeg' then 'image/jpeg'
      when pi.print_master_path ilike '%.png' then 'image/png'
      when pi.print_master_path ilike '%.tif' or pi.print_master_path ilike '%.tiff' then 'image/tiff'
      when pi.print_master_path ilike '%.pdf' then 'application/pdf'
      else 'application/octet-stream'
    end,
    'application/octet-stream'
  )
from product_images pi
join products p on p.id = pi.product_id
where pi.print_master_path is not null
  and pi.is_primary = true
  and not exists (
    select 1 from master_artworks ma
    where ma.storage_path = pi.print_master_path
  )
on conflict (storage_path) do nothing;

update products p
  set master_artwork_id = ma.id
  from product_images pi
  join master_artworks ma on ma.storage_path = pi.print_master_path
  where pi.product_id = p.id
    and pi.is_primary = true
    and pi.print_master_path is not null
    and p.master_artwork_id is null;
