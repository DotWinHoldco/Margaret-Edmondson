import { registrationRequest, type ArtRegistration } from '@/lib/classes/festive/model'
import { artRpc, ArtRegistrationError, availableArtPaymentMode, readArtRequest } from '@/lib/classes/festive/server'
import { createArtPaymentIntent } from '@/lib/classes/festive/stripe'
import { festiveClass } from '@/sites/margaret-edmondson/festive-class'
import { NextRequest } from 'next/server'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

/** Authored by DotWin. Reserve validated choices at the database price, then open one idempotent group checkout. */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { limit: 10, windowMs: 60_000, keyPrefix: 'festive-checkout' })
  if (!limit.ok) return rateLimitResponse(limit)
  const headers = { 'Cache-Control': 'no-store' }
  let input
  try { input = registrationRequest.parse(await readArtRequest(request)) }
  catch { return Response.json({ error: 'Please check your contact information and choose a project for every painter.' }, { status: 400, headers }) }
  if (!await availableArtPaymentMode()) return Response.json({ error: 'Checkout is being connected. Please try again when registration opens.' }, { status: 503, headers })
  try {
    // dotwin-allow:public-write -- fixed-class, capability-scoped SQL owner; validated contact and per-email reservation throttle.
    const order = await artRpc<ArtRegistration>('festive_reserve', { p_id: input.id, p_token: input.token, p_payload: input.payload, p_expected_price: input.expectedPrice })
    const origin = new URL(request.url).origin
    if (order.status === 'paid') return Response.json({ confirmation: `${origin}${festiveClass.path}/confirmation#${input.id}:${input.token}` }, { headers })
    const payment = await createArtPaymentIntent(order)
    return Response.json(payment, { headers })
  } catch (error: unknown) {
    const priceChanged = error instanceof ArtRegistrationError && error.priceChanged
    console.error('[art-class.checkout]', error instanceof Error ? error.name : 'unknown')
    return Response.json({ priceChanged, error: priceChanged ? 'The price is now $25 per painter. Review your new total, then continue.' : 'We could not open payment. Your choices are still here. Please try again.' }, { status: priceChanged ? 409 : 503, headers })
  }
}
