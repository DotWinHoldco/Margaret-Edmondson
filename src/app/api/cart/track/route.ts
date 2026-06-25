// dotwin-allow:public-write — anonymous guest cart sync (no profile) (input validated + rate-limited). Authored by DotWin.
// Server cart sync. CartProvider on the client debounces every cart
// mutation and POSTs here so we have a server-side record for the
// abandonment sequence. Routes through the track_cart SECURITY
// DEFINER RPC so anon callers (every shopper) can write to carts
// without needing direct INSERT+SELECT grants — RLS forbids anon
// SELECT on carts, so the previous .insert(...).select('id') path
// failed silently.

import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { upsertContact } from '@/lib/crm/contacts'

interface CartTrackPayload {
  cartId?: string | null
  email?: string | null
  items: Array<{
    productId: string
    variantId?: string | null
    title?: string
    price?: number
    quantity: number
  }>
  subtotal?: number
}

// POST /api/cart/track — sync a guest cart server-side for abandonment tracking; public.
export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, keyPrefix: 'cart-track' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = (await request.json().catch(() => ({}))) as CartTrackPayload
  const items = Array.isArray(body.items) ? body.items : []
  const subtotal = typeof body.subtotal === 'number' ? body.subtotal : 0
  const email = body.email ? body.email.toLowerCase().trim() : null

  if (items.length === 0 && !body.cartId) {
    return Response.json({ ok: true, cartId: null })
  }

  // track_cart is SECURITY DEFINER and EXECUTE-able only by service_role, so
  // the privileged write runs on the service-role client. The route is the
  // rate-limited, input-validated trust boundary.
  const svc = await createServiceClient()

  let contactId: string | null = null
  if (email && email.includes('@')) {
    const contact = await upsertContact(
      { email, source: 'cart', listSlug: 'cart-abandoners' }
    )
    if (contact) contactId = contact.id
  }

  const { data, error } = await svc.rpc('track_cart', {
    p_cart_id: body.cartId ?? null,
    p_email: email,
    p_items: items as unknown as object,
    p_subtotal: subtotal,
    p_contact_id: contactId,
  })

  if (error) {
    console.error('track_cart RPC failed', error)
    return Response.json({ ok: false, error: 'cart_track_failed' }, { status: 500 })
  }

  return Response.json({ ok: true, cartId: (data as string | null) ?? null })
}
