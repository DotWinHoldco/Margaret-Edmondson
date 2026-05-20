-- ─── CRM Contacts ───────────────────────────────────────────────────
-- Canonical record of any human who has interacted with the brand.
-- Newsletter subscribers, guest buyers, cart abandoners, and contact-
-- form leads all reconcile to one row keyed by lowercased email.

create table if not exists crm_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text,
  last_name text,
  phone text,
  source text,
  status text not null default 'active'
    check (status in ('active','unsubscribed','bounced','complained')),
  tags text[] not null default '{}',
  total_orders integer not null default 0,
  total_spent_cents integer not null default 0,
  last_purchase_at timestamptz,
  last_active_at timestamptz default now(),
  profile_id uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_contacts_email_idx on crm_contacts (lower(email));
create index if not exists crm_contacts_status_idx on crm_contacts (status);
create index if not exists crm_contacts_profile_idx on crm_contacts (profile_id);

alter table crm_contacts enable row level security;

drop policy if exists "Admins manage crm_contacts" on crm_contacts;
create policy "Admins manage crm_contacts"
  on crm_contacts for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

drop policy if exists "Anon insert crm_contacts" on crm_contacts;
create policy "Anon insert crm_contacts"
  on crm_contacts for insert
  to anon
  with check (true);

drop policy if exists "Anon update own crm_contact" on crm_contacts;
create policy "Anon update own crm_contact"
  on crm_contacts for update
  to anon
  using (false)
  with check (false);

-- ─── Contact Lists ──────────────────────────────────────────────────
-- Lists are tags. Default lists are system lists (cannot be deleted).

create table if not exists contact_lists (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table contact_lists enable row level security;

drop policy if exists "Admins manage contact_lists" on contact_lists;
create policy "Admins manage contact_lists"
  on contact_lists for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

-- ─── Contact List Members ───────────────────────────────────────────

create table if not exists contact_list_members (
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  list_id uuid not null references contact_lists(id) on delete cascade,
  source text,
  joined_at timestamptz not null default now(),
  primary key (contact_id, list_id)
);

create index if not exists contact_list_members_list_idx on contact_list_members (list_id);

alter table contact_list_members enable row level security;

drop policy if exists "Admins manage contact_list_members" on contact_list_members;
create policy "Admins manage contact_list_members"
  on contact_list_members for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

drop policy if exists "Anon insert contact_list_members" on contact_list_members;
create policy "Anon insert contact_list_members"
  on contact_list_members for insert
  to anon
  with check (true);

-- ─── Seed system lists ──────────────────────────────────────────────

insert into contact_lists (slug, name, description, is_system) values
  ('newsletter', 'Newsletter', 'Subscribers to studio updates and releases.', true),
  ('buyers', 'Buyers', 'Customers who have completed at least one order.', true),
  ('cart-abandoners', 'Cart Abandoners', 'Visitors who started checkout but did not complete.', true),
  ('nurture', 'Nurture', 'Long-term re-engagement audience after exhausted cart sequence.', true),
  ('contact-form', 'Contact Form Leads', 'Visitors who reached out via the contact form.', true)
on conflict (slug) do nothing;

-- ─── Backfill from existing tables ──────────────────────────────────
-- Pull every newsletter_subscriber and order email into crm_contacts.

insert into crm_contacts (email, first_name, source, status, created_at)
select
  lower(ns.email),
  ns.first_name,
  coalesce(ns.source, 'newsletter_backfill'),
  case when ns.unsubscribed_at is not null then 'unsubscribed' else 'active' end,
  ns.subscribed_at
from newsletter_subscribers ns
where ns.email is not null
on conflict (email) do nothing;

insert into contact_list_members (contact_id, list_id, source)
select c.id, l.id, 'newsletter_backfill'
from newsletter_subscribers ns
join crm_contacts c on c.email = lower(ns.email)
join contact_lists l on l.slug = 'newsletter'
where ns.unsubscribed_at is null
on conflict do nothing;

insert into crm_contacts (email, source, status, last_purchase_at, total_orders, total_spent_cents)
select
  lower(o.email),
  'order_backfill',
  'active',
  max(o.created_at),
  count(*),
  round(coalesce(sum(o.total), 0) * 100)::integer
from orders o
where o.email is not null
group by lower(o.email)
on conflict (email) do update
set
  total_orders = excluded.total_orders,
  total_spent_cents = excluded.total_spent_cents,
  last_purchase_at = excluded.last_purchase_at;

insert into contact_list_members (contact_id, list_id, source)
select distinct c.id, l.id, 'order_backfill'
from orders o
join crm_contacts c on c.email = lower(o.email)
join contact_lists l on l.slug = 'buyers'
on conflict do nothing;

-- Trigger to keep updated_at fresh.
create or replace function crm_contacts_touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists crm_contacts_touch on crm_contacts;
create trigger crm_contacts_touch before update on crm_contacts
  for each row execute function crm_contacts_touch_updated_at();

drop trigger if exists contact_lists_touch on contact_lists;
create trigger contact_lists_touch before update on contact_lists
  for each row execute function crm_contacts_touch_updated_at();
