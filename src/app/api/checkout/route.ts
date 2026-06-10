import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { getSiteSettings } from '@/lib/settings/accessor'
import { validateDiscountCode } from '@/lib/discounts/validate'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

function jsonError(message: string, status: number = 400, code?: string) {
  return Response.json({ error: message, code: code ?? null }, { status })
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 10, windowMs: 60_000, keyPrefix: 'checkout' })
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

    const { items, email, cartId, shippingSurchargeLabel, promoCode } = await request.json()

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

      // B-7: derive fulfillment from SERVER data, never the client. Originals
      // ship themselves; everything else follows the product's fulfillment_type.
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

    // B-5 + B-6: persist the validated line items onto the cart row and read the
    // shipping surcharge from the SERVER-set cart value (written by
    // /api/cart/shipping-quote), never the client POST body. The webhook reads
    // items back from the cart, so orders survive any cart size (Stripe metadata
    // is hard-capped at 500 chars per key) and the surcharge can't be tampered.
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
        // Persist stripe_coupon_id back so the SAME coupon is reused next time
        // (otherwise max_redemptions:1 is bypassed by minting a fresh coupon on
        // every checkout). Must use the service client — the anon client's
        // UPDATE is silently dropped by RLS. (B-20)
        if (validation.code.id) {
          const svc = await createServiceClient()
          await svc
            .from('promo_codes')
            .update({ stripe_coupon_id: appliedCoupon.id })
            .eq('id', validation.code.id)
        }
      }
      appliedCodeId = validation.code.id || null
      appliedCodeText = validation.code.code
    }

    // Base URL for Stripe redirect/image URLs. Normalize NEXT_PUBLIC_SITE_URL
    // (tolerate a missing scheme or trailing slash); fall back to the request
    // origin when unset or unparseable — Stripe hard-rejects invalid URLs.
    let siteUrl: string
    try {
      const raw = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
      const candidate = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : ''
      siteUrl = new URL(candidate || new URL(request.url).origin).origin
    } catch {
      siteUrl = new URL(request.url).origin
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      customer_email: email || undefined,
      line_items: validatedItems.map((item) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            images: imageUrls[item.productId] ? [`${siteUrl}${imageUrls[item.productId]}`] : [],
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
        // items intentionally NOT stored here — Stripe caps metadata at 500
        // chars/key which silently truncates 4+ item carts. The webhook reads
        // items from carts.items (persisted above) instead. (B-5)
      },
      success_url: `${siteUrl}/order/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cart`,
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

    // Sales tax from settings: a flat tax_rate_pct (a percentage, e.g. 8.25)
    // applied to the discounted merchandise subtotal, added as its own line
    // item. Fail-soft — an unreadable setting must never block checkout.
    try {
      const settings = await getSiteSettings(supabase)
      const taxRatePct = Number(settings.tax_rate_pct)
      if (settings.tax_enabled === true && Number.isFinite(taxRatePct) && taxRatePct > 0) {
        const subtotalCents = Math.round(Number(cartSubtotal) * 100)
        let discountCents = 0
        if (appliedCoupon?.amount_off) {
          discountCents = appliedCoupon.amount_off
        } else if (appliedCoupon?.percent_off) {
          discountCents = Math.round(subtotalCents * (appliedCoupon.percent_off / 100))
        }
        const taxCents = Math.round(
          Math.max(0, subtotalCents - discountCents) * (taxRatePct / 100)
        )
        if (Number.isFinite(taxCents) && taxCents > 0) {
          sessionParams.line_items?.push({
            price_data: {
              currency: 'usd',
              product_data: { name: `Sales tax (${taxRatePct}%)` },
              unit_amount: taxCents,
            },
            quantity: 1,
          })
        }
      }
    } catch (err) {
      console.error('Tax line item skipped:', err)
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
        event_source_url: `${siteUrl}/checkout`,
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
