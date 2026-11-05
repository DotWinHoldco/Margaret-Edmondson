import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

type Settlement = (db: SupabaseClient, stripe: Stripe, event: Stripe.Event) => Promise<boolean>

/** Recover missed embedded-checkout events through the same idempotent settlement as the webhook.
 * Use success-event time, not intent creation time: an older intent can be paid today.
 * Credentials stay in the existing server runtime; this never creates or confirms a payment.
 */
export async function reconcileEmbeddedOrders(
  db: SupabaseClient,
  stripe: Stripe,
  settle: Settlement,
  now = Math.floor(Date.now() / 1000),
) {
  const result = { checked: 0, reconciled: 0, errors: [] as string[] }
  const started = Date.now()
  for await (const event of stripe.events.list({
    type: 'payment_intent.succeeded',
    created: { gte: now - 48 * 3600, lte: now - 5 * 60 },
    limit: 100,
  })) {
    if (result.checked >= 200 || Date.now() - started >= 40_000) break
    result.checked++
    if (event.type !== 'payment_intent.succeeded') continue
    const original = event.data.object
    // Hosted checkout and classes have their own settlement paths.
    if (original.metadata?.elements_checkout !== '1') continue
    try {
      const current = await stripe.paymentIntents.retrieve(original.id)
      if (current.status !== 'succeeded' || current.livemode !== event.livemode || current.metadata?.elements_checkout !== '1') continue
      const recovered = await settle(db, stripe, { ...event, data: { ...event.data, object: current } })
      if (recovered) result.reconciled++
    } catch (error) {
      console.error('Embedded order recovery failed:', original.id, error)
      result.errors.push(original.id)
    }
  }
  return result
}
