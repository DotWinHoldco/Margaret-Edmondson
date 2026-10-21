-- Commit crop-dependent dimensions/prices together while holding the same row
-- lock as a newer crop save. All provider calls happen before this short RPC.
CREATE OR REPLACE FUNCTION public.apply_master_crop_variant_updates(
  p_master_id uuid,
  p_requested_at timestamptz,
  p_updates jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_request timestamptz;
  current_status text;
  patch jsonb;
  variant_id uuid;
  variant_ids uuid[] := ARRAY[]::uuid[];
  changed integer;
BEGIN
  SELECT m.print_requested_at, m.print_status INTO current_request, current_status
  FROM public.master_artworks m WHERE m.id = p_master_id FOR UPDATE;
  IF NOT FOUND OR current_status IS DISTINCT FROM 'processing'
    OR p_requested_at IS NULL OR current_request IS DISTINCT FROM p_requested_at THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Crop variant updates must be an array' USING ERRCODE = '22023';
  END IF;
  FOR patch IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
    IF jsonb_typeof(patch) IS DISTINCT FROM 'object'
      OR jsonb_typeof(patch->'id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Each crop variant update requires an id' USING ERRCODE = '22023';
    END IF;
    IF patch - ARRAY[
      'id', 'width_in', 'height_in', 'size_label', 'aspect_ratio', 'name',
      'is_custom_size', 'is_active', 'is_lumaprints_available',
      'lumaprints_cost_cents', 'shipping_cost_cents', 'price', 'wholesale_cost',
      'worst_case_shipping', 'shipping_quoted_at', 'last_priced_at',
      'fulfillment_metadata', 'updated_at'
    ] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Crop update contains unsupported fields' USING ERRCODE = '22023';
    END IF;
    variant_id := (patch->>'id')::uuid;
    IF variant_id = ANY(variant_ids) THEN
      RAISE EXCEPTION 'Duplicate crop variant update' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.product_variants v
      JOIN public.products p ON p.id = v.product_id
      WHERE v.id = variant_id AND p.master_artwork_id = p_master_id
    ) THEN
      RAISE EXCEPTION 'Crop variant does not belong to this artwork' USING ERRCODE = '22023';
    END IF;
    variant_ids := array_append(variant_ids, variant_id);
  END LOOP;

  UPDATE public.product_variants AS v SET
    width_in = CASE WHEN u.patch ? 'width_in' THEN (u.patch->>'width_in')::numeric ELSE v.width_in END,
    height_in = CASE WHEN u.patch ? 'height_in' THEN (u.patch->>'height_in')::numeric ELSE v.height_in END,
    size_label = CASE WHEN u.patch ? 'size_label' THEN u.patch->>'size_label' ELSE v.size_label END,
    aspect_ratio = CASE WHEN u.patch ? 'aspect_ratio' THEN (u.patch->>'aspect_ratio')::numeric ELSE v.aspect_ratio END,
    name = CASE WHEN u.patch ? 'name' THEN u.patch->>'name' ELSE v.name END,
    is_custom_size = CASE WHEN u.patch ? 'is_custom_size' THEN (u.patch->>'is_custom_size')::boolean ELSE v.is_custom_size END,
    is_active = CASE WHEN u.patch ? 'is_active' THEN (u.patch->>'is_active')::boolean ELSE v.is_active END,
    is_lumaprints_available = CASE WHEN u.patch ? 'is_lumaprints_available' THEN (u.patch->>'is_lumaprints_available')::boolean ELSE v.is_lumaprints_available END,
    lumaprints_cost_cents = CASE WHEN u.patch ? 'lumaprints_cost_cents' THEN (u.patch->>'lumaprints_cost_cents')::integer ELSE v.lumaprints_cost_cents END,
    shipping_cost_cents = CASE WHEN u.patch ? 'shipping_cost_cents' THEN (u.patch->>'shipping_cost_cents')::integer ELSE v.shipping_cost_cents END,
    price = CASE WHEN u.patch ? 'price' THEN (u.patch->>'price')::numeric ELSE v.price END,
    wholesale_cost = CASE WHEN u.patch ? 'wholesale_cost' THEN (u.patch->>'wholesale_cost')::numeric ELSE v.wholesale_cost END,
    worst_case_shipping = CASE WHEN u.patch ? 'worst_case_shipping' THEN (u.patch->>'worst_case_shipping')::numeric ELSE v.worst_case_shipping END,
    shipping_quoted_at = CASE WHEN u.patch ? 'shipping_quoted_at' THEN (u.patch->>'shipping_quoted_at')::timestamptz ELSE v.shipping_quoted_at END,
    last_priced_at = CASE WHEN u.patch ? 'last_priced_at' THEN (u.patch->>'last_priced_at')::timestamptz ELSE v.last_priced_at END,
    fulfillment_metadata = CASE WHEN u.patch ? 'fulfillment_metadata' THEN nullif(u.patch->'fulfillment_metadata', 'null'::jsonb) ELSE v.fulfillment_metadata END,
    updated_at = CASE WHEN u.patch ? 'updated_at' THEN (u.patch->>'updated_at')::timestamptz ELSE v.updated_at END
  FROM (SELECT value AS patch FROM jsonb_array_elements(p_updates)) AS u,
    public.products AS p
  WHERE v.id = (u.patch->>'id')::uuid
    AND p.id = v.product_id AND p.master_artwork_id = p_master_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> cardinality(variant_ids) THEN
    -- An RLS restriction or concurrent reassignment must roll back the whole
    -- batch, including updates already matched by this statement.
    RAISE EXCEPTION 'Not all crop variants could be updated' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_master_crop_variant_updates(uuid, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_master_crop_variant_updates(uuid, timestamptz, jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.apply_master_crop_variant_updates(uuid, timestamptz, jsonb) IS
  'RLS-preserving atomic crop-size/pricing update, fenced by the current processing request. Never inserts or deletes variants.';
