// Authored by DotWin. Use the same PaymentIntent/Elements flow as the production shop.
import 'server-only'
import { getStripeForMode, getStripeMode } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { festiveClass } from '@/sites/margaret-edmondson/festive-class'
import type { ArtRegistration } from './model'

/** Persist one intent per capability-validated group before exposing its payment secret. */
export async function createArtPaymentIntent(order: ArtRegistration) {
  if (order.mode !== await getStripeMode()) throw new Error('Payment mode changed')
  const stripe = getStripeForMode(order.mode)
  const db = await createServiceClient()
  const { data: saved, error } = await db.from('festive_registrations').select('stripe_payment,stripe_session').eq('id', order.id).single()
  if (error || !saved || saved.stripe_session) throw new Error('Registration unavailable')
  const intent = saved.stripe_payment
    ? await stripe.paymentIntents.retrieve(saved.stripe_payment)
    : await stripe.paymentIntents.create({
      amount: order.total, currency: 'usd', automatic_payment_methods: { enabled: true },
      description: `${festiveClass.title} · November 21, 2026 · ${order.payload.painters.length} painters`,
      receipt_email: order.payload.email,
      metadata: { scope: 'margaret_art_class', payment_flow: 'elements', registration_id: order.id },
    }, { idempotencyKey: `artbyme-festive-elements:${order.id}` })
  if (!intent.client_secret || intent.livemode !== (order.mode === 'live') || intent.amount !== order.total || intent.currency !== 'usd' || intent.metadata.registration_id !== order.id || intent.status === 'canceled') throw new Error('Payment unavailable')
  if (!saved.stripe_payment) {
    // Server-only provider binding after the capability RPC validates this exact group.
    const { error: linked } = await db.rpc('festive_link_intent', { p_id: order.id, p_intent: intent.id, p_amount: intent.amount, p_mode: order.mode })
    if (linked) throw new Error('Payment could not be linked')
  }
  return { clientSecret: intent.client_secret, mode: order.mode, amountCents: order.total }
}
