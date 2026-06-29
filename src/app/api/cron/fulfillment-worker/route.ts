import { requireCron } from '@/lib/auth/require-cron'
import { createServiceClient } from '@/lib/supabase/server'
import { routeOrderToFulfillment } from '@/lib/fulfillment/router'
import { recomputeOrderStatus } from '@/lib/fulfillment/order-status'
import { enqueueFulfillmentJob, decideJobOutcome, backoffMs } from '@/lib/fulfillment/queue'
import { notifyFulfillmentFailures, notifyOrderNeedsAttention } from '@/lib/fulfillment/alerts'

export const runtime = 'nodejs'
export const maxDuration = 60

// Tunables. CLAIM_BATCH stays small because each job does ≥1 provider POST and the
// run must finish under maxDuration=60.
const CLAIM_BATCH = 8
const SWEEP_SCAN = 500 // order_items rows scanned for stranded candidates
const SWEEP_LIMIT = 50 // distinct candidate orders considered per run
const ENQUEUE_CAP = 20 // new jobs the recovery sweep may enqueue per run
const STRANDED_MIN = 10 // an order's pending/failed items must be older than this (minutes)
const RUNNING_TIMEOUT_MIN = 15 // a 'running' job older than this is presumed crashed → requeue
const TIME_BUDGET_MS = 45_000 // stop processing new jobs past this elapsed time

interface JobRow {
  id: string
  order_id: string
  attempts: number
  max_attempts: number
}

// GET /api/cron/fulfillment-worker — drain the durable fulfillment_jobs queue (P2-2):
// submit each reconciled order to its provider OFF the 60s Stripe webhook path, with
// bounded retries + exponential backoff, requeue of crashed 'running' jobs, and a
// recovery sweep that enqueues orders whose items are stranded pending/failed.
// CRON_SECRET-guarded; idempotent and safe to re-run.
export async function GET(request: Request) {
  const cron = requireCron(request)
  if (!cron.ok) return cron.response

  const supabase = await createServiceClient()
  const startedAt = Date.now()
  const summary = {
    requeuedRunning: 0,
    swept: 0,
    claimed: 0,
    done: 0,
    rescheduled: 0,
    failed: 0,
    needsAttention: 0,
    errors: [] as string[],
  }

  // 0) Requeue jobs stuck in 'running' past the timeout (a worker that crashed
  //    mid-job). Re-running routeOrderToFulfillment is safe: already-'submitted'
  //    items are not re-claimable, so nothing double-submits.
  {
    const cutoff = new Date(Date.now() - RUNNING_TIMEOUT_MIN * 60_000).toISOString()
    const { data: stale } = await supabase
      .from('fulfillment_jobs')
      .select('id')
      .eq('status', 'running')
      .lt('claimed_at', cutoff)
      .limit(50)
    const staleIds = (stale || []).map((r) => r.id as string)
    if (staleIds.length) {
      const { data: requeued } = await supabase
        .from('fulfillment_jobs')
        .update({ status: 'queued', run_after: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in('id', staleIds)
        .eq('status', 'running')
        .select('id')
      summary.requeuedRunning = (requeued || []).length
    }
  }

  // 1) Recovery sweep: enqueue orders whose items are stranded pending/failed but
  //    that have NO fulfillment_jobs row at all (a legacy order, or a lost enqueue).
  //    Once an order has any job — even a terminal one — the queue owns its retry
  //    lifecycle, so we never re-enqueue it here. That is what prevents an infinite
  //    sweep→fail→sweep loop after a job exhausts to 'failed'.
  {
    const cutoff = new Date(Date.now() - STRANDED_MIN * 60_000).toISOString()
    const { data: strandedItems } = await supabase
      .from('order_items')
      .select('order_id')
      .in('fulfillment_status', ['pending', 'failed'])
      .not('order_id', 'is', null)
      .limit(SWEEP_SCAN)
    const candidateIds = [...new Set((strandedItems || []).map((r) => r.order_id as string))].slice(0, SWEEP_LIMIT)
    if (candidateIds.length) {
      const [{ data: jobs }, { data: orders }] = await Promise.all([
        supabase.from('fulfillment_jobs').select('order_id').in('order_id', candidateIds),
        supabase.from('orders').select('id').in('id', candidateIds).lt('created_at', cutoff),
      ])
      const hasJob = new Set((jobs || []).map((r) => r.order_id as string))
      const toEnqueue = (orders || [])
        .map((r) => r.id as string)
        .filter((id) => !hasJob.has(id))
        .slice(0, ENQUEUE_CAP)
      for (const orderId of toEnqueue) {
        await enqueueFulfillmentJob(supabase, orderId)
        summary.swept++
      }
    }
  }

  // 2) Claim a batch of due 'queued' jobs. Select candidates, then flip each to
  //    'running' with a status='queued' guard so two concurrent workers can never
  //    both win the same row (the loser's conditional UPDATE matches nothing).
  const { data: candidates } = await supabase
    .from('fulfillment_jobs')
    .select('id')
    .eq('status', 'queued')
    .lte('run_after', new Date().toISOString())
    .order('run_after', { ascending: true })
    .limit(CLAIM_BATCH)
  const candidateJobIds = (candidates || []).map((r) => r.id as string)

  let claimed: JobRow[] = []
  if (candidateJobIds.length) {
    const { data: claimedRows } = await supabase
      .from('fulfillment_jobs')
      .update({ status: 'running', claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', candidateJobIds)
      .eq('status', 'queued')
      .select('id, order_id, attempts, max_attempts')
    claimed = (claimedRows || []) as JobRow[]
  }
  summary.claimed = claimed.length

  // 3) Process each claimed job.
  for (const job of claimed) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      // Out of time — release the remaining claim back to 'queued' for the next run.
      await supabase
        .from('fulfillment_jobs')
        .update({ status: 'queued', updated_at: new Date().toISOString() })
        .eq('id', job.id)
        .eq('status', 'running')
      continue
    }

    const attempt = job.attempts + 1
    let threw = false
    let threwMsg: string | null = null
    let results: Array<{ itemId: string; success: boolean; error?: string }> = []
    try {
      // includeValidationFailures:false → do not loop on a LumaPrints 406 (it needs a
      // human re-crop + manual refire). suppressFailureAlert → the worker owns the
      // alert lifecycle: once on the first failed pass, once on exhaustion.
      results = await routeOrderToFulfillment(job.order_id, {
        includeValidationFailures: false,
        suppressFailureAlert: true,
      })
    } catch (e) {
      threw = true
      threwMsg = e instanceof Error ? e.message : 'fulfillment routing error'
      summary.errors.push(`${job.order_id}: ${threwMsg}`)
    }

    // Roll the order status up from its items (safe; never downgrades).
    await recomputeOrderStatus(supabase, job.order_id)

    // Ground-truth the item states for the retry/stop decision.
    const { data: items } = await supabase
      .from('order_items')
      .select('fulfillment_status')
      .eq('order_id', job.order_id)
    const itemStatuses = (items || []).map((r) => r.fulfillment_status as string)

    const outcome = decideJobOutcome({ threw, itemStatuses, attempts: attempt, maxAttempts: job.max_attempts })
    const failures = results.filter((r) => !r.success).map((r) => ({ itemId: r.itemId, error: r.error }))
    const lastError = threw
      ? threwMsg
      : failures.map((f) => f.error).filter(Boolean).join('; ') || null
    const now = new Date().toISOString()

    if (outcome === 'queued') {
      await supabase
        .from('fulfillment_jobs')
        .update({
          status: 'queued',
          attempts: attempt,
          run_after: new Date(Date.now() + backoffMs(attempt)).toISOString(),
          last_error: lastError,
          updated_at: now,
        })
        .eq('id', job.id)
      summary.rescheduled++
      // Alert ONCE, on the first failed pass, for early visibility.
      if (attempt === 1) {
        if (failures.length) await notifyFulfillmentFailures(job.order_id, failures)
        else await notifyOrderNeedsAttention(job.order_id, [`Fulfillment attempt failed: ${lastError || 'unknown error'}. Retrying automatically.`])
      }
    } else if (outcome === 'failed') {
      await supabase
        .from('fulfillment_jobs')
        .update({ status: 'failed', attempts: attempt, completed_at: now, last_error: lastError, updated_at: now })
        .eq('id', job.id)
      summary.failed++
      await notifyOrderNeedsAttention(job.order_id, [
        `Automatic fulfillment exhausted ${attempt} attempts and still has unsubmitted items (last error: ${lastError || 'unknown'}). Open the order to investigate and refire.`,
      ])
    } else if (outcome === 'needs_attention') {
      await supabase
        .from('fulfillment_jobs')
        .update({ status: 'needs_attention', attempts: attempt, completed_at: now, last_error: lastError, updated_at: now })
        .eq('id', job.id)
      summary.needsAttention++
      const stranded = itemStatuses.filter((s) => s === 'submitting').length
      await notifyOrderNeedsAttention(job.order_id, [
        `${stranded} item(s) are stuck mid-submit. A print order may already exist at the provider. Reconcile before refiring so a duplicate is not created.`,
      ])
    } else {
      await supabase
        .from('fulfillment_jobs')
        .update({ status: 'done', attempts: attempt, completed_at: now, last_error: lastError, updated_at: now })
        .eq('id', job.id)
      summary.done++
    }
  }

  return Response.json(summary)
}
