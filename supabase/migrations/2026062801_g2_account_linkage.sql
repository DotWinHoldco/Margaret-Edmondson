-- 2026062801_g2_account_linkage.sql
-- Phase 1 (payment E2E remediation) — G2 customer accounts.
--
-- P1-2: when ANY auth user is created — whether a guest's account auto-provisioned
-- at purchase (webhook ensureCustomerAccount) or a later self-signup — back-link
-- every orphan order with the same email so it appears under /account/orders.
-- P1-4: track_cart must not resurrect a cart that already converted to an order
-- (the post-purchase cart reset would otherwise be undone by the debounced sync).
--
-- Down (manual revert): restore the prior bodies from 2026060802 / 2026062501.

-- ── P1-2: handle_new_user also back-links orphan orders ──────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Back-link prior guest orders for this email to the new account. Additive and
  -- idempotent: only touches orders that have no owner yet.
  IF NEW.email IS NOT NULL THEN
    UPDATE public.orders
       SET profile_id = NEW.id
     WHERE profile_id IS NULL
       AND lower(email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ── P1-4: track_cart never resurrects a converted cart ───────────────────────
-- Identical to the 2026062501 body, plus a `status <> 'converted'` guard on the
-- UPDATE so the post-purchase cart reset can't be undone by a late sync.
create or replace function public.track_cart(
  p_cart_id uuid default null::uuid,
  p_email text default null::text,
  p_items jsonb default '[]'::jsonb,
  p_subtotal numeric default 0,
  p_contact_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := now();
  v_status text := case
    when coalesce(jsonb_array_length(p_items), 0) = 0 then 'dead'
    else 'active'
  end;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_new_id uuid;
begin
  if p_cart_id is not null then
    update public.carts
    set items = p_items,
        subtotal = p_subtotal,
        last_activity_at = v_now,
        email = coalesce(v_email, public.carts.email),
        contact_id = coalesce(p_contact_id, public.carts.contact_id),
        status = v_status,
        updated_at = v_now
    where id = p_cart_id
      and profile_id is null
      and public.carts.status is distinct from 'converted'
    returning id into v_new_id;
    if v_new_id is not null then
      return v_new_id;
    end if;
  end if;

  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    return null;
  end if;

  insert into public.carts (items, subtotal, last_activity_at, email, contact_id, status)
  values (p_items, p_subtotal, v_now, v_email, p_contact_id, v_status)
  returning id into v_new_id;
  return v_new_id;
end;
$function$;

revoke execute on function public.track_cart(uuid, text, jsonb, numeric, uuid) from public, anon, authenticated;
grant execute on function public.track_cart(uuid, text, jsonb, numeric, uuid) to service_role;
