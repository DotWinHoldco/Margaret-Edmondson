import type { SupabaseClient } from '@supabase/supabase-js'

// P2-2: the durable fulfillment queue. The Stripe webhook enqueues one job per
// reconciled order; the /api/cron/fulfillment-worker cron drains the queue off the
// 60s request path. This module holds the enqueue + the PURE retry/stop decision
// so the latter is unit-tested without a database.

// order_items.fulfillment_status buckets the worker reasons about after a
// routeOrderToFulfillment() pass:
//   retryable  — transient, resubmit on the next run. 'pending' = never claimed,
//                'failed' = a non-validation submit failure (5xx / network / config).
//   stranded   — 'submitting': an item left mid-submit. A provider order MAY already
//                exist, so the worker must NOT auto-resubmit (P2-3 / P2-5) — it needs
//                human reconciliation.
//   validation — 'failed_validation' (a LumaPrints 406 / aspect / DPI problem) needs
//                a human re-crop + manual refire; the worker does not loop on it.
const RETRYABLE = new Set(['pending', 'failed'])
const STRANDED = new Set(['submitting'])

export type JobOutcome = 'queued' | 'failed' | 'needs_attention' | 'done'

// Pure decision: given the result of one routeOrderToFulfillment() pass, decide the
// job's next state. No IO, so the retry/stop logic is unit-testable.
//   - any retryable item (or a thrown pass): reschedule until max_attempts, then fail
//   - else any stranded item: needs_attention (human reconcile; do not auto-resubmit)
//   - else: done (all items submitted/in-flight/shipped, or only validation failures
//     that were already alerted at submit time and await a manual refire)
export function decideJobOutcome(opts: {
  threw: boolean
  itemStatuses: string[]
  attempts: number
  maxAttempts: number
}): JobOutcome {
  const { threw, itemStatuses, attempts, maxAttempts } = opts
  const hasRetryable = threw || itemStatuses.some((s) => RETRYABLE.has(s))
  const hasStranded = itemStatuses.some((s) => STRANDED.has(s))

  if (hasRetryable) return attempts >= maxAttempts ? 'failed' : 'queued'
  if (hasStranded) return 'needs_attention'
  return 'done'
}

// Exponential backoff (ms) for a rescheduled job. `attempts` is the post-increment
// attempt count, so the first retry waits ~2 min and it grows to a 60-min ceiling.
export function backoffMs(attempts: number): number {
  const minutes = Math.min(2 ** Math.max(1, attempts), 60)
  return minutes * 60_000
}

// Enqueue exactly one ACTIVE fulfillment job for an order. The partial unique index
// (status in queued|running) makes a redelivered webhook or a concurrent claim a
// caught no-op (23505), so an order is never double-queued. Best-effort + no-throw:
// a failed enqueue is logged and the worker's recovery sweep re-enqueues later.
export async function enqueueFulfillmentJob(supabase: SupabaseClient, orderId: string): Promise<void> {
  try {
    const { error } = await supabase.from('fulfillment_jobs').insert({ order_id: orderId })
    if (error && (error as { code?: string }).code !== '23505') {
      console.error('enqueueFulfillmentJob insert failed:', error.message)
    }
  } catch (e) {
    console.error('enqueueFulfillmentJob threw:', e)
  }
}
