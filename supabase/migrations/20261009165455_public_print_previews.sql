-- Only small public derivatives belong here. Original/print master paths stay private.
alter table public.master_artworks
  add column if not exists print_preview_storage_path text;

alter table public.master_artworks
  add constraint master_artworks_print_preview_path_check
  check (print_preview_storage_path is null or print_preview_storage_path ~
    '^print-previews/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$');

create or replace function public.get_public_print_previews(p_product_ids uuid[])
returns table (product_id uuid, preview_storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, ma.print_preview_storage_path
  from public.products p
  join public.master_artworks ma on ma.id = p.master_artwork_id
  where p.id = any(p_product_ids)
    and cardinality(p_product_ids) between 1 and 100
    and p.status in ('active', 'sold')
    and p.prints_enabled = true
    and ma.print_status = 'ready'
    and ma.print_storage_path is not null
    and ma.print_preview_storage_path is not null;
$$;

revoke all on function public.get_public_print_previews(uuid[]) from public, anon, authenticated;
grant execute on function public.get_public_print_previews(uuid[]) to anon, authenticated, service_role;
comment on function public.get_public_print_previews(uuid[]) is
  'Bounded public derivative projection for published print products; never exposes private source or print paths.';
