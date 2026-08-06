-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260520191058
-- Ledger name:    validate_promo_code_public_fix

-- Alias the table inside the function so the column reference can
-- never collide with the OUT parameter named "code".

create or replace function public.validate_promo_code_public(
  p_code text,
  p_email text default null,
  p_cart_id uuid default null,
  p_cart_subtotal numeric default 0
)
returns table (
  ok boolean,
  reason text,
  code text,
  discount_type text,
  discount_value numeric,
  amount_off_cents integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_row record;
  v_email_norm text := lower(trim(coalesce(p_email, '')));
  v_contact_id uuid;
  v_subtotal_cents integer := round(coalesce(p_cart_subtotal, 0) * 100)::integer;
  v_amount_off_cents integer;
begin
  if v_code = '' then
    return query select false, 'empty', null::text, null::text, null::numeric, null::integer;
    return;
  end if;

  select pc.* into v_row from public.promo_codes pc where pc.code = v_code limit 1;
  if v_row.id is null then
    return query select false, 'not_found', null::text, null::text, null::numeric, null::integer;
    return;
  end if;
  if not v_row.is_active then
    return query select false, 'inactive', null::text, null::text, null::numeric, null::integer;
    return;
  end if;
  if v_row.valid_from is not null and v_row.valid_from > now() then
    return query select false, 'not_yet_valid', null::text, null::text, null::numeric, null::integer;
    return;
  end if;
  if v_row.valid_until is not null and v_row.valid_until < now() then
    return query select false, 'expired', null::text, null::text, null::numeric, null::integer;
    return;
  end if;
  if v_row.min_order_amount is not null and p_cart_subtotal < v_row.min_order_amount then
    return query select false, 'min_order_not_met', null::text, null::text, null::numeric, null::integer;
    return;
  end if;
  if v_row.usage_limit is not null and v_row.usage_count >= v_row.usage_limit then
    return query select false, 'usage_exhausted', null::text, null::text, null::numeric, null::integer;
    return;
  end if;

  if v_email_norm <> '' then
    select c.id into v_contact_id from public.crm_contacts c where c.email = v_email_norm limit 1;
  end if;

  if v_row.contact_id is not null then
    if v_contact_id is null or v_contact_id <> v_row.contact_id then
      return query select false, 'wrong_contact', null::text, null::text, null::numeric, null::integer;
      return;
    end if;
  end if;

  if v_row.cart_id is not null then
    if p_cart_id is null or p_cart_id <> v_row.cart_id then
      return query select false, 'wrong_cart', null::text, null::text, null::numeric, null::integer;
      return;
    end if;
  end if;

  if v_row.single_use_per_contact and v_contact_id is not null then
    if exists (
      select 1 from public.promo_code_redemptions r
      where r.promo_code_id = v_row.id and r.contact_id = v_contact_id
    ) then
      return query select false, 'already_redeemed', null::text, null::text, null::numeric, null::integer;
      return;
    end if;
  end if;

  if v_row.discount_type = 'percentage' then
    v_amount_off_cents := floor((v_subtotal_cents * v_row.discount_value) / 100)::integer;
  else
    v_amount_off_cents := least(v_subtotal_cents, round(v_row.discount_value * 100)::integer);
  end if;

  return query select true, 'ok'::text, v_row.code, v_row.discount_type, v_row.discount_value, v_amount_off_cents;
end;
$$;
revoke all on function public.validate_promo_code_public(text, text, uuid, numeric) from public;
grant execute on function public.validate_promo_code_public(text, text, uuid, numeric) to anon, authenticated;
