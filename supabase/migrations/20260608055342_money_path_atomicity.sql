-- Phase 2 money-path atomicity & integrity.
--   B-9  reserve_original(variant_id)   — atomic one-of-a-kind claim (FOR UPDATE)
--   B-10 book_class_session(...)        — atomic capacity check + booking insert
--   B-6  carts.shipping_surcharge_cents — server-trusted surcharge (set by quote)
--   B-19 promo_code_redemptions unique  — single-use-per-contact enforced in DB
-- Down (manual revert):
--   DROP FUNCTION IF EXISTS public.reserve_original(uuid);
--   DROP FUNCTION IF EXISTS public.book_class_session(uuid,uuid,text,text,text,text,text[]);
--   ALTER TABLE public.carts DROP COLUMN IF EXISTS shipping_surcharge_cents;
--   DROP INDEX IF EXISTS public.promo_code_redemptions_single_use_key;

-- B-6: server-side shipping surcharge, persisted by /api/cart/shipping-quote and
-- read (not trusted from the POST body) at checkout.
ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS shipping_surcharge_cents INTEGER NOT NULL DEFAULT 0;

-- B-9: atomically claim a one-of-a-kind original. Returns TRUE if this caller
-- won the unit (inventory decremented), FALSE if it was already sold. Row lock
-- (FOR UPDATE) serializes concurrent buyers so the same original can't sell twice.
CREATE OR REPLACE FUNCTION public.reserve_original(p_variant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type text;
  v_count integer;
BEGIN
  SELECT variant_type, inventory_count INTO v_type, v_count
    FROM public.product_variants
    WHERE id = p_variant_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Non-originals (prints) are made to order — unlimited; always succeed.
  IF v_type IS DISTINCT FROM 'original' THEN
    RETURN true;
  END IF;

  IF v_count IS NULL OR v_count > 0 THEN
    UPDATE public.product_variants
      SET inventory_count = GREATEST(COALESCE(inventory_count, 1) - 1, 0)
      WHERE id = p_variant_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- B-10: atomic class booking. Locks the session row, counts active bookings,
-- inserts only if capacity remains. Returns 'OK' or 'SOLD_OUT'.
CREATE OR REPLACE FUNCTION public.book_class_session(
  p_session_id uuid,
  p_booking_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_notes text,
  p_photos text[]
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capacity integer;
  v_count integer;
BEGIN
  SELECT capacity INTO v_capacity FROM public.class_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'NOT_FOUND';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.class_bookings
    WHERE session_id = p_session_id AND status IN ('awaiting_payment', 'paid');

  IF v_count >= v_capacity THEN
    RETURN 'SOLD_OUT';
  END IF;

  INSERT INTO public.class_bookings (id, session_id, name, email, phone, special_notes, pet_photo_urls, status)
    VALUES (p_booking_id, p_session_id, p_name, p_email, p_phone, p_notes, COALESCE(p_photos, '{}'), 'awaiting_payment');

  RETURN 'OK';
END;
$$;

-- reserve_original is only ever called by the Stripe webhook (service_role).
REVOKE EXECUTE ON FUNCTION public.reserve_original(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_original(uuid) TO service_role;

-- book_class_session is called by the public class-checkout route (anon client).
REVOKE EXECUTE ON FUNCTION public.book_class_session(uuid,uuid,text,text,text,text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_class_session(uuid,uuid,text,text,text,text,text[]) TO anon, authenticated, service_role;

-- B-19: a single-use-per-contact promo code can be redeemed at most once per
-- contact. The webhook insert into promo_code_redemptions will hit this unique
-- index on a second attempt (caught + logged, never blocks the order).
CREATE UNIQUE INDEX IF NOT EXISTS promo_code_redemptions_single_use_key
  ON public.promo_code_redemptions (promo_code_id, contact_id)
  WHERE contact_id IS NOT NULL;
