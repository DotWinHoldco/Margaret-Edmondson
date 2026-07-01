// dotwin-allow:public-write — guest checkout: create Stripe payment intent (input validated + rate-limited). Authored by DotWin.
// Embedded (Stripe Payment Elements) checkout — creates a PaymentIntent for
// the on-site /checkout page. ADDITIVE: the hosted-Checkout flow in
// ../route.ts is untouched and remains the fallback ("express checkout").
//
// Validation mirrors /api/checkout exactly (re-price from DB, server-side
// surcharge from the cart row, promo via validate_promo_code_public), but the
// discount is computed directly into the PaymentIntent amount — no Stripe
// coupons in this flow. The webhook fulfills via payment_intent.succeeded
// (metadata.elements_checkout === '1') reading items from carts.items, same
// as the hosted flow (B-5).

import { getStripe } from '@/lib/stripe'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { getSiteSettings } from '@/lib/settings/accessor'
import { validateDiscountCode } from '@/lib/discounts/validate'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

function jsonError(message: string, status: number = 400, code?: string) {
  return Response.json({ error: message, code: code ?? null }, { status })
}

// Map a promo validator reason code to friendly, shopper-safe copy so a raw
// enum ("usage_exhausted") never reaches the checkout screen. Mirrors the
// cart page's promoErrorMessage; the reason enum is still returned as `code`
// for client branching.
function promoReasonMessage(reason?: string): string {
  switch (reason) {
    case 'not_found': return 'That code is not recognized.'
    case 'expired': return 'That code has expired.'
    case 'not_yet_valid': return 'That code is not active yet.'
    case 'inactive': return 'That code is no longer active.'
    case 'usage_exhausted': return 'That code has been fully redeemed.'
    case 'min_order_not_met': return 'Your cart does not meet the minimum order amount for that code.'
    case 'wrong_contact': return 'That code was sent to a different email. Return to your cart to re-apply it.'
    case 'wrong_cart': return 'That code is reserved for a different cart.'
    case 'already_redeemed': return 'You have already used that code.'
    default: return 'That code could not be applied. Return to your cart to try another.'
  }
}

// POST /api/checkout/intent — re-price the cart from DB and create a Stripe PaymentIntent for on-site checkout; public.
export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 10, windowMs: 60_000, keyPrefix: 'checkout-intent' })
  if (!rl.ok) return rateLimitResponse(rl)
  try {
    const { getStripeMode, isStripeKeyConfigured } = await import('@/lib/stripe')
    const activeMode = await getStripeMode()
    if (!isStripeKeyConfigured(activeMode)) {
      console.error(
        `Stripe ${activeMode} secret key missing — set ${
          activeMode === 'live' ? 'STRIPE_SECRET_KEY' : 'STRIPE_SECRET_KEY_TEST'
        } in Vercel`,
      )
      return jsonError(
        'Checkout is temporarily unavailable. Please try again in a moment or contact us.',
        503,
        'stripe_not_configured',
      )
    }

    const { items, email, cartId, promoCode } = await request.json()

    if (!items?.length) {
      return jsonError('No items provided', 400, 'empty_cart')
    }

    const supabase = await createClient()

    // Validate prices server-side — NEVER trust client prices. (Mirrors /api/checkout.)
    const validatedItems = []
    for (const item of items) {
      const { data: product } = await supabase
        .from('products')
        .select('id, title, base_price, fulfillment_type')
        .eq('id', item.productId)
        .single()

      if (!product) {
        return jsonError(`Product ${item.productId} not found`, 400, 'product_missing')
      }

      let price = product.base_price
      let variantName = ''
      let variantType: string | null = null

      if (item.variantId) {
        const { data: variant } = await supabase
          .from('product_variants')
          .select('id, name, price, variant_type, inventory_count')
          .eq('id', item.variantId)
          .single()

        if (variant) {
          if (variant.variant_type === 'original' && variant.inventory_count !== null && variant.inventory_count <= 0) {
            return jsonError(`"${product.title}" original is no longer available`, 400, 'sold_out')
          }
          price = variant.price
          variantName = ` — ${variant.name}`
          variantType = variant.variant_type
        }
      }

      // B-7: derive fulfillment from SERVER data, never the client.
      const fulfillmentType =
        variantType === 'original' ? 'self_ship' : (product.fulfillment_type || 'lumaprints')

      validatedItems.push({
        ...item,
        title: product.title + variantName,
        price,
        variantType,
        fulfillmentType,
      })
    }

    // B-5 + B-6: persist validated line items onto the cart row (the webhook
    // reads items back from carts.items) and take the surcharge from the
    // SERVER-set cart value, never the client body. (Mirrors /api/checkout.)
    let surchargeCents = 0
    if (cartId) {
      const svc = await createServiceClient()
      await svc
        .from('carts')
        .update({
          items: validatedItems.map((i: { productId: string; variantId?: string; variantType: string | null; fulfillmentType: string; quantity: number; price: number; title: string }) => ({
            productId: i.productId,
            variantId: i.variantId ?? null,
            variantType: i.variantType ?? null,
            fulfillmentType: i.fulfillmentType,
            quantity: i.quantity,
            price: i.price,
            title: i.title,
          })),
        })
        .eq('id', cartId)
      const { data: cartRow } = await svc
        .from('carts')
        .select('shipping_surcharge_cents')
        .eq('id', cartId)
        .maybeSingle()
      surchargeCents = cartRow?.shipping_surcharge_cents ?? 0
    }

    let contactId: string | null = null
    if (email) {
      const { data: contact } = await supabase
        .from('crm_contacts')
        .select('id')
        .eq('email', String(email).toLowerCase().trim())
        .maybeSingle()
      contactId = contact?.id ?? null
    }

    const cartSubtotal = validatedItems.reduce(
      (sum: number, i: { price: number; quantity: number }) => sum + i.price * i.quantity,
      0
    )
    const subtotalCents = Math.round(cartSubtotal * 100)

    // Promo code: validate via the same RPC, but apply the discount directly
    // to the PaymentIntent amount — no Stripe coupon in the Elements flow.
    let discountCents = 0
    let appliedCodeId: string | null = null
    let appliedCodeText: string | null = null
    if (promoCode && typeof promoCode === 'string') {
      const validation = await validateDiscountCode(
        promoCode,
        { contactId, email, cartId, cartSubtotal }
      )
      if (!validation.ok) {
        return jsonError(promoReasonMessage(validation.reason), 400, validation.reason)
      }
      discountCents = Math.min(validation.amountOffCents, subtotalCents)
      appliedCodeId = validation.code.id || null
      appliedCodeText = validation.code.code
    }

    // Sales tax from settings: flat tax_rate_pct on the discounted merchandise
    // subtotal. Fail-soft — an unreadable setting must never block checkout.
    let taxCents = 0
    try {
      const settings = await getSiteSettings()
      const taxRatePct = Number(settings.tax_rate_pct)
      if (settings.tax_enabled === true && Number.isFinite(taxRatePct) && taxRatePct > 0) {
        const computed = Math.round(
          Math.max(0, subtotalCents - discountCents) * (taxRatePct / 100)
        )
        if (Number.isFinite(computed) && computed > 0) taxCents = computed
      }
    } catch (err) {
      console.error('Tax calculation skipped:', err)
    }

    const totalCents = Math.max(0, subtotalCents - discountCents) + surchargeCents + taxCents
    if (totalCents < 50) {
      // Stripe minimum charge is $0.50 — punt sub-minimum totals to express checkout.
      return jsonError(
        'Order total is below the card minimum. Please use express checkout.',
        400,
        'total_too_low',
      )
    }

    const normalizedEmail = email ? String(email).toLowerCase().trim() : ''

    const stripe = await getStripe()
    const intent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      receipt_email: normalizedEmail || undefined,
      metadata: {
        elements_checkout: '1',
        cart_id: cartId || '',
        contact_id: contactId || '',
        promo_code_id: appliedCodeId || '',
        promo_code: appliedCodeText || '',
        email: normalizedEmail,
        // Totals breakdown for the webhook's order insert (metadata = strings).
        subtotal_cents: String(subtotalCents),
        discount_cents: String(discountCents),
        surcharge_cents: String(surchargeCents),
        tax_cents: String(taxCents),
      },
    })

    // P0-3: lock the validated, server-priced line items into an immutable
    // snapshot keyed by the PaymentIntent id. The webhook builds the order from
    // THIS, not the mutable carts.items, so a cart changed after the amount is
    // locked can't alter what ships — and items are captured even when cartId is
    // null (the empty-order case). Fail-soft: a snapshot failure never blocks
    // the charge (reconciliation in the webhook still backstops).
    try {
      const svc = await createServiceClient()
      await svc.from('checkout_snapshots').insert({
        payment_ref: intent.id,
        cart_id: cartId || null,
        items: validatedItems.map((i: { productId: string; variantId?: string; variantType: string | null; fulfillmentType: string; quantity: number; price: number; title: string }) => ({
          productId: i.productId,
          variantId: i.variantId ?? null,
          variantType: i.variantType ?? null,
          fulfillmentType: i.fulfillmentType,
          quantity: i.quantity,
          price: i.price,
          title: i.title,
        })),
        subtotal_cents: subtotalCents,
        discount_cents: discountCents,
        surcharge_cents: surchargeCents,
        tax_cents: taxCents,
        email: normalizedEmail || null,
      })
    } catch (err) {
      console.error('checkout snapshot write failed (non-blocking):', err)
    }

    // Base URL for CAPI event_source_url — same normalization as /api/checkout.
    let siteUrl: string
    try {
      const raw = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
      const candidate = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : ''
      siteUrl = new URL(candidate || new URL(request.url).origin).origin
    } catch {
      siteUrl = new URL(request.url).origin
    }

    // Best-effort Meta CAPI InitiateCheckout — never fails the checkout.
    try {
      await sendServerEvent({
        event_name: 'InitiateCheckout',
        event_id: crypto.randomUUID(),
        event_time: Math.floor(Date.now() / 1000),
        user_data: normalizedEmail ? { em: hashSHA256(normalizedEmail) } : {},
        custom_data: {
          value: cartSubtotal,
          currency: 'USD',
          content_ids: validatedItems.map((i: { productId: string }) => i.productId),
          num_items: validatedItems.reduce((sum: number, i: { quantity: number }) => sum + i.quantity, 0),
        },
        event_source_url: `${siteUrl}/checkout`,
      })
    } catch (err) {
      console.error('Meta CAPI InitiateCheckout failed', err)
    }

    return Response.json({
      clientSecret: intent.client_secret,
      amountCents: totalCents,
      mode: activeMode,
      summary: {
        subtotal: subtotalCents,
        discount: discountCents,
        surcharge: surchargeCents,
        tax: taxCents,
        total: totalCents,
      },
    })
  } catch (err) {
    // Log the real detail server-side; the shopper on the money path only ever
    // sees friendly copy, never Stripe/Postgres jargon. Keep the machine code
    // for client branching + the express-checkout fallback.
    console.error('Checkout intent failed', err)
    return jsonError(
      'We could not start your checkout just now. Please try again in a moment, or use express checkout below.',
      500,
      'checkout_failed',
    )
  }
}
