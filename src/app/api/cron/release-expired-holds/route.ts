// Maintenance cron (every 10 minutes via vercel.json): retire original-artwork
// purchase holds whose TTL lapsed without a payment.
//
// Hosted Checkout Sessions do not need this sweep (their bounded expires_at
// emits checkout.session.expired, which releases holds in the webhook); it
// exists for the embedded PaymentIntent flow, where an abandoned intent never
// expires on its own, and as a belt-and-braces backstop for missed webhooks.
// Marking a hold 'expired' is what returns the piece to the storefront: the
// availability count in hold_originals only respects live holds. Cancelling
// the intent afterwards is best-effort hygiene; an intent that races to
// succeed anyway is still handled safely by convert_original_hold's
// expired-hold path (it re-checks real availability and the webhook refunds
// when the piece is gone).
import { createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { requireCron } from '@/lib/auth/require-cron'

export const runtime = 'nodejs'
export const maxDuration = 60

const SWEEP_BATCH = 200

// GET /api/cron/release-expired-holds — expire lapsed original holds and cancel their unpaid embedded-checkout PaymentIntents; cron-only (CRON_SECRET).
export async function GET(request: Request) {
  const cron = requireCron(request)
  if (!cron.ok) return cron.response

  const supabase = await createServiceClient()
  const nowIso = new Date().toISOString()

  const { data: lapsed, error: sweepError } = await supabase
    .from('original_holds')
    .update({ status: 'expired', updated_at: nowIso })
    .eq('status', 'held')
    .lt('expires_at', nowIso)
    .select('payment_ref')
    .limit(SWEEP_BATCH)

  if (sweepError) {
    console.error('release-expired-holds sweep failed:', sweepError)
    return Response.json({ ok: false, error: 'sweep_failed' }, { status: 500 })
  }

  // Cancel the embedded-checkout intents whose holds just lapsed so a stale
  // client secret cannot be paid later. Sessions (cs_*) expire on their own.
  const intentRefs = [...new Set(
    (lapsed || [])
      .map((row) => row.payment_ref as string)
      .filter((ref) => ref.startsWith('pi_')),
  )]

  let cancelled = 0
  const skipped: string[] = []
  if (intentRefs.length > 0) {
    const stripe = await getStripe()
    for (const ref of intentRefs) {
      try {
        await stripe.paymentIntents.cancel(ref)
        cancelled += 1
      } catch (err) {
        // Already succeeded, already cancelled, or mid-processing: all fine.
        // The webhook owns those paths; this sweep only prunes the abandoned.
        skipped.push(`${ref}: ${(err as Error).message}`)
      }
    }
  }
  if (skipped.length > 0) {
    console.error(`release-expired-holds: ${skipped.length} intent cancellations skipped`, skipped.slice(0, 5))
  }

  return Response.json({
    ok: true,
    holds_expired: lapsed?.length ?? 0,
    intents_cancelled: cancelled,
    intents_skipped: skipped.length,
  })
}
