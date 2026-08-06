-- ─── Email Campaigns ────────────────────────────────────────────────

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  preheader text,
  from_name text,
  from_email text,
  content_html text not null default '',
  content_json jsonb,
  status text not null default 'draft'
    check (status in ('draft','scheduled','sending','sent','failed','paused')),
  audience_list_id uuid references contact_lists(id) on delete set null,
  promo_code_id uuid references promo_codes(id) on delete set null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  opened_count integer not null default 0,
  clicked_count integer not null default 0,
  unsubscribed_count integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_campaigns_status_idx on email_campaigns (status);
create index if not exists email_campaigns_scheduled_idx on email_campaigns (scheduled_at);

alter table email_campaigns enable row level security;

drop policy if exists "Admins manage email_campaigns" on email_campaigns;
create policy "Admins manage email_campaigns"
  on email_campaigns for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

drop trigger if exists email_campaigns_touch on email_campaigns;
create trigger email_campaigns_touch before update on email_campaigns
  for each row execute function crm_contacts_touch_updated_at();

-- ─── Per-Recipient Send Queue ───────────────────────────────────────

create table if not exists email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  email_snapshot text not null,
  first_name_snapshot text,
  status text not null default 'queued'
    check (status in ('queued','sent','failed','bounced','unsubscribed','complained','skipped')),
  error text,
  resend_message_id text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz
);

create unique index if not exists email_campaign_recipients_unique
  on email_campaign_recipients (campaign_id, email_snapshot);
create index if not exists email_campaign_recipients_campaign_idx
  on email_campaign_recipients (campaign_id, status);

alter table email_campaign_recipients enable row level security;

drop policy if exists "Admins manage email_campaign_recipients" on email_campaign_recipients;
create policy "Admins manage email_campaign_recipients"
  on email_campaign_recipients for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

-- ─── Automations (welcome series, nurture, post-purchase) ───────────

create table if not exists email_automations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  trigger_event text not null
    check (trigger_event in (
      'newsletter_signup',
      'cart_abandon_nurture',
      'order_placed',
      'class_enrolled'
    )),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table email_automations enable row level security;

drop policy if exists "Admins manage email_automations" on email_automations;
create policy "Admins manage email_automations"
  on email_automations for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

drop trigger if exists email_automations_touch on email_automations;
create trigger email_automations_touch before update on email_automations
  for each row execute function crm_contacts_touch_updated_at();

create table if not exists email_automation_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references email_automations(id) on delete cascade,
  step_order integer not null,
  delay_minutes integer not null default 0,
  subject text not null,
  preheader text,
  content_html text not null default '',
  promo_code_kind text,
  promo_percent_off integer,
  promo_expires_in_hours integer,
  created_at timestamptz not null default now()
);

create index if not exists email_automation_steps_auto_idx
  on email_automation_steps (automation_id, step_order);

alter table email_automation_steps enable row level security;

drop policy if exists "Admins manage email_automation_steps" on email_automation_steps;
create policy "Admins manage email_automation_steps"
  on email_automation_steps for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

-- Seed the cart-nurture automation so the cron has a template to read.
insert into email_automations (slug, name, description, trigger_event, is_active) values
  ('cart-nurture-weekly', 'Weekly Cart Nurture', 'Re-engagement email sent weekly to abandoned carts who exhausted the 1h/24h/72h sequence.', 'cart_abandon_nurture', true)
on conflict (slug) do nothing;

insert into email_automation_steps (automation_id, step_order, delay_minutes, subject, preheader, content_html, promo_code_kind, promo_percent_off, promo_expires_in_hours)
select
  a.id,
  1,
  0,
  'Still on your mind?',
  'A little something to spark the buy.',
  '<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Still thinking about it?</h2><p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">{{first_name_or_friend}}, your saved pieces are still here. If a nudge helps, use <strong>{{discount_code}}</strong> for {{discount_value}}% off at checkout, good for the next 7 days.</p><div style="text-align:center;margin:28px 0;"><a href="{{cart_url}}" style="display:inline-block;background:#3A7D7B;color:#fff;padding:14px 36px;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">Return to Your Cart</a></div>',
  'cart_abandon',
  10,
  168
from email_automations a where a.slug = 'cart-nurture-weekly'
on conflict do nothing;
