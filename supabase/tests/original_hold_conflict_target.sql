-- Exercises the real PostgreSQL function; all fixture rows and inventory changes roll back.
begin;
do $$
declare
  p uuid := gen_random_uuid();
  v uuid;
  print_id uuid := gen_random_uuid();
begin
  insert into public.products(id,title,slug,base_price,is_original,fulfillment_type)
    values(p,'Checkout reservation regression',p::text,20,true,'lumaprints');
  select id into strict v from public.product_variants where product_id=p and variant_type='original';
  insert into public.product_variants(id,product_id,name,price,variant_type,medium)
    values(print_id,p,'Regression print',10,'canvas_print','canvas');

  -- First acquisition and same-payment retry both execute the previously ambiguous upsert.
  assert (select ok from public.hold_originals('pi_regression_hold_a',array[v],35)), 'First hold failed';
  assert (select ok from public.hold_originals('pi_regression_hold_a',array[v],40)), 'Retry failed';
  assert (select count(*)=1 from public.original_holds where variant_id=v), 'Retry duplicated the hold';
  assert (select expires_at=now()+interval '40 minutes' from public.original_holds where variant_id=v), 'Retry did not refresh TTL';
  assert (select not ok from public.hold_originals('pi_regression_hold_b',array[v],35)), 'Competing buyer acquired held original';
  assert (select inventory_count=1 from public.product_variants where id=v), 'A hold consumed inventory';

  perform public.release_original_holds('pi_regression_hold_a');
  assert (select ok from public.hold_originals('pi_regression_hold_b',array[v],35)), 'Released original remained blocked';
  update public.original_holds set expires_at=now()-interval '1 second' where variant_id=v and payment_ref='pi_regression_hold_b';
  assert (select ok from public.hold_originals('pi_regression_hold_a',array[v],35)), 'Expired hold blocked a new checkout';
  assert public.convert_original_hold('pi_regression_hold_a',v)='converted', 'Paid hold did not convert';
  assert public.convert_original_hold('pi_regression_hold_a',v)='already_converted', 'Webhook replay was not idempotent';
  assert (select inventory_count=0 from public.product_variants where id=v), 'Conversion did not consume exactly one unit';
  assert (select ok from public.hold_originals('pi_regression_hold_a',array[v],35)), 'Converted reference retry was not idempotent';
  assert (select not ok from public.hold_originals('pi_regression_hold_c',array[v],35)), 'Sold original could be reserved';

  assert (select ok from public.hold_originals('pi_regression_print',array[print_id],35)), 'Made-to-order print was blocked';
  assert not exists(select 1 from public.original_holds where variant_id=print_id), 'Print acquired an inventory hold';
  assert not exists(select 1 from public.hold_originals('pi_regression_missing',array[gen_random_uuid()],35)), 'Unknown variant was reported as available';
  assert not has_function_privilege('anon','public.hold_originals(text,uuid[],integer)','EXECUTE'), 'Anonymous role gained reservation access';
  assert not has_function_privilege('authenticated','public.hold_originals(text,uuid[],integer)','EXECUTE'), 'Customer role gained reservation access';
  assert has_function_privilege('service_role','public.hold_originals(text,uuid[],integer)','EXECUTE'), 'Checkout service lost reservation access';
end;
$$;
rollback;
select 'PASS: acquisition, retry, competing buyer, release, expiry, conversion, sold inventory, prints and access; fixtures rolled back' as result;
