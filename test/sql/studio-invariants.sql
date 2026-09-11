set test.is_admin='true';
set role authenticated;
do $$
declare o uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); j public.studio_jobs; shipment uuid:=gen_random_uuid(); second uuid:=gen_random_uuid(); replacement uuid:=gen_random_uuid(); failed boolean;
begin
  insert into orders(id,status) values(o,'processing');
  insert into order_items(id,order_id,quantity,fulfillment_type,purchase_spec) values(i,o,2,'self_ship','{"title":"Frozen artwork","kind":"canvas_print","lead_days":3}');
  perform start_studio_fulfillment(o); perform start_studio_fulfillment(o);
  if (select count(*) from studio_jobs where order_id=o)<>1 then raise exception 'duplicate production'; end if;
  select * into strict j from studio_jobs where order_id=o;
  perform update_studio_job(j.id,1,'packing','Margaret','Keep private',now()+interval '3 days',null);
  failed:=false;
  begin perform update_studio_job(j.id,1,'printing','Friend','',now(),null); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'stale update accepted'; end if;
  perform record_studio_shipment(shipment,o,'UPS','TRACK1',null,900,jsonb_build_array(jsonb_build_object('job_id',j.id,'quantity',1)));
  perform record_studio_shipment(shipment,o,'UPS','TRACK1',null,900,jsonb_build_array(jsonb_build_object('job_id',j.id,'quantity',1)));
  if (select count(*) from order_shipments where order_id=o)<>1 or (select count(*) from studio_notifications where shipment_id=shipment)<>1 then raise exception 'duplicate shipment or email'; end if;
  if (select status from orders where id=o)<>'partially_fulfilled' then raise exception 'partial shipment rollup'; end if;
  failed:=false;
  begin perform record_studio_shipment(shipment,o,'UPS','TRACK1',null,900,jsonb_build_array(jsonb_build_object('job_id',j.id,'quantity',2))); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'idempotency key payload mismatch accepted'; end if;
  failed:=false;
  begin perform record_studio_shipment(second,o,'UPS','TRACK2',null,900,jsonb_build_array(jsonb_build_object('job_id',j.id,'quantity',2))); exception when raise_exception then failed:=true; end;
  if not failed or exists(select 1 from order_shipments where id=second) then raise exception 'overship transaction did not roll back'; end if;
  perform record_studio_shipment(second,o,'UPS','TRACK2',null,900,jsonb_build_array(jsonb_build_object('job_id',j.id,'quantity',1)));
  if (select status from orders where id=o)<>'shipped' then raise exception 'shipped rollup'; end if;
  perform deliver_studio_shipment(shipment);
  if (select status from orders where id=o)<>'shipped' then raise exception 'partial delivery completed order'; end if;
  perform deliver_studio_shipment(second); perform deliver_studio_shipment(second);
  if (select status from orders where id=o)<>'delivered' then raise exception 'delivered rollup'; end if;
  perform replace_studio_job(replacement,j.id,'Damaged in transit'); perform replace_studio_job(replacement,j.id,'Damaged in transit');
  if (select count(*) from studio_jobs where replacement_of=j.id)<>1 then raise exception 'duplicate replacement'; end if;
  update orders set status='refunded' where id=o;
  if (select status from studio_jobs where id=replacement)<>'cancelled' then raise exception 'refund failed to stop work'; end if;
  perform start_studio_fulfillment(o);
  if (select count(*) from studio_jobs where order_id=o)<>2 then raise exception 'refund recovery recreated work'; end if;
end $$;

do $$
declare o uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); v bigint; failed boolean;
begin
  insert into orders(id,status) values(o,'processing');
  insert into order_items(id,order_id,quantity,fulfillment_type) values(i,o,1,'lumaprints');
  select fulfillment_policy_version into v from site_settings;
  update site_settings set lumaprints_enabled=false;
  if (select fulfillment_policy_version from site_settings)<>v+1 or (select fulfillment_status from order_items where id=i)<>'paused' then raise exception 'OFF did not pause/version'; end if;
  perform transfer_to_studio(i,'Checked printer portal; no submitted order');
  if (select count(*) from studio_jobs where order_id=o)<>1 then raise exception 'transfer did not create ticket'; end if;
  update orders set fulfillment_hold_reason='Address requires review' where id=o;
  failed:=false;
  begin perform update_studio_job((select id from studio_jobs where order_id=o),1,'packing','Margaret','',now(),null); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'held work entered production'; end if;
  perform release_studio_order_hold(o,'Customer confirmed the address and shipping arrangement');
  if (select fulfillment_hold_reason from orders where id=o) is not null then raise exception 'hold release failed'; end if;
end $$;

-- Pending payments never create work. Product writes preserve the provider price.
do $$
declare o uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); fields jsonb; original uuid:=gen_random_uuid(); j uuid; failed boolean;
begin
 insert into orders(id,status) values(o,'pending');
 insert into order_items(order_id,quantity,fulfillment_type) values(o,1,'self_ship');
 perform start_studio_fulfillment(o);
 if exists(select 1 from studio_jobs where order_id=o) then raise exception 'unpaid work entered production'; end if;
 insert into products(id,title) values(p,'Sample');
 insert into product_variants(id,product_id,name,price,variant_type) values(v,p,'Print',129,'canvas_print');
 fields:=jsonb_build_array(jsonb_build_object('id',v,'studio_price_cents',8500,'studio_is_active',true,'studio_only',false,'studio_source_approved',true,'studio_shipping_mode','flat','studio_shipping_fee_cents',1800));
 perform save_studio_product(p,'{"studio_shipping_mode":"included"}',fields);
 if (select price from product_variants where id=v)<>129 or (select studio_price_cents from product_variants where id=v)<>8500 then raise exception 'price profiles overwritten'; end if;
 insert into orders(id,status) values(original,'processing');
 insert into order_items(order_id,quantity,fulfillment_type,purchase_spec) values(original,1,'self_ship','{"kind":"original"}');
 perform start_studio_fulfillment(original);
 select id into j from studio_jobs where order_id=original;
 failed:=false;
 begin perform update_studio_job(j,1,'printing','Margaret','',now(),null); exception when raise_exception then failed:=true; end;
 if not failed then raise exception 'original allowed to reprint'; end if;
end $$;
reset role;
set role service_role;
do $$
declare o uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); n integer;
begin
 insert into orders(id,status) values(o,'processing');
 insert into order_items(id,order_id,quantity,fulfillment_type) values(i,o,1,'lumaprints');
 select count(*) into n from claim_fulfillment_items(array[i]);
 if n<>0 then raise exception 'disabled provider claimed work'; end if;
 update site_settings set lumaprints_enabled=true;
 select count(*) into n from claim_fulfillment_items(array[i]);
 if n<>1 then raise exception 'enabled provider could not claim'; end if;
 update site_settings set lumaprints_enabled=false;
 if (select fulfillment_status from order_items where id=i)<>'submitting' then raise exception 'OFF mislabeled in-flight request'; end if;
 select count(*) into n from claim_fulfillment_items(array[i]);
 if n<>0 then raise exception 'duplicate provider claim'; end if;
end $$;
reset role;
set test.is_admin='false';
set role authenticated;
do $$ declare failed boolean:=false; begin
 if exists(select 1 from studio_jobs) or exists(select 1 from studio_notifications) or exists(select 1 from order_shipments) or exists(select 1 from studio_variant_details) then raise exception 'buyer can read private operations'; end if;
 begin perform record_studio_shipment(gen_random_uuid(),gen_random_uuid(),'UPS','123',null,null,'[]'); exception when others then failed:=true; end;
 if not failed then raise exception 'buyer can create shipment'; end if;
 if has_function_privilege(current_user,'claim_fulfillment_items(uuid[])','execute') then raise exception 'buyer can claim fulfillment'; end if;
end $$;
reset role;
set role anon;
select get_fulfillment_policy();
do $$ begin
 if has_table_privilege(current_user,'studio_jobs','select') then raise exception 'anonymous private table access'; end if;
end $$;

reset role;
set test.is_admin='true';
do $$ declare p uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); begin
 insert into products(id,title) values(p,'Returned original');
 insert into product_variants(id,product_id,name,price,variant_type,inventory_count) values(v,p,'Original',800,'original',0);
 insert into orders(id,status,stripe_payment_intent_id) values(o,'refunded','pi_studio_return_test');
 insert into order_items(id,order_id,product_id,variant_id,quantity,fulfillment_type,fulfillment_status,shipped_at,purchase_spec) values(i,o,p,v,1,'self_ship','shipped',now(),'{"kind":"original"}');
 insert into original_holds(variant_id,payment_ref,status) values(v,'pi_studio_return_test','converted');
 perform refund_original_holds('pi_studio_return_test');
 if (select inventory_count from product_variants where id=v)<>0 then raise exception 'refund relisted shipped original before return'; end if;
 perform receive_studio_original_return(i,'Physically received; undamaged');
 perform receive_studio_original_return(i,'Physically received; undamaged');
 perform refund_original_holds('pi_studio_return_test');
 if (select inventory_count from product_variants where id=v)<>1 then raise exception 'return or refund replay duplicated original inventory'; end if;
end $$;
set role authenticated;
select * from list_studio_jobs(null,'Frozen artwork',0);
do $$ begin
 if get_fulfillment_policy() ? 'specs' then raise exception 'private details in public settings'; end if;
end $$;

-- Switching back on still requires an explicit, verified resume of paused work.
do $$ declare o uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); failed boolean:=false; begin
 insert into orders(id,status) values(o,'processing');
 insert into order_items(id,order_id,quantity,fulfillment_type,fulfillment_status) values(i,o,1,'lumaprints','paused');
 begin perform resume_lumaprints_item(i,'Verified no external order'); exception when raise_exception then failed:=true; end;
 if not failed then raise exception 'resumed while disabled'; end if;
 update site_settings set lumaprints_enabled=true;
 perform resume_lumaprints_item(i,'Verified no external order');
 if (select fulfillment_status from order_items where id=i)<>'pending' then raise exception 'resume did not release work'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from fulfillment_jobs) then raise exception 'resume did not queue provider work'; end if;
end $$;
