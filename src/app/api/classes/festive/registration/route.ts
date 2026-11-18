import { registrationLookup, type ArtRegistration } from '@/lib/classes/festive/model'
import { artRpc, readArtRequest } from '@/lib/classes/festive/server'
import { reconcileArtPayment } from '@/lib/classes/festive/reconcile'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
/** Authored by DotWin. Validate the private capability before checking authoritative payment evidence. */
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000, keyPrefix: 'festive-registration' })
  if (!limit.ok) return rateLimitResponse(limit)
  try {
    const input = registrationLookup.parse(await readArtRequest(request))
    let order = await artRpc<ArtRegistration | null>('festive_registration_status', { p_id: input.id, p_token: input.token })
    if (!order || order.class_slug !== input.classSlug) return Response.json({ error: 'Registration not found. Please use the private link from checkout.' }, { status: 404, headers })
    if (order.status === 'pending') {
      // dotwin-allow:public-write -- capability checked above; settlement uses a genuine server-fetched Stripe event and the existing service-only SQL owner.
      try { await reconcileArtPayment(order) }
      catch { console.error('[art-class.registration] Provider reconciliation unavailable') }
      order = await artRpc<ArtRegistration | null>('festive_registration_status', { p_id: input.id, p_token: input.token })
      if (!order || order.class_slug !== input.classSlug) throw new Error('Registration unavailable')
    }
    return Response.json({ order }, { headers })
  } catch { return Response.json({ error: 'Unable to retrieve this registration. Please try again.' }, { status: 400, headers }) }
}
