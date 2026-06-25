-- Authored by DotWin
-- Close the data-exposure findings from the 2026-06-25 adversarial audit
-- (audit/data-exposure-audit-2026-06-25.md). Every confirmed finding lived at the
-- direct PostgREST surface: SECURITY DEFINER functions EXECUTE-able by anon/PUBLIC,
-- and a few permissive read/insert policies. The application now invokes every
-- privileged DB operation with the service-role client from the route handler (the
-- rate-limited / validated / token-verified trust boundary), so the functions no
-- longer need anon/authenticated EXECUTE and the tables no longer need broad grants.
--
-- This migration:
--   1. Hardens three function bodies (track_cart IDOR guard, promo description data
--      minimization, reprice_variants search_path).
--   2. Revokes EXECUTE from PUBLIC/anon/authenticated on every sensitive definer
--      function; grants it to service_role only.
--   3. Restricts promo_codes and site_settings reads to admins.
--   4. Drops over-broad public INSERT policies now that writes flow through
--      service-role routes/RPCs.
-- is_admin_or_artist() is intentionally left PUBLIC-executable: it is evaluated
-- inside RLS policies for the anon role (and correctly returns false).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Function-body hardening
-- ─────────────────────────────────────────────────────────────────────────────

-- track_cart: guest-cart sync only. Bind the UPDATE to guest carts so it can never
-- tamper with a cart that belongs to a signed-in user (defense-in-depth; the route
-- is "anonymous guest cart sync (no profile)").
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

-- subscribe_to_newsletter: stop embedding the subscriber email in the promo
-- description (data minimization; promo_codes is now admin-read only).
create or replace function public.subscribe_to_newsletter(
  p_email text,
  p_first_name text default null::text,
  p_source text default 'unknown'::text
)
returns table(contact_id uuid, code text, percent_off integer, status text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(trim(p_email));
  v_contact_id uuid;
  v_status text;
  v_list_id uuid;
  v_code_row record;
  v_new_code text;
begin
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'invalid_email';
  end if;

  insert into public.crm_contacts (email, first_name, source)
  values (v_email, nullif(trim(coalesce(p_first_name, '')), ''), p_source)
  on conflict (email) do update
    set first_name = coalesce(public.crm_contacts.first_name, excluded.first_name),
        last_active_at = now()
  returning id, public.crm_contacts.status into v_contact_id, v_status;

  select id into v_list_id from public.contact_lists where slug = 'newsletter';
  if v_list_id is not null then
    insert into public.contact_list_members (contact_id, list_id, source)
    values (v_contact_id, v_list_id, p_source)
    on conflict do nothing;
  end if;

  if v_status in ('unsubscribed', 'bounced', 'complained') then
    return query select v_contact_id, null::text, null::integer, v_status;
    return;
  end if;

  select pc.code, pc.discount_value::integer as percent_off
    into v_code_row
  from public.promo_codes pc
  where pc.contact_id = v_contact_id
    and pc.kind = 'newsletter_signup'
    and pc.is_active = true
    and (pc.valid_until is null or pc.valid_until > now())
  order by pc.created_at desc
  limit 1;

  if v_code_row.code is null then
    v_new_code := 'WELCOME-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    insert into public.promo_codes
      (code, discount_type, discount_value, usage_limit, usage_count,
       valid_from, valid_until, is_active,
       kind, contact_id, single_use_per_contact, description)
    values
      (v_new_code, 'percentage', 10, 1, 0,
       now(), now() + interval '24 hours', true,
       'newsletter_signup', v_contact_id, true,
       'Newsletter signup discount');
    return query select v_contact_id, v_new_code, 10, v_status;
  else
    return query select v_contact_id, v_code_row.code, v_code_row.percent_off, v_status;
  end if;
end;
$function$;

-- reprice_variants: pin search_path and schema-qualify all references
-- (fixes advisor function_search_path_mutable on this SECURITY DEFINER function).
create or replace function public.reprice_variants(
  p_product uuid default null::uuid,
  p_category uuid default null::uuid
)
returns integer
language sql
security definer
set search_path to ''
as $function$
  with site as (select coalesce(default_margin_pct, 100) m from public.site_settings where id = true),
  upd as (
    update public.product_variants v
    set price = round((coalesce(v.lumaprints_cost_cents, 0) + coalesce(v.shipping_cost_cents, 0))
                 * (1 + coalesce(v.margin_override_pct, p.default_margin_pct, c.default_margin_pct, (select m from site)) / 100.0)) / 100.0,
        updated_at = now()
    from public.products p
    left join public.categories c on c.id = p.category_id
    where v.product_id = p.id
      and v.manual_price_override_cents is null
      and (p_product is null or v.product_id = p_product)
      and (p_category is null or p.category_id = p_category)
    returning 1
  )
  select count(*)::int from upd;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lock EXECUTE on every sensitive SECURITY DEFINER function to service_role
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.subscribe_to_newsletter(text, text, text) from public, anon, authenticated;
grant execute on function public.subscribe_to_newsletter(text, text, text) to service_role;

revoke all on function public.track_cart(uuid, text, jsonb, numeric, uuid) from public, anon, authenticated;
grant execute on function public.track_cart(uuid, text, jsonb, numeric, uuid) to service_role;

revoke all on function public.upsert_contact_to_list(text, text, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.upsert_contact_to_list(text, text, text, text, text, text, text[]) to service_role;

revoke all on function public.mark_contact_unsubscribed(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_contact_unsubscribed(uuid, uuid, text, text, text, text) to service_role;

revoke all on function public.validate_promo_code_public(text, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.validate_promo_code_public(text, text, uuid, numeric) to service_role;

revoke all on function public.book_class_session(uuid, uuid, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.book_class_session(uuid, uuid, text, text, text, text, text[]) to service_role;

revoke all on function public.increment_funnel_metric(uuid, text) from public, anon, authenticated;
grant execute on function public.increment_funnel_metric(uuid, text) to service_role;

revoke all on function public.reprice_variants(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reprice_variants(uuid, uuid) to service_role;

-- Assert the already-privileged-only functions stay locked down.
revoke all on function public.record_order_for_contact(text, numeric, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.record_order_for_contact(text, numeric, uuid, integer, uuid) to service_role;

revoke all on function public.reserve_original(uuid) from public, anon, authenticated;
grant execute on function public.reserve_original(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Restrict over-exposed read policies
-- ─────────────────────────────────────────────────────────────────────────────

-- promo_codes: any signed-in user could read every code (and the contact email in
-- description). Validation runs via the service-role RPC, so restrict read to admins.
drop policy if exists "Authenticated can read promo_codes" on public.promo_codes;
create policy promo_codes_admin_read on public.promo_codes
  for select to authenticated using (public.is_admin_or_artist());

-- site_settings: USING(true) exposed internal config (margin %, tax, order-notification
-- email) to anon. The server reads via the service-role client; restrict RLS read to admins.
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_admin_read on public.site_settings
  for select to authenticated using (public.is_admin_or_artist());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Drop over-broad public INSERT policies (writes now flow through service-role)
-- ─────────────────────────────────────────────────────────────────────────────

-- carts: created only via track_cart (service-role); no app code inserts directly.
drop policy if exists "Users can create cart" on public.carts;
drop policy if exists "Anon insert carts" on public.carts;

-- class_bookings: inserted only via book_class_session (service-role).
drop policy if exists "Public can submit bookings" on public.class_bookings;

-- newsletter_subscribers: subscribe route now upserts via the service-role client.
drop policy if exists "Anyone can subscribe to newsletter" on public.newsletter_subscribers;

-- commissions: the commission form route now inserts via the service-role client.
drop policy if exists "Public can submit commissions" on public.commissions;
