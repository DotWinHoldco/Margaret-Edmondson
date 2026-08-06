-- 2026080605_shared_rate_limiter.sql
-- Authored by DotWin
--
-- Shared, cross-instance rate limiting for the public API surface.
--
-- The application limiter (src/lib/api/rate-limit.ts) used to be an in-memory
-- Map scoped to a single serverless instance. Under horizontal scale each new
-- lambda started with an empty map, so an attacker spraying requests across
-- instances got `limit x instance_count` attempts per window and every counter
-- reset on cold start. The limit protected nothing it claimed to protect.
--
-- This moves the counter into Postgres, where every instance shares one bucket
-- row per key. The counter is a fixed-window counter applied atomically in a
-- single INSERT ... ON CONFLICT DO UPDATE statement: the read, the window
-- rollover decision, and the increment all happen inside one statement holding
-- the row lock, so two concurrent hits can never both observe "count = limit - 1"
-- and both be allowed.
--
-- Access model (mirrors public.checkout_snapshots, 2026062800):
--   * RLS enabled on the table with NO policies, and the default schema grants
--     revoked, so anon/authenticated can neither read nor write it directly.
--   * rate_limit_hit() is SECURITY DEFINER with a pinned empty search_path and
--     EXECUTE granted to service_role only. The API routes reach it through the
--     service-role client (there is no user session on a public POST, and the
--     limiter must count hits for callers that RLS would otherwise hide).
--
-- Replay-safe: create-if-not-exists table/index, drop-then-create function.

create table if not exists public.rate_limit_buckets (
  key          text        primary key,
  window_start timestamptz not null default now(),
  count        integer     not null default 0,
  expires_at   timestamptz not null
);

comment on table public.rate_limit_buckets is
  'Fixed-window rate limit counters shared by every server instance. Written only by public.rate_limit_hit() (SECURITY DEFINER, service_role).';

-- Supports the opportunistic cleanup sweep inside rate_limit_hit(), which
-- scans expired buckets in expires_at order.
create index if not exists rate_limit_buckets_expires_at_idx
  on public.rate_limit_buckets (expires_at);

alter table public.rate_limit_buckets enable row level security;

-- RLS is enabled with NO policies, so no non-service role can read or write a
-- row. Revoke the schema's default grants as well so the table is never
-- reachable through the PostgREST API even if default privileges grant them.
revoke all on public.rate_limit_buckets from anon, authenticated;

drop function if exists public.rate_limit_hit(text, integer, integer);

create function public.rate_limit_hit(
  p_key       text,
  p_limit     integer,
  p_window_ms integer
)
returns table (allowed boolean, remaining integer, retry_after_ms integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now        timestamptz := clock_timestamp();
  v_window     interval;
  v_count      integer;
  v_expires_at timestamptz;
begin
  -- Argument bounds. The caller is server code, but a limiter that silently
  -- accepts a null/zero limit would hand out an unbounded allowance.
  if p_key is null or length(p_key) = 0 or length(p_key) > 512 then
    raise exception 'rate_limit_hit: p_key must be 1 to 512 characters';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000000 then
    raise exception 'rate_limit_hit: p_limit must be 1 to 1000000';
  end if;
  if p_window_ms is null or p_window_ms < 1000 or p_window_ms > 86400000 then
    raise exception 'rate_limit_hit: p_window_ms must be 1000 to 86400000';
  end if;

  v_window := interval '1 second' * (p_window_ms::double precision / 1000.0);

  -- One atomic statement: insert the first hit of a window, or take the row
  -- lock and either roll the window over (the stored window already expired) or
  -- increment inside it. There is no read-then-write gap for a racing request
  -- to slip through, and RETURNING reports the row as it now stands.
  insert into public.rate_limit_buckets as b (key, window_start, count, expires_at)
  values (p_key, v_now, 1, v_now + v_window)
  on conflict (key) do update
     set window_start = case when b.expires_at <= v_now then v_now                else b.window_start end,
         count        = case when b.expires_at <= v_now then 1                    else b.count + 1    end,
         expires_at   = case when b.expires_at <= v_now then v_now + v_window     else b.expires_at   end
  returning b.count, b.expires_at
  into v_count, v_expires_at;

  -- A hit is allowed while the post-increment count is within the limit, so a
  -- limit of N allows exactly N requests per window. Over-limit hits still
  -- increment (they are counted) but never extend the window.
  if v_count > p_limit then
    allowed   := false;
    remaining := 0;
  else
    allowed   := true;
    remaining := p_limit - v_count;
  end if;
  retry_after_ms := greatest(0, ceil(extract(epoch from (v_expires_at - v_now)) * 1000))::integer;

  -- Opportunistic cleanup. Expired buckets are dead weight; sweeping a bounded
  -- batch on a small fraction of calls keeps the table flat without a cron job
  -- and without turning a hot path into a full-table delete. SKIP LOCKED keeps
  -- concurrent sweeps from blocking each other or a live counter update.
  if random() < 0.02 then
    delete from public.rate_limit_buckets r
     where r.key in (
       select c.key
         from public.rate_limit_buckets c
        where c.expires_at < v_now - interval '5 minutes'
        order by c.expires_at
        limit 500
        for update skip locked
     );
  end if;

  return next;
end;
$$;

comment on function public.rate_limit_hit(text, integer, integer) is
  'Atomically records one hit against a fixed-window rate limit bucket and returns the decision. service_role only; called by src/lib/api/rate-limit.ts.';

-- Service-role only: the limiter runs before (and independently of) any user
-- session, and no browser-reachable role may increment or inspect a counter.
revoke all on function public.rate_limit_hit(text, integer, integer) from public;
revoke all on function public.rate_limit_hit(text, integer, integer) from anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
