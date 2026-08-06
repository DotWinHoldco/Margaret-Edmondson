-- ─── Anon-callable CRM RPCs ─────────────────────────────────────────
-- Every public-facing entry point that touches crm_contacts,
-- contact_list_members, promo_codes, promo_code_redemptions, or
-- unsubscribe_events goes through one of these SECURITY DEFINER
-- functions. RLS keeps direct table grants admin-only; these
-- functions are the narrow, audited public surface.
--
-- All four pin search_path = '' per Supabase advisor 0011.

-- upsert_contact_to_list: idempotent contact upsert + optional list
-- join. Used by the contact form, commissions, class signup, cart
-- tracking, and the Stripe webhook.

create or replace function public.upsert_contact_to_list(
  p_email text,
  p_list_slug text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_source text default 'unknown',
  p_tags text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_contact_id uuid;
  v_list_id uuid;
begin
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'invalid_email';
  end if;

  insert into public.crm_contacts (email, first_name, last_name, phone, source, tags)
  values (
    v_email,
    nullif(trim(coalesce(p_first_name, '')), ''),
    nullif(trim(coalesce(p_last_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    p_source,
    coalesce(p_tags, '{}')
  )
  on conflict (email) do update
    set first_name = coalesce(public.crm_contacts.first_name, excluded.first_name),
        last_name = coalesce(public.crm_contacts.last_name, excluded.last_name),
        phone = coalesce(public.crm_contacts.phone, excluded.phone),
        tags = (
          select array(
            select distinct unnest(public.crm_contacts.tags || excluded.tags)
          )
        ),
        last_active_at = now()
  returning id into v_contact_id;

  if p_list_slug is not null then
    select id into v_list_id from public.contact_lists where slug = p_list_slug;
    if v_list_id is not null then
      insert into public.contact_list_members (contact_id, list_id, source)
      values (v_contact_id, v_list_id, p_source)
      on conflict do nothing;
    end if;
  end if;

  return v_contact_id;
end;
$$;
revoke all on function public.upsert_contact_to_list(text, text, text, text, text, text, text[]) from public;
grant execute on function public.upsert_contact_to_list(text, text, text, text, text, text, text[]) to anon, authenticated;

-- record_order_for_contact: Stripe webhook attribution. Upserts the
-- contact, joins Buyers, bumps totals, and (if a promo applied)
-- records the redemption and bumps usage_count.

create or replace function public.record_order_for_contact(
  p_email text,
  p_order_total numeric,
  p_promo_code_id uuid default null,
  p_amount_off_cents integer default 0,
  p_order_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_contact_id uuid;
begin
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'invalid_email';
  end if;

  v_contact_id := public.upsert_contact_to_list(v_email, 'buyers', null, null, null, 'order', '{}');

  update public.crm_contacts
  set total_orders = total_orders + 1,
      total_spent_cents = total_spent_cents + round(coalesce(p_order_total, 0) * 100)::integer,
      last_purchase_at = now(),
      last_active_at = now()
  where id = v_contact_id;

  if p_promo_code_id is not null then
    insert into public.promo_code_redemptions
      (promo_code_id, contact_id, order_id, amount_off_cents)
    values
      (p_promo_code_id, v_contact_id, p_order_id, coalesce(p_amount_off_cents, 0));
    update public.promo_codes
    set usage_count = usage_count + 1
    where id = p_promo_code_id;
  end if;

  return v_contact_id;
end;
$$;
revoke all on function public.record_order_for_contact(text, numeric, uuid, integer, uuid) from public;
grant execute on function public.record_order_for_contact(text, numeric, uuid, integer, uuid) to anon, authenticated;

-- validate_promo_code_public: anon-safe validator. Returns just the
-- discount amount + code text, never the audience_list_id /
-- description / stripe_coupon_id / contact_id which could leak
-- targeting info.

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

-- mark_contact_unsubscribed: called by the /api/unsubscribe route
-- after it verifies the HMAC-signed token. Marks the contact (or one
-- list membership) as unsubscribed, mirrors the change into
-- newsletter_subscribers for back-compat, and logs the event.

create or replace function public.mark_contact_unsubscribed(
  p_contact_id uuid,
  p_list_id uuid default null,
  p_reason text default null,
  p_source text default null,
  p_ip text default null,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select email into v_email from public.crm_contacts where id = p_contact_id;
  if v_email is null then
    return false;
  end if;

  if p_list_id is not null then
    delete from public.contact_list_members
    where contact_id = p_contact_id and list_id = p_list_id;
  else
    update public.crm_contacts set status = 'unsubscribed' where id = p_contact_id;
    update public.newsletter_subscribers
      set unsubscribed_at = now()
      where email = v_email and unsubscribed_at is null;
  end if;

  insert into public.unsubscribe_events
    (contact_id, list_id, email, reason, source, ip, user_agent)
  values
    (p_contact_id, p_list_id, v_email, p_reason, p_source, p_ip, p_user_agent);

  return true;
end;
$$;
revoke all on function public.mark_contact_unsubscribed(uuid, uuid, text, text, text, text) from public;
grant execute on function public.mark_contact_unsubscribed(uuid, uuid, text, text, text, text) to anon, authenticated;
