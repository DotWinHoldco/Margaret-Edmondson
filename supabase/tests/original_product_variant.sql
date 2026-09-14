-- Run after sync_original_product_variant on a disposable test database.
-- Every fixture and assertion is rolled back, including after an assertion failure.
begin;
do $$
declare
  p uuid := gen_random_uuid();
  legacy uuid := gen_random_uuid();
  sold uuid := gen_random_uuid();
  original_id uuid;
  print_id uuid := gen_random_uuid();
  original public.product_variants;
  print_before jsonb;
begin
  insert into public.products(id,title,slug,base_price,is_original,prints_enabled,fulfillment_type)
    values(p,'Original lifecycle test',p::text,450,true,true,'lumaprints');
  select * into strict original from public.product_variants where product_id=p;
  original_id := original.id;
  assert original.variant_type='original' and original.inventory_count=1;
  assert original.price=450 and original.studio_price_cents=45000;
  assert original.is_active and original.studio_is_active and original.studio_only;
  assert not original.is_lumaprints_available;

  insert into public.product_variants(id,product_id,name,price,variant_type,medium)
    values(print_id,p,'Canvas print',50,'canvas_print','canvas');
  select to_jsonb(v) into print_before from public.product_variants v where id=print_id;
  update public.products set is_original=true,base_price=650 where id=p;
  assert (select count(*)=1 from public.product_variants where product_id=p and variant_type='original');
  assert (select id=original_id and price=650 and studio_price_cents=65000 from public.product_variants where id=original_id);

  -- A completed sale is never undone by disabling and re-enabling the checkbox.
  update public.product_variants set inventory_count=0 where id=original_id;
  update public.products set is_original=false where id=p;
  assert (select not is_active and not studio_is_active and inventory_count=0 from public.product_variants where id=original_id);
  update public.products set is_original=true where id=p;
  assert (select is_active and studio_is_active and inventory_count=0 from public.product_variants where id=original_id);
  assert (select to_jsonb(v)=print_before from public.product_variants v where id=print_id);
  assert (select prints_enabled from public.products where id=p);

  -- Failed price validation rolls back both product and option updates.
  begin
    update public.products set base_price=0 where id=p;
    raise exception 'An original was allowed without a price';
  exception when check_violation then null;
  end;
  assert (select base_price=650 from public.products where id=p);
  assert (select price=650 from public.product_variants where id=original_id);

  -- The unique index also rejects writes outside the product save trigger.
  begin
    insert into public.product_variants(product_id,name,price,variant_type)
      values(p,'Duplicate original',650,'original');
    raise exception 'A second original was allowed';
  exception when unique_violation then null;
  end;

  insert into public.products(id,title,slug,base_price,is_original,fulfillment_type)
    values(legacy,'Legacy original test',legacy::text,200,false,'lumaprints');
  insert into public.product_variants(product_id,name,price,variant_type,inventory_count,is_active,studio_is_active)
    values(legacy,'Existing original',200,'original',null,true,true);
  update public.products set base_price=300 where id=legacy;
  assert (select is_active and studio_is_active and inventory_count is null and price=300 and studio_price_cents=30000
    from public.product_variants where product_id=legacy);
  -- Explicitly saving the unchecked flag disables even a legacy original.
  update public.products set is_original=false where id=legacy;
  assert (select not is_active and not studio_is_active from public.product_variants where product_id=legacy);
  update public.products set is_original=true where id=legacy;
  assert (select is_active and inventory_count is null from public.product_variants where product_id=legacy);

  insert into public.products(id,title,slug,base_price,is_original,fulfillment_type,status)
    values(sold,'Sold legacy test',sold::text,250,false,'lumaprints','sold');
  update public.products set is_original=true where id=sold;
  assert (select inventory_count=0 from public.product_variants where product_id=sold);
end;
$$;
rollback;
