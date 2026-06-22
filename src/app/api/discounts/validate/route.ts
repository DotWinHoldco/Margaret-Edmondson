// Public-facing discount code validator. Used by the cart page to
// give users immediate feedback before they reach Stripe. The same
// rules run on the server during checkout, so a tampered client can
// never sneak a code past.

import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { validateDiscountCode } from '@/lib/discounts/validate'

// POST /api/discounts/validate — validate a discount code against the cart for instant client feedback; public.
export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, keyPrefix: 'discount-validate' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = await request.json().catch(() => ({}))
  const { code, email, cartId, cartSubtotal } = body as {
    code?: string
    email?: string
    cartId?: string
    cartSubtotal?: number
  }

  if (!code || typeof code !== 'string') {
    return Response.json({ ok: false, reason: 'missing_code' }, { status: 400 })
  }
  if (typeof cartSubtotal !== 'number' || cartSubtotal < 0) {
    return Response.json({ ok: false, reason: 'missing_subtotal' }, { status: 400 })
  }

  const supabase = await createClient()

  let contactId: string | null = null
  if (email && email.includes('@')) {
    const { data: contact } = await supabase
      .from('crm_contacts')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()
    contactId = contact?.id ?? null
  }

  const result = await validateDiscountCode(
    code,
    { contactId, email: email ?? null, cartId: cartId ?? null, cartSubtotal },
    supabase
  )

  if (!result.ok) {
    return Response.json({ ok: false, reason: result.reason })
  }

  return Response.json({
    ok: true,
    code: result.code.code,
    discountType: result.code.discount_type,
    discountValue: result.code.discount_value,
    amountOffCents: result.amountOffCents,
    description: result.code.description,
  })
}
