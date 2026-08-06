-- ─── Unsubscribe Events Audit Log ───────────────────────────────────

create table if not exists unsubscribe_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references crm_contacts(id) on delete cascade,
  list_id uuid references contact_lists(id) on delete set null,
  email text not null,
  reason text,
  source text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists unsubscribe_events_contact_idx on unsubscribe_events (contact_id);
create index if not exists unsubscribe_events_email_idx on unsubscribe_events (email);

alter table unsubscribe_events enable row level security;

drop policy if exists "Admins read unsubscribe_events" on unsubscribe_events;
create policy "Admins read unsubscribe_events"
  on unsubscribe_events for select
  to authenticated
  using (is_admin_or_artist());

drop policy if exists "Anon insert unsubscribe_events" on unsubscribe_events;
create policy "Anon insert unsubscribe_events"
  on unsubscribe_events for insert
  to anon
  with check (true);
