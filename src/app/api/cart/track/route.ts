// dotwin-allow:public-write — anonymous guest cart sync (no profile) (input validated + rate-limited). Authored by DotWin.
// Server cart sync. CartProvider on the client debounces every cart
// mutation and POSTs here so we have a server-side record for the
// abandonment sequence. Routes through the track_cart SECURITY
// DEFINER RPC so anon callers (every shopper) can write to carts
// without needing direct INSERT+SELECT grants — RLS forbids anon
// SELECT on carts, so the previous .insert(...).select('id') path
// failed silently.
//
// This is the only route that can create a cart, so it is also the only issuer
// of cart tokens. The client never sees a bare `carts.id`: it presents the
// signed token it holds (if any) and stores whatever token comes back.

import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { upsertContact } from '@/lib/crm/contacts'
import { parseBody } from '@/lib/api/respond'
import { cartTrackingInputSchema } from '@/lib/api/public-input'
import { issueCartToken, resolveCartToken } from '@/lib/cart/token'

// POST /api/cart/track — sync a guest cart server-side for abandonment tracking; public.
export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, keyPrefix: 'cart-track' })
  if (!rl.ok) return rateLimitResponse(rl)

  const parsed = await parseBody(request, cartTrackingInputSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data
  const { items, subtotal } = body
  const email = body.email?.toLowerCase() ?? null

  // An unreadable token (forged, tampered, expired, or issued under a rotated
  // secret) is not an error the shopper should ever see: it simply means this
  // browser has no server-side cart, so the sync below starts a fresh one.
  const presented = body.cartToken ? resolveCartToken(body.cartToken) : null
  const cartId = presented?.cartId ?? null

  if (items.length === 0 && !cartId) {
    return Response.json({ ok: true, cartToken: null })
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
    p_cart_id: cartId,
    p_email: email,
    p_items: items as unknown as object,
    p_subtotal: subtotal,
    p_contact_id: contactId,
  })

  if (error) {
    console.error('track_cart RPC failed', error)
    return Response.json({ ok: false, error: 'cart_track_failed' }, { status: 500 })
  }

  const syncedCartId = (data as string | null) ?? null
  if (!syncedCartId) {
    // track_cart returns null only when there is nothing to persist.
    return Response.json({ ok: true, cartToken: null })
  }

  // Hand back a token when the cart the RPC settled on is not the one the
  // presented token names (a new cart, or a replacement for a cart row that no
  // longer exists), or when the presented token is inside its renewal window.
  let cartToken: string | null
  try {
    cartToken = syncedCartId === cartId ? presented?.renewedToken ?? null : issueCartToken(syncedCartId)
  } catch (err) {
    // Signing is unavailable (no configured secret in production). Fail closed
    // rather than hand the browser a cart reference it could not have earned.
    console.error('cart token issuance failed', err)
    return Response.json({ ok: false, error: 'cart_token_unavailable' }, { status: 503 })
  }

  return Response.json({ ok: true, cartToken })
}
