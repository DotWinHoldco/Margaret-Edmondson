import { requireCron } from '@/lib/auth/require-cron'
import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { handleCheckoutCompleted } from '@/app/api/webhooks/stripe/route'
import type Stripe from 'stripe'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/cron/reconcile-orders — money-path safety net for the "paid but never
// recorded" class (a Stripe webhook that was never delivered, or delivered while
// the endpoint/secret was misconfigured). The ops-monitor cron only catches orders
// that EXIST with zero items; a never-delivered webhook leaves NO order/enrollment/
// booking at all, so nothing there can see it. This sweep closes that gap: it lists
// recently-completed Checkout Sessions straight from Stripe, and for any PAID session
// whose record is missing past a short grace window, it replays the session through
// the SAME idempotent handler the live webhook uses (handleCheckoutCompleted) — so
// the order/enrollment/booking is created, emails fire, and fulfillment is queued,
// exactly as if the webhook had arrived. Idempotent + CRON_SECRET-guarded.
const GRACE_MIN = 15 // don't touch a session until the webhook has had time to land
const LOOKBACK_HOURS = 48 // how far back to reconcile
const MAX_SESSIONS = 500 // hard bound on Stripe pages per run

export async function GET(request: Request) {
  const cron = requireCron(request)
  if (!cron.ok) return cron.response

  const supabase = await createServiceClient()
  const stripe = await getStripe()
  const nowSec = Math.floor(Date.now() / 1000)
  const graceCutoff = nowSec - GRACE_MIN * 60
  const lookbackStart = nowSec - LOOKBACK_HOURS * 3600

  let checked = 0
  let reconciled = 0
  const errors: string[] = []

  try {
    // Newest first; Stripe paginates. We only consider sessions older than the
    // grace window so we never race a webhook that is about to arrive.
    for await (const s of stripe.checkout.sessions.list({
      created: { gte: lookbackStart, lte: graceCutoff },
      limit: 100,
    })) {
      if (checked >= MAX_SESSIONS) break
      checked++

      // Only PAID, completed sessions can have a missing record worth creating.
      const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required'
      if (s.status !== 'complete' || !paid) continue

      const md = (s.metadata || {}) as Record<string, string | undefined>
      try {
        let alreadyRecorded = false

        if (md.class_booking_id) {
          // Booking is created at checkout as awaiting_payment; the webhook flips
          // it to paid. Missing webhook => still awaiting_payment (or expired-cron
          // cancelled). Reconcile only if it is still awaiting_payment.
          const { data: booking } = await supabase
            .from('class_bookings')
            .select('status')
            .eq('id', md.class_booking_id)
            .maybeSingle()
          alreadyRecorded = !booking || booking.status !== 'awaiting_payment'
        } else if (md.course_id) {
          const { data: enrollment } = await supabase
            .from('enrollments')
            .select('id')
            .eq('stripe_checkout_session_id', s.id)
            .maybeSingle()
          alreadyRecorded = !!enrollment
        } else {
          const { data: order } = await supabase
            .from('orders')
            .select('id, order_items(id), side_effects_completed_at')
            .eq('stripe_checkout_session_id', s.id)
            .maybeSingle()
          // Fully recorded only when the order exists WITH items AND side effects.
          // A zero-item or side-effect-incomplete order is handled by ops-monitor /
          // the resume path; re-running the handler is idempotent regardless.
          const items = (order?.order_items as { id: string }[] | undefined) ?? []
          alreadyRecorded = !!order && items.length > 0 && order.side_effects_completed_at != null
        }

        if (alreadyRecorded) continue

        // Retrieve the full session (customer/shipping/total details) and replay it
        // through the live handler. The synthesized event only needs the fields
        // handleCheckoutCompleted + logEvent read.
        const full = await stripe.checkout.sessions.retrieve(s.id)
        const syntheticEvent = {
          id: `evt_reconcile_${s.id}`,
          type: 'checkout.session.completed',
          created: nowSec,
          livemode: full.livemode,
          data: { object: full },
        } as unknown as Stripe.Event

        await handleCheckoutCompleted(supabase, stripe, syntheticEvent)

        await supabase.from('webhook_logs').insert({
          source: 'cron_reconcile_orders',
          event_type: 'reconciled_by_sweep',
          payload: {
            alert: 'reconciled_by_sweep',
            session_id: s.id,
            kind: md.class_booking_id ? 'class_booking' : md.course_id ? 'enrollment' : 'order',
            payment_intent: typeof full.payment_intent === 'string' ? full.payment_intent : null,
          } as unknown as Record<string, unknown>,
        })
        reconciled++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`reconcile-orders: session ${s.id} failed:`, msg)
        errors.push(`${s.id}: ${msg}`)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('reconcile-orders: list failed:', msg)
    return Response.json({ error: 'list_failed', message: msg }, { status: 500 })
  }

  return Response.json({ checked, reconciled, errors: errors.slice(0, 10) })
}
