// Server cart sync. CartProvider on the client debounces every cart
// mutation and POSTs here so we have a server-side record for the
// abandonment sequence. Email is optional — if provided we also create
// the canonical CRM contact and join the Cart Abandoners list.

import { createClient } from '@/lib/supabase/server'
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

  const supabase = await createClient()
  const nowIso = new Date().toISOString()

  let contactId: string | null = null
  if (email && email.includes('@')) {
    const contact = await upsertContact(
      { email, source: 'cart', listSlug: 'cart-abandoners' },
      supabase
    )
    if (contact) contactId = contact.id
  }

  if (body.cartId) {
    const update = {
      items: items as unknown as object,
      subtotal,
      last_activity_at: nowIso,
      email: email ?? null,
      contact_id: contactId,
      status: items.length === 0 ? 'dead' : 'active',
    } as const

    const { data, error } = await supabase
      .from('carts')
      .update(update)
      .eq('id', body.cartId)
      .select('id')
      .maybeSingle()
    if (!error && data) {
      return Response.json({ ok: true, cartId: data.id })
    }
  }

  if (items.length === 0) {
    return Response.json({ ok: true, cartId: null })
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('carts')
    .insert({
      items: items as unknown as object,
      subtotal,
      last_activity_at: nowIso,
      email: email ?? null,
      contact_id: contactId,
      status: 'active',
    })
    .select('id')
    .maybeSingle()

  if (insertErr || !inserted) {
    console.error('cart insert failed', insertErr)
    return Response.json({ ok: false }, { status: 500 })
  }

  return Response.json({ ok: true, cartId: inserted.id })
}
