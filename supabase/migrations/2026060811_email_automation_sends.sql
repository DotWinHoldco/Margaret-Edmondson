-- Email automation idempotency log + trigger queue (Phase 4.6 E-4).
--
-- email_automation_sends   : one row per (automation, step, contact) that has
--                            actually been sent, so the cron never re-sends on
--                            replay/retry. Also used by triggers.ts for the
--                            welcome + post-purchase no-throw idempotency guard.
-- email_automation_triggers: a durable queue. The newsletter route and the
--                            Stripe webhook write a row here; the cron polls
--                            unprocessed rows and fans them out to steps.
--
-- Idempotent: safe to run repeatedly (IF NOT EXISTS / DROP POLICY IF EXISTS).

-- Make sure the step promo columns exist (older deployments may pre-date them).
alter table if exists public.email_automation_steps
  add column if not exists promo_code_kind text;
alter table if exists public.email_automation_steps
  add column if not exists promo_percent_off integer;
alter table if exists public.email_automation_steps
  add column if not exists promo_expires_in_hours integer;

-- ── Idempotency log ──────────────────────────────────────────────────────────
create table if not exists public.email_automation_sends (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.email_automations(id) on delete cascade,
  step_id uuid references public.email_automation_steps(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete cascade,
  email_snapshot text not null,
  -- Free-form idempotency key so non-automation triggers (built-in welcome /
  -- post-purchase templates that have no DB step row) can still dedupe.
  dedupe_key text,
  sent_at timestamptz not null default now(),
  resend_message_id text,
  status text not null default 'sent'
    check (status in ('sent', 'failed', 'bounced', 'complained'))
);

create index if not exists email_automation_sends_contact_idx
  on public.email_automation_sends (contact_id, automation_id);

-- One send per dedupe_key (welcome:<contact>, post_purchase:<order>, etc.).
create unique index if not exists email_automation_sends_dedupe_key_uidx
  on public.email_automation_sends (dedupe_key)
  where dedupe_key is not null;

-- ── Trigger queue ────────────────────────────────────────────────────────────
create table if not exists public.email_automation_triggers (
  id uuid primary key default gen_random_uuid(),
  trigger_event text not null
    check (trigger_event in ('newsletter_signup', 'order_placed', 'class_enrolled')),
  contact_id uuid references public.crm_contacts(id) on delete cascade,
  related_order_id uuid references public.orders(id) on delete set null,
  email_snapshot text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_automation_triggers_event_processed_idx
  on public.email_automation_triggers (trigger_event, processed_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- These tables are written by the service-role cron / webhook clients (which
-- bypass RLS) and read by admins. Lock out anon/auth direct access; admins get
-- read for any future dashboard surfacing.
alter table public.email_automation_sends enable row level security;
alter table public.email_automation_triggers enable row level security;

drop policy if exists "admin read automation sends" on public.email_automation_sends;
create policy "admin read automation sends"
  on public.email_automation_sends
  for select
  to authenticated
  using (public.is_admin_or_artist());

drop policy if exists "admin read automation triggers" on public.email_automation_triggers;
create policy "admin read automation triggers"
  on public.email_automation_triggers
  for select
  to authenticated
  using (public.is_admin_or_artist());

-- ── Seed automations (idempotent on slug) ────────────────────────────────────
insert into public.email_automations (name, slug, trigger_event, is_active, description)
values
  ('Welcome Series', 'welcome', 'newsletter_signup', true,
   'Sent when a new contact joins the newsletter list.'),
  ('Post-Purchase Sequence', 'post-purchase', 'order_placed', true,
   'Sent after an order is placed via Stripe checkout.')
on conflict (slug) do nothing;

-- Seed one step per automation if the automation currently has none.
do $$
declare
  v_welcome_id uuid;
  v_post_id uuid;
begin
  select id into v_welcome_id from public.email_automations where slug = 'welcome';
  if v_welcome_id is not null
     and not exists (select 1 from public.email_automation_steps where automation_id = v_welcome_id) then
    insert into public.email_automation_steps
      (automation_id, step_order, delay_minutes, subject, preheader, content_html, promo_percent_off, promo_expires_in_hours)
    values (
      v_welcome_id, 1, 0,
      'Welcome to ArtByME',
      'Thanks for joining the studio list.',
      '<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Welcome, {{first_name_or_friend}}!</h2>'
      || '<p style="text-align:center;color:#666;font-size:14px;line-height:1.6;margin-bottom:16px;">'
      || 'Thank you for joining the ArtByME studio list. You will be the first to hear about new work, upcoming shows, and exclusive offers from Margaret Edmondson.</p>',
      10, 24
    );
  end if;

  select id into v_post_id from public.email_automations where slug = 'post-purchase';
  if v_post_id is not null
     and not exists (select 1 from public.email_automation_steps where automation_id = v_post_id) then
    insert into public.email_automation_steps
      (automation_id, step_order, delay_minutes, subject, preheader, content_html)
    values (
      v_post_id, 1, 0,
      'Thank you for your order',
      'A note from the studio.',
      '<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Thank you, {{first_name_or_friend}}.</h2>'
      || '<p style="text-align:center;color:#666;font-size:14px;line-height:1.6;margin-bottom:16px;">'
      || 'Your order is being prepared with care. We are honored to have a piece of Margaret''s work going to your home, and we will be in touch with shipping details soon.</p>'
    );
  end if;
end $$;
