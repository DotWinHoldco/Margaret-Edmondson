-- Missing tables + columns from the CRM build that never made it to
-- production until today. Idempotent; safe to re-run.

-- Unsubscribe events audit log
create table if not exists public.unsubscribe_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.crm_contacts(id) on delete cascade,
  list_id uuid references public.contact_lists(id) on delete set null,
  email text not null,
  reason text,
  source text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists unsubscribe_events_contact_idx on public.unsubscribe_events (contact_id);
create index if not exists unsubscribe_events_email_idx on public.unsubscribe_events (email);
alter table public.unsubscribe_events enable row level security;
drop policy if exists "Admins read unsubscribe_events" on public.unsubscribe_events;
create policy "Admins read unsubscribe_events"
  on public.unsubscribe_events for select to authenticated
  using (public.is_admin_or_artist());

-- carts CRM linkage + nurture state
alter table public.carts add column if not exists contact_id uuid references public.crm_contacts(id) on delete set null;
alter table public.carts add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;
alter table public.carts add column if not exists nurture_started_at timestamptz;
alter table public.carts add column if not exists nurture_last_sent_at timestamptz;
alter table public.carts add column if not exists status text not null default 'active'
  check (status in ('active','converted','abandoned','nurture','dead'));
create index if not exists carts_contact_idx on public.carts (contact_id);
create index if not exists carts_status_idx on public.carts (status);

-- email_campaign_recipients (campaign send queue)
create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
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
  on public.email_campaign_recipients (campaign_id, email_snapshot);
create index if not exists email_campaign_recipients_campaign_idx
  on public.email_campaign_recipients (campaign_id, status);
alter table public.email_campaign_recipients enable row level security;
drop policy if exists "Admins manage email_campaign_recipients" on public.email_campaign_recipients;
create policy "Admins manage email_campaign_recipients"
  on public.email_campaign_recipients for all to authenticated
  using (public.is_admin_or_artist()) with check (public.is_admin_or_artist());
