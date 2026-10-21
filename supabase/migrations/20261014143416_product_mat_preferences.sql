-- Per-artwork framing preference; NULL preserves the store's catalog defaults.
ALTER TABLE public.products ADD COLUMN mat_preference jsonb;
ALTER TABLE public.products ADD CONSTRAINT products_mat_preference_valid CHECK (
  mat_preference IS NULL OR (
    jsonb_typeof(mat_preference) = 'object'
    AND mat_preference ?& ARRAY['mode', 'size_option_id', 'color_option_id']
    AND mat_preference - ARRAY['mode', 'size_option_id', 'color_option_id'] = '{}'::jsonb
    AND mat_preference->>'mode' IN ('default', 'locked')
    AND jsonb_typeof(mat_preference->'size_option_id') = 'number'
    AND jsonb_typeof(mat_preference->'color_option_id') = 'number'
    AND (mat_preference->>'size_option_id') ~ '^[1-9][0-9]*$'
    AND (mat_preference->>'color_option_id') ~ '^[1-9][0-9]*$'
  ) IS TRUE
);

CREATE FUNCTION public.get_product_mat_preference(p_product_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_artist() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('id', p.id, 'slug', p.slug, 'preference', p.mat_preference)
  INTO result FROM public.products p WHERE p.id = p_product_id;
  RETURN result;
END;
$$;

CREATE FUNCTION public.set_product_mat_preference(p_product_id uuid, p_preference jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_preference jsonb; product_slug text; caller uuid := auth.uid();
BEGIN
  IF caller IS NULL OR NOT public.is_admin_or_artist() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  p_preference := nullif(p_preference, 'null'::jsonb);
  SELECT p.mat_preference, p.slug INTO old_preference, product_slug
  FROM public.products p WHERE p.id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002'; END IF;
  -- The CHECK constraint validates the shape, including calls made directly through the API.
  UPDATE public.products SET mat_preference = p_preference, updated_at = now() WHERE id = p_product_id;
  IF old_preference IS DISTINCT FROM p_preference THEN
    INSERT INTO public.audit_log(table_name, record_id, field_name, old_value, new_value, changed_by)
    VALUES ('products', p_product_id, 'mat_preference', old_preference::text, p_preference::text, caller);
  END IF;
  RETURN jsonb_build_object('id', p_product_id, 'slug', product_slug, 'preference', p_preference);
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_mat_preference(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_product_mat_preference(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_mat_preference(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_mat_preference(uuid, jsonb) TO authenticated;
