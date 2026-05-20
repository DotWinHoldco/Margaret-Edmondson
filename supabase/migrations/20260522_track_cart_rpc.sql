-- track_cart: anon-callable SECURITY DEFINER RPC backing the
-- /api/cart/track endpoint. The carts table has anon INSERT but
-- forbids anon SELECT (RLS gates SELECT to auth.uid() = profile_id),
-- so the previous .insert(...).select('id') round-trip silently
-- failed for every anonymous shopper. The RPC executes with the
-- function owner's privileges and returns the cart_id cleanly.
--
-- Idempotent: an existing p_cart_id flows through UPDATE; a new
-- cart is INSERTed. Empty items + no cart_id is a no-op.

create or replace function public.track_cart(
  p_cart_id uuid default null,
  p_email text default null,
  p_items jsonb default '[]'::jsonb,
  p_subtotal numeric default 0,
  p_contact_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.track_cart(uuid, text, jsonb, numeric, uuid) from public;
grant execute on function public.track_cart(uuid, text, jsonb, numeric, uuid) to anon, authenticated;
