begin;
do $$
declare p uuid := gen_random_uuid(); printed uuid := gen_random_uuid(); n integer;
begin
  insert into public.products(id,title,slug,base_price,is_original,fulfillment_type) values(p,'Repricing regression',p::text,200,true,'lumaprints');
  insert into public.product_variants(id,product_id,name,price,variant_type,medium,lumaprints_cost_cents,shipping_cost_cents,margin_override_pct) values(printed,p,'Print',1,'canvas_print','canvas',1000,500,100);
  select public.reprice_variants(p,null) into n;
  assert n=1,'Only the print may be repriced';
  assert (select price=200 and inventory_count=1 and is_active from public.product_variants where product_id=p and variant_type='original'),'Original price and inventory changed';
  assert (select price=30 from public.product_variants where id=printed),'Print cost-plus pricing changed';
  update public.products set is_original=true,base_price=250 where id=p;
  perform public.reprice_variants(p,null);
  assert (select price=250 and inventory_count=1 from public.product_variants where product_id=p and variant_type='original'),'Save followed by repricing reset the original';
end;
$$;
rollback;
