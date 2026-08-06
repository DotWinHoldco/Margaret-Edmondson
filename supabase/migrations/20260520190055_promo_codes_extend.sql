-- ─── Extend promo_codes for scope, ownership, and Stripe linkage ────

alter table promo_codes add column if not exists kind text not null default 'manual'
  check (kind in ('manual','campaign','newsletter_signup','cart_abandon','automation'));
alter table promo_codes add column if not exists audience_list_id uuid references contact_lists(id) on delete set null;
alter table promo_codes add column if not exists cart_id uuid;
alter table promo_codes add column if not exists contact_id uuid references crm_contacts(id) on delete set null;
alter table promo_codes add column if not exists single_use_per_contact boolean not null default false;
alter table promo_codes add column if not exists description text;
alter table promo_codes add column if not exists created_by uuid references profiles(id) on delete set null;
alter table promo_codes add column if not exists stripe_coupon_id text;
alter table promo_codes add column if not exists created_at timestamptz not null default now();
alter table promo_codes add column if not exists updated_at timestamptz not null default now();

create index if not exists promo_codes_kind_idx on promo_codes (kind);
create index if not exists promo_codes_contact_idx on promo_codes (contact_id);
create index if not exists promo_codes_cart_idx on promo_codes (cart_id);

-- ─── Redemptions: one row per use of a code on an order ─────────────

create table if not exists promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references promo_codes(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  amount_off_cents integer not null default 0,
  redeemed_at timestamptz not null default now()
);

create index if not exists promo_code_redemptions_code_idx on promo_code_redemptions (promo_code_id);
create index if not exists promo_code_redemptions_contact_idx on promo_code_redemptions (contact_id);

alter table promo_code_redemptions enable row level security;

drop policy if exists "Admins manage promo_code_redemptions" on promo_code_redemptions;
create policy "Admins manage promo_code_redemptions"
  on promo_code_redemptions for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

drop trigger if exists promo_codes_touch on promo_codes;
create trigger promo_codes_touch before update on promo_codes
  for each row execute function crm_contacts_touch_updated_at();
