-- 2026062800_checkout_snapshots.sql
-- P0-3 (payment E2E remediation): an immutable purchase-time snapshot of the
-- validated, server-priced line items, keyed by the Stripe payment reference
-- (PaymentIntent id for the embedded Payment Elements flow, Checkout Session id
-- for the hosted flow). The Stripe webhook builds order_items from THIS snapshot
-- instead of the mutable carts.items, so a cart that is changed after the amount
-- is locked (pay-for-one-receive-many) — or was never synced server-side at all
-- (the null-cartId empty-order case) — cannot alter what ships.
--
-- Service-role only: the checkout routes write it with the service client and
-- the webhook reads it with the service client; both bypass RLS. anon and
-- authenticated get no access. Replay-safe (IF NOT EXISTS).

create table if not exists public.checkout_snapshots (
  payment_ref     text primary key,
  cart_id         uuid,
  items           jsonb not null,
  subtotal_cents  integer not null,
  discount_cents  integer not null default 0,
  surcharge_cents integer not null default 0,
  tax_cents       integer not null default 0,
  email           text,
  created_at      timestamptz not null default now()
);

alter table public.checkout_snapshots enable row level security;

-- RLS is enabled with NO policies, so non-service roles can read/write nothing.
-- Also revoke the schema's default table grants so the table is never reachable
-- through the public PostgREST API even if default privileges grant them.
revoke all on public.checkout_snapshots from anon, authenticated;
