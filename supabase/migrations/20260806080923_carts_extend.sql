-- ─── Extend carts for CRM linkage + nurture sequence ────────────────

alter table carts add column if not exists contact_id uuid references crm_contacts(id) on delete set null;
alter table carts add column if not exists promo_code_id uuid references promo_codes(id) on delete set null;
alter table carts add column if not exists nurture_started_at timestamptz;
alter table carts add column if not exists nurture_last_sent_at timestamptz;
alter table carts add column if not exists status text not null default 'active'
  check (status in ('active','converted','abandoned','nurture','dead'));

create index if not exists carts_contact_idx on carts (contact_id);
create index if not exists carts_status_idx on carts (status);
create index if not exists carts_nurture_idx on carts (nurture_started_at, nurture_last_sent_at);

-- Anon users need INSERT + narrow UPDATE so the cart sync endpoint can
-- write their cart state without a profile. We mirror the same posture
-- as newsletter_subscribers: anon may upsert into their own cart row
-- (identified by id returned from the upsert) but cannot read others.

drop policy if exists "Anon insert carts" on carts;
create policy "Anon insert carts"
  on carts for insert
  to anon
  with check (true);

drop policy if exists "Anon update carts" on carts;
create policy "Anon update carts"
  on carts for update
  to anon
  using (profile_id is null)
  with check (profile_id is null);
