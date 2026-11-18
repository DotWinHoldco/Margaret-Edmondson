// Authored by DotWin. Recover delayed class callbacks using authenticated Stripe evidence.
import 'server-only'
import type Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { getStripeForMode } from '@/lib/stripe'
import { handleFestivePayment } from './payment'
import type { ArtRegistration } from './model'

/** Called only after the private registration capability and class have been validated. */
export async function reconcileArtPayment(order: ArtRegistration): Promise<void> {
  if (order.status !== 'pending') return
  const db = await createServiceClient()
  // The caller cannot supply a provider ID: use only the intent bound to this registration.
  const { data: saved, error } = await db.from('festive_registrations')
    .select('stripe_payment,stripe_session').eq('id', order.id).single()
  if (error) throw new Error('Registration payment unavailable')
  if (!saved?.stripe_payment || saved.stripe_session) return
  const stripe = getStripeForMode(order.mode)
  const intent = await stripe.paymentIntents.retrieve(saved.stripe_payment)
  // Existing Texas intents predate explicit class metadata; Illinois always requires it.
  const paymentClass = intent.metadata.class_slug || 'festive-paint-at-the-market'
  if (intent.id !== saved.stripe_payment || intent.metadata.scope !== 'margaret_art_class'
    || intent.metadata.payment_flow !== 'elements' || intent.metadata.registration_id !== order.id
    || paymentClass !== order.class_slug || intent.livemode !== (order.mode === 'live')
    || intent.amount !== order.total || intent.currency !== 'usd') {
    throw new Error('Registration payment evidence mismatch')
  }
  if (intent.status !== 'succeeded') return
  if (intent.amount_received !== order.total) throw new Error('Registration payment amount mismatch')

  // Reuse the actual Stripe event ID and the existing atomic settlement owner.
  // No event, status, price, or payment ID from the browser is treated as payment evidence.
  // Stripe retains these events for 30 days. Bound each refresh to at most 300
  // success events; a missing event stays pending and can be checked again later.
  let startingAfter: string | undefined
  for (let page = 0; page < 3; page++) {
    const events = await stripe.events.list({
      type: 'payment_intent.succeeded', created: { gte: intent.created }, limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    const event = events.data.find(candidate => candidate.type === 'payment_intent.succeeded'
      && (candidate.data.object as Stripe.PaymentIntent).id === intent.id)
    if (event) {
      if (event.livemode !== intent.livemode || event.account) throw new Error('Registration event merchant mismatch')
      await handleFestivePayment(db, stripe, event)
      return
    }
    if (!events.has_more || !events.data.length) return
    startingAfter = events.data[events.data.length - 1].id
  }
}
