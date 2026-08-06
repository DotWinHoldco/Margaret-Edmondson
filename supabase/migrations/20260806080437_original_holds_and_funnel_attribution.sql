-- Authored by DotWin
-- 2026080601_original_holds_and_funnel_attribution.sql
--
-- Part A: transactional purchase holds for one-of-a-kind originals.
--
-- Before this migration the only inventory claim (reserve_original) ran inside
-- the Stripe webhook, AFTER payment. Two buyers could both open checkout for the
-- same original and both pay; the second claim failed and the platform's answer
-- was an alert, with a paid order for a piece that does not exist. These
-- functions move the claim to checkout-session creation as an expiring hold:
--   hold_originals            claim units at checkout create (TTL-bounded)
--   convert_original_hold     webhook: hold -> sold, idempotent on replay
--   release_original_holds    checkout failure / session expiry / PI cancel
--   refund_original_holds     full refund: restore inventory, release the hold
-- All functions lock the variant row FOR UPDATE so concurrent callers
-- serialize; holds are keyed (payment_ref, variant_id) so a multi-original cart
-- holds each piece under one Stripe reference.
--
-- Part B: trustworthy funnel purchase attribution. funnel_id captured at
-- checkout rides the immutable checkout snapshot; the webhook stamps it onto
-- the order and increments artwork_funnels.purchase_count exactly once (only
-- the delivery that CREATES the order row increments). The public track
-- endpoint can no longer claim purchases at all.
--
-- Down (manual revert):
--   DROP FUNCTION IF EXISTS public.hold_originals(text, uuid[], integer);
--   DROP FUNCTION IF EXISTS public.convert_original_hold(text, uuid);
--   DROP FUNCTION IF EXISTS public.release_original_holds(text);
--   DROP FUNCTION IF EXISTS public.refund_original_holds(text);
--   DROP TABLE IF EXISTS public.original_holds;
--   ALTER TABLE public.checkout_snapshots DROP COLUMN IF EXISTS funnel_id;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS funnel_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part A: original_holds
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.original_holds (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  payment_ref text not null,
  status      text not null default 'held'
              check (status in ('held', 'converted', 'released', 'expired')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (payment_ref, variant_id)
);

-- The availability count runs per variant over live holds; the sweep runs over
-- (status, expires_at). Both need their own index. variant_id also satisfies
-- the unindexed-foreign-key advisor for the new FK.
create index if not exists idx_original_holds_variant_live
  on public.original_holds (variant_id) where status = 'held';
create index if not exists idx_original_holds_sweep
  on public.original_holds (status, expires_at);

alter table public.original_holds enable row level security;
-- RLS on with NO policies: service-role only, same posture as
-- checkout_snapshots and rate_limit_buckets. Also drop default grants so the
-- table is unreachable through PostgREST for anon/authenticated.
revoke all on public.original_holds from anon, authenticated;

-- Claim every original in a checkout under one payment reference. Returns one
-- row per found variant; the caller must treat a missing row or ok=false as a
-- failed claim and abort the checkout. Non-original variants always return
-- ok=true (prints are made to order). Re-invoking with the same payment_ref
-- refreshes that reference's own holds (safe on checkout retry).
create or replace function public.hold_originals(
  p_payment_ref text,
  p_variant_ids uuid[],
  p_ttl_minutes integer default 35
)
returns table (variant_id uuid, ok boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_available integer;
  v_active integer;
begin
  if p_payment_ref is null or length(p_payment_ref) < 8 or length(p_payment_ref) > 255 then
    raise exception 'invalid payment_ref';
  end if;
  if p_ttl_minutes is null or p_ttl_minutes < 5 or p_ttl_minutes > 1440 then
    raise exception 'invalid ttl';
  end if;
  if p_variant_ids is null or cardinality(p_variant_ids) not between 1 and 100 then
    raise exception 'invalid variant list';
  end if;

  for r in
    select v.id, v.variant_type, v.inventory_count
      from public.product_variants v
     where v.id = any(p_variant_ids)
     order by v.id
       for update
  loop
    if r.variant_type is distinct from 'original' then
      variant_id := r.id; ok := true; return next; continue;
    end if;

    -- A reference whose hold already converted stays satisfied (idempotent).
    if exists (
      select 1 from public.original_holds h
       where h.payment_ref = p_payment_ref and h.variant_id = r.id
         and h.status = 'converted'
    ) then
      variant_id := r.id; ok := true; return next; continue;
    end if;

    -- NULL inventory_count has always meant "one unit available" on this
    -- platform (see reserve_original); keep that semantic.
    v_available := coalesce(r.inventory_count, 1);
    select count(*) into v_active
      from public.original_holds h
     where h.variant_id = r.id
       and h.status = 'held'
       and h.expires_at > now()
       and h.payment_ref <> p_payment_ref;

    if v_available - v_active > 0 then
      insert into public.original_holds as oh (variant_id, payment_ref, status, expires_at)
      values (r.id, p_payment_ref, 'held', now() + make_interval(mins => p_ttl_minutes))
      on conflict (payment_ref, variant_id) do update
        set status = 'held',
            expires_at = excluded.expires_at,
            updated_at = now()
        where oh.status <> 'converted';
      variant_id := r.id; ok := true; return next;
    else
      variant_id := r.id; ok := false; return next;
    end if;
  end loop;
end;
$$;

-- Webhook-side conversion of a hold into a sale. Exactly one decrement per
-- (payment_ref, variant_id) across any number of webhook replays:
--   'converted'          this call decremented inventory and closed the hold
--   'already_converted'  a previous delivery did; nothing changed
--   'oversold'           no live hold and no free unit remains: the caller must
--                        refund, never fulfill
-- A paid reference whose hold expired (slow async payment) still converts when
-- a unit remains beyond everyone else's live holds; pre-hold legacy references
-- take the same path.
create or replace function public.convert_original_hold(
  p_payment_ref text,
  p_variant_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_count integer;
  v_status text;
  v_expires timestamptz;
  v_active integer;
begin
  select variant_type, inventory_count into v_type, v_count
    from public.product_variants where id = p_variant_id for update;
  if not found then
    return 'oversold';
  end if;
  if v_type is distinct from 'original' then
    return 'converted';
  end if;

  select h.status, h.expires_at into v_status, v_expires
    from public.original_holds h
   where h.payment_ref = p_payment_ref and h.variant_id = p_variant_id;

  if v_status = 'converted' then
    return 'already_converted';
  end if;

  if v_status = 'held' and v_expires > now() then
    update public.product_variants
       set inventory_count = greatest(coalesce(inventory_count, 1) - 1, 0)
     where id = p_variant_id;
    update public.original_holds
       set status = 'converted', updated_at = now()
     where payment_ref = p_payment_ref and variant_id = p_variant_id;
    return 'converted';
  end if;

  select count(*) into v_active
    from public.original_holds h
   where h.variant_id = p_variant_id
     and h.status = 'held'
     and h.expires_at > now()
     and h.payment_ref <> p_payment_ref;

  if coalesce(v_count, 1) - v_active > 0 then
    update public.product_variants
       set inventory_count = greatest(coalesce(inventory_count, 1) - 1, 0)
     where id = p_variant_id;
    insert into public.original_holds as oh (variant_id, payment_ref, status, expires_at)
    values (p_variant_id, p_payment_ref, 'converted', now())
    on conflict (payment_ref, variant_id) do update
      set status = 'converted', updated_at = now();
    return 'converted';
  end if;

  return 'oversold';
end;
$$;

-- Release every live hold under a payment reference (checkout failure, session
-- expiry, PaymentIntent cancellation). Held rows never decremented inventory,
-- so releasing is a pure status flip. Returns how many holds were released.
create or replace function public.release_original_holds(p_payment_ref text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.original_holds
     set status = 'released', updated_at = now()
   where payment_ref = p_payment_ref and status = 'held';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Full-refund restock: put every converted unit under this payment reference
-- back on sale and close its hold. Idempotent across webhook replays (a hold
-- restocks at most once because the status leaves 'converted' the first time).
create or replace function public.refund_original_holds(p_payment_ref text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select h.id as hold_id, h.variant_id
      from public.original_holds h
      join public.product_variants v on v.id = h.variant_id
     where h.payment_ref = p_payment_ref and h.status = 'converted'
     order by h.variant_id
       for update of v, h
  loop
    update public.product_variants
       set inventory_count = coalesce(inventory_count, 0) + 1
     where id = r.variant_id;
    update public.original_holds
       set status = 'released', updated_at = now()
     where id = r.hold_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Money-path functions are service-role only, like the rest of this surface.
revoke all on function public.hold_originals(text, uuid[], integer) from public, anon, authenticated;
grant execute on function public.hold_originals(text, uuid[], integer) to service_role;
revoke all on function public.convert_original_hold(text, uuid) from public, anon, authenticated;
grant execute on function public.convert_original_hold(text, uuid) to service_role;
revoke all on function public.release_original_holds(text) from public, anon, authenticated;
grant execute on function public.release_original_holds(text) to service_role;
revoke all on function public.refund_original_holds(text) from public, anon, authenticated;
grant execute on function public.refund_original_holds(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part B: funnel purchase attribution
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.checkout_snapshots
  add column if not exists funnel_id uuid references public.artwork_funnels(id) on delete set null;
create index if not exists idx_checkout_snapshots_funnel_id
  on public.checkout_snapshots (funnel_id) where funnel_id is not null;

alter table public.orders
  add column if not exists funnel_id uuid references public.artwork_funnels(id) on delete set null;
create index if not exists idx_orders_funnel_id
  on public.orders (funnel_id) where funnel_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Housekeeping: fulfillment_jobs.order_id has only a PARTIAL unique index,
-- which cannot serve every referential-integrity lookup (advisor follow-up
-- from the 2026-08-06 remediation review).
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_fulfillment_jobs_order_id
  on public.fulfillment_jobs (order_id);
