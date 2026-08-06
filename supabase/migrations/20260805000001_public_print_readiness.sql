-- Expose only the minimum master-artwork facts the public storefront needs.
-- master_artworks itself remains admin-only because it contains private source
-- file names, storage paths, errors, and uploader metadata.

create or replace function public.get_public_print_readiness(p_product_ids uuid[])
returns table (
  product_id uuid,
  print_ready boolean,
  print_width_px integer,
  print_height_px integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id as product_id,
    coalesce(
      ma.print_status = 'ready' and ma.print_storage_path is not null,
      false
    ) as print_ready,
    ma.print_width_px,
    ma.print_height_px
  from public.products p
  left join public.master_artworks ma on ma.id = p.master_artwork_id
  where p.id = any(p_product_ids)
    and p.status in ('active', 'sold')
    and cardinality(p_product_ids) between 1 and 100;
$$;

revoke all on function public.get_public_print_readiness(uuid[]) from public, anon, authenticated;
grant execute on function public.get_public_print_readiness(uuid[]) to anon, authenticated, service_role;

comment on function public.get_public_print_readiness(uuid[]) is
  'Bounded public readiness projection; does not reveal private master-artwork storage paths.';
