// Authored by DotWin. Reuse Artbyme's existing account, mode selector and signed webhook.
import 'server-only'
import { getStripeForMode, getStripeMode } from '@/lib/stripe'
import { festiveClass, festivePaintings } from '@/sites/margaret-edmondson/festive-class'
import { paintingQuantities, type ArtRegistration } from './model'

/** One idempotent checkout pays for every selected canvas at the database's frozen price. */
export async function createArtCheckout(order: ArtRegistration, token: string, origin: string) {
  if (order.mode !== await getStripeMode()) throw new Error('Payment mode changed')
  const stripe = getStripeForMode(order.mode)
  const metadata = { scope: 'margaret_art_class', registration_id: order.id }
  const confirmation = `${origin}${festiveClass.path}/confirmation#${order.id}:${token}`
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', integration_identifier: 'artbyme_festive_qhptzvnr',
    customer_email: order.payload.email, client_reference_id: order.id,
    metadata, payment_intent_data: { metadata },
    line_items: paintingQuantities(order.payload.painters).map(({ painting, quantity }) => ({
      quantity, price_data: { currency: 'usd', unit_amount: order.unit_price, product_data: {
        name: `${festivePaintings.find(item => item.id === painting)!.name} · ${festiveClass.title}`,
        description: `November 21, 2026, 9 AM–12:30 PM. ${festiveClass.marketAddress}. Pre-drawn 8×10 canvas, materials and instruction included.`,
      } },
    })),
    success_url: confirmation,
    cancel_url: confirmation.replace('/confirmation#', '/confirmation?returned=1#'),
    expires_at: Math.floor(Date.parse(order.created_at) / 1000) + 1860,
  }, { idempotencyKey: `artbyme-festive:${order.id}` })
  if (!session.url || session.livemode !== (order.mode === 'live')) throw new Error('Checkout unavailable')
  return session.url
}
