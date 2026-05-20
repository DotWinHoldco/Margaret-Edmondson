import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { validateDiscountCode } from '@/lib/discounts/validate'

function jsonError(message: string, status: number = 400, code?: string) {
  return Response.json({ error: message, code: code ?? null }, { status })
}

export async function POST(request: Request) {
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

    const { items, email, cartId, shippingSurcharge, shippingSurchargeLabel, promoCode } = await request.json()

    if (!items?.length) {
      return jsonError('No items provided', 400, 'empty_cart')
    }

    const supabase = await createClient()

    // Validate prices server-side — NEVER trust client prices.
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
        }
      }

      validatedItems.push({
        ...item,
        title: product.title + variantName,
        price,
        fulfillmentType: item.fulfillmentType || (item.variantType === 'original' ? 'self_ship' : 'lumaprints'),
      })
    }

    const imageUrls: Record<string, string> = {}
    for (const item of validatedItems) {
      const { data: img } = await supabase
        .from('product_images')
        .select('url')
        .eq('product_id', item.productId)
        .eq('is_primary', true)
        .single()
      if (img) imageUrls[item.productId] = img.url
    }

    const surchargeCents = typeof shippingSurcharge === 'number' && shippingSurcharge > 0
      ? Math.round(shippingSurcharge * 100)
      : 0

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

    // Promo code application via a one-shot Stripe coupon.
    let appliedCoupon: Stripe.Coupon | null = null
    let appliedCodeId: string | null = null
    let appliedCodeText: string | null = null
    if (promoCode && typeof promoCode === 'string') {
      const validation = await validateDiscountCode(
        promoCode,
        { contactId, email, cartId, cartSubtotal },
        supabase
      )
      if (!validation.ok) {
        return jsonError(`Promo code: ${validation.reason}`, 400, validation.reason)
      }

      const stripe = await getStripe()
      const stripeCouponId = validation.code.stripe_coupon_id
      if (stripeCouponId) {
        try {
          appliedCoupon = await stripe.coupons.retrieve(stripeCouponId)
        } catch {
          appliedCoupon = null
        }
      }
      if (!appliedCoupon || !appliedCoupon.valid) {
        appliedCoupon = await stripe.coupons.create({
          ...validation.stripeCoupon,
          name: `ArtByME ${validation.code.code}`,
          max_redemptions: 1,
        })
        // Only persist stripe_coupon_id back when we know the real
        // promo_codes row id. Anon-validated codes return a minimal
        // stub with id='' because anon can't SELECT promo_codes.
        if (validation.code.id) {
          await supabase
            .from('promo_codes')
            .update({ stripe_coupon_id: appliedCoupon.id })
            .eq('id', validation.code.id)
        }
      }
      appliedCodeId = validation.code.id || null
      appliedCodeText = validation.code.code
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      customer_email: email || undefined,
      line_items: validatedItems.map((item) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            images: imageUrls[item.productId] ? [`${process.env.NEXT_PUBLIC_SITE_URL}${imageUrls[item.productId]}`] : [],
            metadata: { product_id: item.productId, variant_id: item.variantId || '' },
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      metadata: {
        cart_id: cartId || '',
        contact_id: contactId || '',
        promo_code_id: appliedCodeId || '',
        promo_code: appliedCodeText || '',
        items_json: JSON.stringify(validatedItems.map((i: { productId: string; variantId?: string; fulfillmentType: string; quantity: number }) => ({
          productId: i.productId,
          variantId: i.variantId,
          fulfillmentType: i.fulfillmentType,
          quantity: i.quantity,
        }))),
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/order/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cart`,
    }

    if (surchargeCents > 0) {
      sessionParams.shipping_options = [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: surchargeCents, currency: 'usd' },
          display_name: shippingSurchargeLabel || 'Outside contiguous US shipping surcharge',
        },
      }]
    }

    if (appliedCoupon) {
      sessionParams.discounts = [{ coupon: appliedCoupon.id }]
    }

    const session = await (await getStripe()).checkout.sessions.create(sessionParams)

    // Best-effort Meta CAPI InitiateCheckout — never fails the
    // checkout if Meta misbehaves.
    try {
      await sendServerEvent({
        event_name: 'InitiateCheckout',
        event_id: crypto.randomUUID(),
        event_time: Math.floor(Date.now() / 1000),
        user_data: email ? { em: hashSHA256(email) } : {},
        custom_data: {
          value: cartSubtotal,
          currency: 'USD',
          content_ids: validatedItems.map((i: { productId: string }) => i.productId),
          num_items: validatedItems.reduce((sum: number, i: { quantity: number }) => sum + i.quantity, 0),
        },
        event_source_url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout`,
      })
    } catch (err) {
      console.error('Meta CAPI InitiateCheckout failed', err)
    }

    return Response.json({ url: session.url })
  } catch (err) {
    console.error('Checkout failed', err)
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return jsonError(message, 500, 'checkout_failed')
  }
}
