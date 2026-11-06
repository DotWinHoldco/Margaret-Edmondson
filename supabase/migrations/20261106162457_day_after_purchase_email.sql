-- Authored by DotWin. Durable next-day letters; receipts remain in the payment handler.
alter table public.email_automations add column enqueue_from timestamptz;
alter table public.email_automation_triggers
  add column due_at timestamptz,
  add column available_at timestamptz,
  add column lease_until timestamptz,
  add column claim_token uuid,
  add column attempts integer not null default 0,
  add column first_attempt_at timestamptz,
  add column payload jsonb,
  add column promo_code_id uuid references public.promo_codes(id) on delete set null,
  add column result text,
  add column last_error text;
create unique index email_triggers_order_once on public.email_automation_triggers(related_order_id)
  where trigger_event = 'order_placed' and related_order_id is not null;
create index email_triggers_due on public.email_automation_triggers(available_at)
  where trigger_event = 'order_placed' and processed_at is null;
create index email_triggers_promo on public.email_automation_triggers(promo_code_id);

update public.email_automations set enqueue_from = now() where slug = 'post-purchase';

-- Reconcile from paid orders, independently of webhook side-effect claims. No historical blast.
-- Only the cron's service role can execute these invoker functions.
create or replace function public.claim_post_purchase_email()
returns setof public.email_automation_triggers
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.email_automation_triggers
    (trigger_event, related_order_id, email_snapshot, due_at, available_at)
  select 'order_placed', o.id, lower(trim(o.email)),
    o.created_at + make_interval(mins => greatest(s.delay_minutes, 1440)),
    o.created_at + make_interval(mins => greatest(s.delay_minutes, 1440))
  from public.orders o
  join public.email_automations a on a.slug = 'post-purchase' and a.is_active
  join public.email_automation_steps s on s.automation_id = a.id and s.step_order = 1
  where o.created_at >= a.enqueue_from and o.stripe_mode = 'live'
    and o.status in ('processing','partially_fulfilled','fulfilled','shipped','delivered')
    and o.side_effects_completed_at is not null and o.fulfillment_hold_reason is null
    and o.email like '%@%'
    and not exists (select 1 from public.email_automation_sends e where e.dedupe_key = 'post_purchase:' || o.id)
  on conflict (related_order_id) where trigger_event = 'order_placed' and related_order_id is not null do nothing;

  -- Resend retains idempotency keys for 24h. Never resend an ambiguous attempt after that window.
  update public.email_automation_triggers set processed_at = now(), result = 'needs_review',
    last_error = 'Delivery was not confirmed within the safe retry window; check Resend before retrying.'
  where trigger_event = 'order_placed' and processed_at is null
    and first_attempt_at <= now() - interval '23 hours'
    and (lease_until is null or lease_until < now());

  return query
  update public.email_automation_triggers set claim_token = gen_random_uuid(),
    lease_until = now() + interval '2 minutes', attempts = attempts + 1
  where id = (
    select q.id from public.email_automation_triggers q
    where q.trigger_event = 'order_placed' and q.processed_at is null
      and q.available_at <= now() and q.due_at <= now()
      and (q.lease_until is null or q.lease_until < now())
      and exists (select 1 from public.email_automations a where a.slug = 'post-purchase' and a.is_active)
    order by q.available_at, q.id for update skip locked limit 1
  ) returning *;
end;
$$;

-- One transaction owns contact resolution + the single-use coupon + its durable queue association.
create or replace function public.prepare_post_purchase_email(p_job_id uuid, p_claim_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  q public.email_automation_triggers;
  o public.orders;
  c public.crm_contacts;
  a public.email_automations;
  s public.email_automation_steps;
  p public.promo_codes;
begin
  select * into q from public.email_automation_triggers where id = p_job_id
    and claim_token = p_claim_token and lease_until > now() and processed_at is null for update;
  if not found then return null; end if;
  select * into a from public.email_automations where slug = 'post-purchase';
  if not a.is_active then return null; end if;
  select * into o from public.orders where id = q.related_order_id;
  if o.id is null or o.stripe_mode is distinct from 'live'
    or o.status is null or o.status not in ('processing','partially_fulfilled','fulfilled','shipped','delivered')
    or o.fulfillment_hold_reason is not null
    or exists (select 1 from public.email_automation_sends where dedupe_key = 'post_purchase:' || o.id)
  then
    update public.email_automation_triggers set processed_at = now(), result = 'skipped_order' where id = q.id;
    return null;
  end if;

  -- Never reactivate an unsubscribed/bounced/complained contact during purchase processing.
  insert into public.crm_contacts(email, first_name, source)
    values (q.email_snapshot, nullif(split_part(trim(o.shipping_address->>'name'), ' ', 1), ''), 'order')
    on conflict (email) do nothing;
  select * into c from public.crm_contacts where email = q.email_snapshot;
  if c.id is null then raise exception 'Purchase contact is unavailable'; end if;
  if c.status is distinct from 'active' then
    update public.email_automation_triggers set processed_at = now(), result = 'suppressed' where id = q.id;
    return null;
  end if;
  select * into s from public.email_automation_steps where automation_id = a.id and step_order = 1;
  if s.id is null then raise exception 'Purchase email step is missing'; end if;

  if q.promo_code_id is null then
    if s.promo_percent_off is null or s.promo_percent_off <= 0 or s.promo_percent_off > 100
      or s.promo_expires_in_hours is null or s.promo_expires_in_hours <= 0 then
      raise exception 'Purchase offer settings are incomplete';
    end if;
    insert into public.promo_codes(code, discount_type, discount_value, usage_limit, usage_count,
      valid_from, valid_until, is_active, kind, contact_id, single_use_per_contact, description)
    values ('THANKYOU-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 12)), 'percentage', s.promo_percent_off,
      1, 0, now(), now() + make_interval(hours => s.promo_expires_in_hours), true, 'automation', c.id, true,
      'Post-purchase thank-you for order ' || o.id)
    returning * into p;
    update public.email_automation_triggers set contact_id = c.id, promo_code_id = p.id where id = q.id;
  else
    select * into p from public.promo_codes where id = q.promo_code_id;
  end if;
  return jsonb_build_object('automationId', a.id, 'stepId', s.id, 'contactId', c.id,
    'name', coalesce(nullif(c.first_name, ''), nullif(o.shipping_address->>'name', ''), 'Patron'),
    'subject', s.subject, 'preheader', s.preheader, 'body', s.content_html,
    'code', p.code, 'percentOff', p.discount_value, 'expiresAt', p.valid_until, 'validFrom', p.valid_from,
    'orderRef', coalesce(o.stripe_checkout_session_id, o.stripe_payment_intent_id), 'payload', q.payload);
end;
$$;

create or replace function public.complete_post_purchase_email(p_job_id uuid, p_claim_token uuid, p_message_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare q public.email_automation_triggers;
begin
  select * into q from public.email_automation_triggers where id = p_job_id
    and claim_token = p_claim_token and processed_at is null for update;
  if not found then return false; end if;
  if nullif(p_message_id, '') is null or q.payload is null then raise exception 'Confirmed delivery is required'; end if;
  insert into public.email_automation_sends(automation_id, step_id, contact_id, email_snapshot, dedupe_key, resend_message_id)
  values ((q.payload->>'automationId')::uuid, (q.payload->>'stepId')::uuid, q.contact_id,
    q.email_snapshot, 'post_purchase:' || q.related_order_id, p_message_id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  update public.email_automation_triggers set processed_at = now(), result = 'sent', last_error = null,
    lease_until = null where id = q.id;
  return true;
end;
$$;

revoke all on function public.claim_post_purchase_email() from public, anon, authenticated;
revoke all on function public.prepare_post_purchase_email(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_post_purchase_email(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_post_purchase_email() to service_role;
grant execute on function public.prepare_post_purchase_email(uuid, uuid) to service_role;
grant execute on function public.complete_post_purchase_email(uuid, uuid, text) to service_role;
