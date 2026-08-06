-- Align email_campaigns, email_automations, email_automation_steps
-- with what the Phase 4 unified editor + send/nurture crons expect.
-- All three tables were empty in production (verified before this
-- migration), so legacy columns are dropped outright rather than
-- renamed — no data migration required.
--
-- Admin RLS policies already existed on all three tables and are
-- preserved; this migration only changes column shapes, adds CHECK
-- constraints, an updated_at trigger on email_campaigns +
-- email_automations, and seeds the cart-nurture-weekly automation.

-- ─── email_campaigns ───────────────────────────────────────────────
alter table public.email_campaigns add column if not exists subject text;
alter table public.email_campaigns add column if not exists preheader text;
alter table public.email_campaigns add column if not exists from_name text;
alter table public.email_campaigns add column if not exists from_email text;
alter table public.email_campaigns add column if not exists content_html text not null default '';
alter table public.email_campaigns add column if not exists content_json jsonb;
alter table public.email_campaigns add column if not exists audience_list_id uuid references public.contact_lists(id) on delete set null;
alter table public.email_campaigns add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;
alter table public.email_campaigns add column if not exists scheduled_at timestamptz;
alter table public.email_campaigns add column if not exists queued_count integer not null default 0;
alter table public.email_campaigns add column if not exists sent_count integer not null default 0;
alter table public.email_campaigns add column if not exists failed_count integer not null default 0;
alter table public.email_campaigns add column if not exists opened_count integer not null default 0;
alter table public.email_campaigns add column if not exists clicked_count integer not null default 0;
alter table public.email_campaigns add column if not exists unsubscribed_count integer not null default 0;
alter table public.email_campaigns add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.email_campaigns add column if not exists updated_at timestamptz not null default now();

alter table public.email_campaigns drop column if exists template_id;
alter table public.email_campaigns drop column if exists subject_override;
alter table public.email_campaigns drop column if exists segment;
alter table public.email_campaigns drop column if exists scheduled_for;
alter table public.email_campaigns drop column if exists recipients_count;
alter table public.email_campaigns drop column if exists opens_count;
alter table public.email_campaigns drop column if exists clicks_count;

alter table public.email_campaigns alter column subject set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'email_campaigns_status_check'
  ) then
    alter table public.email_campaigns add constraint email_campaigns_status_check
      check (status in ('draft','scheduled','sending','sent','failed','paused'));
  end if;
end$$;

create index if not exists email_campaigns_status_idx on public.email_campaigns (status);
create index if not exists email_campaigns_scheduled_idx on public.email_campaigns (scheduled_at);

drop trigger if exists email_campaigns_touch on public.email_campaigns;
create trigger email_campaigns_touch before update on public.email_campaigns
  for each row execute function public.crm_contacts_touch_updated_at();

-- ─── email_automations ─────────────────────────────────────────────
alter table public.email_automations add column if not exists slug text;
alter table public.email_automations add column if not exists description text;
alter table public.email_automations add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_automations_slug_key'
  ) then
    alter table public.email_automations add constraint email_automations_slug_key unique (slug);
  end if;
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'email_automations_trigger_event_check'
  ) then
    alter table public.email_automations add constraint email_automations_trigger_event_check
      check (trigger_event in ('newsletter_signup','cart_abandon_nurture','order_placed','class_enrolled'));
  end if;
end$$;

drop trigger if exists email_automations_touch on public.email_automations;
create trigger email_automations_touch before update on public.email_automations
  for each row execute function public.crm_contacts_touch_updated_at();

-- ─── email_automation_steps ────────────────────────────────────────
alter table public.email_automation_steps add column if not exists subject text;
alter table public.email_automation_steps add column if not exists preheader text;
alter table public.email_automation_steps add column if not exists content_html text not null default '';
alter table public.email_automation_steps add column if not exists promo_code_kind text;
alter table public.email_automation_steps add column if not exists promo_percent_off integer;
alter table public.email_automation_steps add column if not exists promo_expires_in_hours integer;
alter table public.email_automation_steps add column if not exists created_at timestamptz not null default now();

alter table public.email_automation_steps drop column if exists template_id;
alter table public.email_automation_steps drop column if exists condition;
alter table public.email_automation_steps drop column if exists is_active;

alter table public.email_automation_steps alter column subject set not null;

create index if not exists email_automation_steps_auto_idx
  on public.email_automation_steps (automation_id, step_order);

-- ─── Seed the cart-nurture-weekly automation ───────────────────────
insert into public.email_automations (slug, name, description, trigger_event, is_active)
values ('cart-nurture-weekly', 'Weekly Cart Nurture',
        'Re-engagement email sent weekly to abandoned carts who exhausted the 1h / 24h / 72h sequence.',
        'cart_abandon_nurture', true)
on conflict (slug) do nothing;

insert into public.email_automation_steps
  (automation_id, step_order, delay_minutes, subject, preheader, content_html,
   promo_code_kind, promo_percent_off, promo_expires_in_hours)
select a.id, 1, 0,
  'Still on your mind?',
  'A little something to spark the buy.',
  '<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Still thinking about it?</h2>'
  '<p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">'
  '{{first_name_or_friend}}, your saved pieces are still here. If a nudge helps, use '
  '<strong>{{discount_code}}</strong> for {{discount_value}}% off at checkout, good for the next 7 days.'
  '</p>'
  '<div style="text-align:center;margin:28px 0;">'
  '<a href="{{cart_url}}" style="display:inline-block;background:#3A7D7B;color:#fff;padding:14px 36px;'
  'text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">Return to Your Cart</a>'
  '</div>',
  'cart_abandon', 10, 168
from public.email_automations a
where a.slug = 'cart-nurture-weekly'
  and not exists (
    select 1 from public.email_automation_steps s
    where s.automation_id = a.id and s.step_order = 1
  );
