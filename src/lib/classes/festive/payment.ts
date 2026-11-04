// Authored by DotWin. Called only after the existing Stripe webhook verifies the event.
import 'server-only'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sendFestiveEmails } from './email'

const checkoutEvents = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'])

/** Re-read provider state, validate the frozen order, then persist and deliver confirmations. */
export async function handleFestivePayment(db: SupabaseClient, stripe: Stripe, event: Stripe.Event): Promise<boolean> {
  if (!checkoutEvents.has(event.type)) return false
  const delivered = event.data.object as Stripe.Checkout.Session
  if (delivered.metadata?.scope !== 'margaret_art_class') return false
  if (event.account) throw new Error('Unexpected connected merchant')
  const session = await stripe.checkout.sessions.retrieve(delivered.id)
  const id = z.string().uuid().parse(session.metadata?.registration_id)
  if (session.metadata?.scope !== 'margaret_art_class' || session.client_reference_id !== id || session.livemode !== event.livemode) throw new Error('Payment scope mismatch')
  const status = session.payment_status === 'paid' ? 'paid' : session.status === 'expired' ? 'expired' : event.type === 'checkout.session.async_payment_failed' ? 'failed' : 'pending'
  const { error } = await db.rpc('festive_payment', {
    p_id: id, p_event: event.id, p_session: session.id,
    p_payment: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '',
    p_amount: session.amount_total ?? -1, p_currency: session.currency || '',
    p_mode: session.livemode ? 'live' : 'test', p_status: status,
  })
  if (error) throw new Error('Class payment could not be recorded')
  // Retry even when the payment event was already recorded: delivery may have failed earlier.
  if (status === 'paid' && event.livemode) await sendFestiveEmails(db, id)
  return true
}
