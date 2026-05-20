-- ─── subscribe_to_newsletter RPC ───────────────────────────────────
-- One atomic, SECURITY DEFINER function so the public newsletter
-- subscribe endpoint can call from anon context without granting
-- anon SELECT/UPDATE on crm_contacts or INSERT on promo_codes.
--
-- Does, in one transaction:
--   1. Upsert crm_contacts by email (case-insensitive); preserves
--      existing first_name and touches last_active_at.
--   2. Join the Newsletter list (no-op if already a member).
--   3. Re-use any active newsletter_signup promo code for the contact
--      that hasn't expired; otherwise mint a fresh single-use 10%
--      off code valid 24 hours.
--   4. Return { contact_id, code, percent_off, status } so the API
--      route can send the welcome email.
--
-- search_path is pinned to '' per Supabase advisor guidance.

create or replace function public.subscribe_to_newsletter(
  p_email text,
  p_first_name text default null,
  p_source text default 'unknown'
)
returns table (
  contact_id uuid,
  code text,
  percent_off integer,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
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
    -- pgcrypto's gen_random_bytes() is not enabled by default in
    -- this project, so use md5(random + clock_timestamp) as a
    -- portable random source.
    v_new_code := 'WELCOME-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    insert into public.promo_codes
      (code, discount_type, discount_value, usage_limit, usage_count,
       valid_from, valid_until, is_active,
       kind, contact_id, single_use_per_contact, description)
    values
      (v_new_code, 'percentage', 10, 1, 0,
       now(), now() + interval '24 hours', true,
       'newsletter_signup', v_contact_id, true,
       'Newsletter signup discount for ' || v_email);
    return query select v_contact_id, v_new_code, 10, v_status;
  else
    return query select v_contact_id, v_code_row.code, v_code_row.percent_off, v_status;
  end if;
end;
$$;

revoke all on function public.subscribe_to_newsletter(text, text, text) from public;
grant execute on function public.subscribe_to_newsletter(text, text, text) to anon, authenticated;
