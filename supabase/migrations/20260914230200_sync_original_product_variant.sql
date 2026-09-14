-- Authored by DotWin. Original artwork is one inventory-backed option alongside prints.
-- Do not backfill flags or stock: existing listings change only when explicitly saved.
create unique index product_variants_one_original
  on public.product_variants(product_id) where variant_type = 'original';

create function public.sync_original_product_variant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_original and (new.base_price is null or new.base_price <= 0 or new.base_price > 1000000) then
    raise exception using errcode = '23514', message = 'Original artwork needs a positive Base price up to $1,000,000.',
      constraint = 'original_artwork_price';
  end if;

  -- A price-only edit must not change the availability of a legacy original
  -- whose product flag was never set. The checkbox owns activation.
  if tg_argv[0] = 'price_only' then
    update public.product_variants set
      price = new.base_price,
      studio_price_cents = case when new.base_price > 0 then round(new.base_price * 100)::integer else null end,
      updated_at = now()
    where product_id = new.id and variant_type = 'original';
    return new;
  end if;

  if new.is_original then
    insert into public.product_variants (
      product_id, name, variant_type, price, inventory_count, sort_order,
      is_active, is_lumaprints_available, studio_price_cents, studio_is_active,
      studio_only, studio_source_approved
    ) values (
      new.id, 'Original', 'original', new.base_price, case when new.status = 'sold' then 0 else 1 end, 0,
      true, false, round(new.base_price * 100)::integer, true, true, true
    )
    on conflict (product_id) where variant_type = 'original' do update set
      price = excluded.price,
      studio_price_cents = excluded.studio_price_cents,
      is_active = true,
      studio_is_active = true,
      studio_only = true,
      studio_source_approved = true,
      is_lumaprints_available = false,
      updated_at = now();
    -- Inventory is intentionally absent from the UPDATE: a sold original stays sold.
  else
    update public.product_variants set
      is_active = false, studio_is_active = false,
      price = new.base_price,
      studio_price_cents = case when new.base_price > 0 then round(new.base_price * 100)::integer else null end,
      updated_at = now()
    where product_id = new.id and variant_type = 'original';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_original_product_variant() from public, anon, authenticated;

-- UPDATE OF also runs when the explicit checkbox value is unchanged. Saving an
-- already-checked legacy listing can therefore create its missing original option.
create trigger original_product_variant_sync
  after insert or update of is_original on public.products
  for each row execute function public.sync_original_product_variant('availability');

create trigger original_product_variant_price
  after update of base_price on public.products
  for each row when (old.base_price is distinct from new.base_price)
  execute function public.sync_original_product_variant('price_only');
