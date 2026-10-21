-- Run against a disposable migrated database. Every fixture rolls back.
BEGIN;
DO $$
DECLARE
  master_id uuid := gen_random_uuid();
  other_master_id uuid := gen_random_uuid();
  product_id uuid := gen_random_uuid();
  other_product_id uuid := gen_random_uuid();
  variant_id uuid := gen_random_uuid();
  other_variant_id uuid := gen_random_uuid();
  requested_at timestamptz := '2026-10-09T18:00:00Z';
  rejected boolean;
BEGIN
  INSERT INTO public.master_artworks(id,title,storage_path,file_name,mime_type,print_status,print_requested_at)
  VALUES (master_id,'Crop RPC test',master_id::text,'source.png','image/png','processing',requested_at),
    (other_master_id,'Other crop RPC test',other_master_id::text,'source.png','image/png','processing',requested_at);
  INSERT INTO public.products(id,title,slug,base_price,is_original,master_artwork_id)
  VALUES (product_id,'Crop RPC test',product_id::text,100,false,master_id),
    (other_product_id,'Other crop RPC test',other_product_id::text,100,false,other_master_id);
  INSERT INTO public.product_variants(id,product_id,name,price,variant_type,width_in,height_in,inventory_count,fulfillment_metadata)
  VALUES (variant_id,product_id,'Print',100,'canvas_print',8,7.9,17,'{"preserve":true}'),
    (other_variant_id,other_product_id,'Other print',100,'canvas_print',8,7.9,23,null);

  ASSERT public.apply_master_crop_variant_updates(master_id,requested_at,
    jsonb_build_array(jsonb_build_object('id',variant_id,'height_in',8,'size_label','8 x 8')));
  ASSERT (SELECT width_in=8 AND height_in=8 AND price=100 AND inventory_count=17
    AND fulfillment_metadata='{"preserve":true}'::jsonb FROM public.product_variants WHERE id=variant_id),
    'Absent fields must retain their values';

  ASSERT NOT public.apply_master_crop_variant_updates(master_id,requested_at - interval '1 second',
    jsonb_build_array(jsonb_build_object('id',variant_id,'price',1))), 'Stale job must not update variants';
  UPDATE public.master_artworks SET print_status='ready' WHERE id=master_id;
  ASSERT NOT public.apply_master_crop_variant_updates(master_id,requested_at,
    jsonb_build_array(jsonb_build_object('id',variant_id,'price',2))), 'Completed job must not update variants';
  UPDATE public.master_artworks SET print_status='processing' WHERE id=master_id;

  rejected := false;
  BEGIN
    PERFORM public.apply_master_crop_variant_updates(master_id,requested_at,
      jsonb_build_array(jsonb_build_object('id',variant_id,'price',999),jsonb_build_object('id',other_variant_id,'price',999)));
  EXCEPTION WHEN invalid_parameter_value THEN rejected := true;
  END;
  ASSERT rejected, 'A batch containing another artwork must fail';
  ASSERT (SELECT price=100 FROM public.product_variants WHERE id=variant_id), 'Invalid batch must not partially apply';
  ASSERT (SELECT price=100 FROM public.product_variants WHERE id=other_variant_id), 'Other artwork changed';

  rejected := false;
  BEGIN
    PERFORM public.apply_master_crop_variant_updates(master_id,requested_at,
      jsonb_build_array(jsonb_build_object('id',variant_id,'inventory_count',0)));
  EXCEPTION WHEN invalid_parameter_value THEN rejected := true;
  END;
  ASSERT rejected, 'Fields outside the crop/pricing whitelist must fail';

  rejected := false;
  BEGIN
    PERFORM public.apply_master_crop_variant_updates(master_id,requested_at,
      jsonb_build_array(jsonb_build_object('id',variant_id,'price',1),jsonb_build_object('id',variant_id,'price',2)));
  EXCEPTION WHEN invalid_parameter_value THEN rejected := true;
  END;
  ASSERT rejected, 'Duplicate variant patches must fail';

  ASSERT public.apply_master_crop_variant_updates(master_id,requested_at,
    jsonb_build_array(jsonb_build_object('id',variant_id,'price',125,'fulfillment_metadata',null)));
  ASSERT (SELECT price=125 AND fulfillment_metadata IS NULL AND inventory_count=17
    FROM public.product_variants WHERE id=variant_id), 'Explicit null must clear only the supplied nullable field';

  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.apply_master_crop_variant_updates(uuid,timestamptz,jsonb)'::regprocedure),
    'The RPC must not bypass caller RLS';
  ASSERT NOT has_function_privilege('anon','public.apply_master_crop_variant_updates(uuid,timestamptz,jsonb)','EXECUTE');
  ASSERT has_function_privilege('authenticated','public.apply_master_crop_variant_updates(uuid,timestamptz,jsonb)','EXECUTE');
  ASSERT has_function_privilege('service_role','public.apply_master_crop_variant_updates(uuid,timestamptz,jsonb)','EXECUTE');
  PERFORM set_config('crop_test.master_id',master_id::text,true);
  PERFORM set_config('crop_test.variant_id',variant_id::text,true);
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
END;
$$;

-- An ordinary authenticated caller can execute the RPC but cannot see/lock an
-- admin-only master under RLS. No SECURITY DEFINER path is involved.
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT NOT public.apply_master_crop_variant_updates(
    current_setting('crop_test.master_id')::uuid,'2026-10-09T18:00:00Z',
    jsonb_build_array(jsonb_build_object('id',current_setting('crop_test.variant_id'),'price',1))
  ), 'A non-admin caller must not update an artwork through the RPC';
END;
$$;
RESET ROLE;
ROLLBACK;
