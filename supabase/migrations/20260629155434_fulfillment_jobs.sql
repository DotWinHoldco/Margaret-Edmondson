-- 2026062900_fulfillment_jobs.sql
-- P2-2 (payment E2E remediation): a durable work queue that decouples LumaPrints /
-- Printful submission from the synchronous Stripe webhook (maxDuration=60). The
-- webhook previously called routeOrderToFulfillment() inline, so a mid-flight
-- timeout could strand un-submitted prints with no automated recovery (the only
-- fulfillment cron polls submitted/in_production items). The webhook now ENQUEUES
-- one job per reconciled order and a dedicated cron worker
-- (/api/cron/fulfillment-worker) claims and runs the provider submission off the
-- request path, with bounded retries + exponential backoff and a recovery sweep
-- for orders whose items are stranded pending/failed.
--
-- Service-role only: the webhook enqueues with the service client and the cron
-- worker drains it with the service client; both bypass RLS. anon + authenticated
-- get no access. Replay-safe (IF NOT EXISTS).

create table if not exists public.fulfillment_jobs (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  status        text not null default 'queued'
                  check (status in ('queued', 'running', 'done', 'failed', 'needs_attention')),
  attempts      integer not null default 0,
  max_attempts  integer not null default 6,
  run_after     timestamptz not null default now(),
  last_error    text,
  claimed_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- At most one ACTIVE (queued|running) job per order: the enqueue insert conflicts
-- (23505) on a redelivered webhook or a concurrent claim and is ignored, so an
-- order is never double-queued. Terminal rows (done|failed|needs_attention) are
-- exempt, so a later manual refire can still enqueue a fresh job.
create unique index if not exists fulfillment_jobs_active_order_uniq
  on public.fulfillment_jobs (order_id)
  where status in ('queued', 'running');

-- Claim scan: the worker pulls the oldest due 'queued' rows.
create index if not exists fulfillment_jobs_claimable_idx
  on public.fulfillment_jobs (run_after)
  where status = 'queued';

alter table public.fulfillment_jobs enable row level security;

-- RLS enabled with NO policies, so non-service roles can read/write nothing. Also
-- revoke the schema's default table grants so the table is never reachable through
-- the public PostgREST API even if default privileges would grant them.
revoke all on public.fulfillment_jobs from anon, authenticated;
