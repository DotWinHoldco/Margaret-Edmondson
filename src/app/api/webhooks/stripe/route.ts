import { getStripe, webhookSecretFor } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { routeOrderToFulfillment } from '@/lib/fulfillment/router'
import { sendOrderConfirmation } from '@/lib/email/send'
import { sendPostPurchaseEmail } from '@/lib/email/triggers'
import { recordOrder } from '@/lib/crm/contacts'
import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

export const runtime = 'nodejs'
export const maxDuration = 60

// B-3: store a PII-free summary in webhook_logs (no customer email/address).
// Best-effort + tolerant of the stripe_event_id unique index on replay.
async function logEvent(
  supabase: SupabaseClient,
  event: Stripe.Event,
  extra: Record<string, unknown> = {},
) {
  const obj = event.data.object as { id?: string; amount_total?: number }
  try {
    await supabase.from('webhook_logs').insert({
      source: 'stripe',
      event_type: event.type,
      stripe_event_id: event.id,
      payload: {
        id: event.id,
        type: event.type,
        created: event.created,
        livemode: event.livemode,
        object_id: obj?.id ?? null,
        amount_total: obj?.amount_total ?? null,
        ...extra,
      } as unknown as Record<string, unknown>,
    })
  } catch (e) {
    // unique-violation on replay is expected and harmless
    console.error('webhook_logs insert skipped:', e)
  }
}

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) {
    return Response.json({ error: 'No signature' }, { status: 400 })
  }

  // Try both webhook secrets — Stripe's test endpoint and live endpoint
  // sign with different secrets, but events land on the same URL.
  const stripe = await getStripe()
  const secrets = [webhookSecretFor('test'), webhookSecretFor('live')].filter(
    (s): s is string => !!s,
  )
  if (secrets.length === 0) {
    console.error('No STRIPE_WEBHOOK_SECRET[_TEST] configured in env')
    return Response.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }
  let event: Stripe.Event | null = null
  let lastErr: unknown = null
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, secret)
      break
    } catch (err) {
      lastErr = err
    }
  }
  if (!event) {
    console.error('Webhook signature verification failed:', lastErr)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Idempotency note: we do NOT gate on a webhook_logs marker written before
  // work (that would silently abandon a partially-processed order on retry).
  // Instead each branch is resilient + idempotent (orders UNIQUE +
  // resume-if-no-items, booking status-transition, enrollment onConflict), and
  // we throw on unexpected failure so Stripe retries cleanly. (review findings 1+2)
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(supabase, stripe, event)
        break
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        // B-11: release a held class seat when its checkout never completes.
        const session = event.data.object as { metadata?: { class_booking_id?: string } }
        if (session.metadata?.class_booking_id) {
          await supabase
            .from('class_bookings')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', session.metadata.class_booking_id)
            .eq('status', 'awaiting_payment')
        }
        await logEvent(supabase, event)
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as { id: string }
        await supabase
          .from('orders')
          .update({ status: 'failed_payment', updated_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', pi.id)
        await logEvent(supabase, event)
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as { payment_intent: string }
        if (charge.payment_intent) {
          await supabase
            .from('orders')
            .update({ status: 'refunded', updated_at: new Date().toISOString() })
            .eq('stripe_payment_intent_id', charge.payment_intent)
        }
        await logEvent(supabase, event)
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as { payment_intent: string }
        if (dispute.payment_intent) {
          await supabase
            .from('orders')
            .update({ status: 'disputed', updated_at: new Date().toISOString() })
            .eq('stripe_payment_intent_id', dispute.payment_intent)
        }
        await logEvent(supabase, event, { alert: 'chargeback_opened' })
        break
      }

      default:
        await logEvent(supabase, event)
    }
  } catch (err) {
    // Genuine processing failure: return non-2xx so Stripe retries the event.
    console.error(`Stripe webhook processing error for ${event.type}:`, err)
    return Response.json({ error: 'processing_failed' }, { status: 500 })
  }

  return Response.json({ received: true })
}

interface CheckoutSession {
  id: string
  payment_intent: string
  customer_email: string
  metadata: {
    cart_id?: string
    course_id?: string
    profile_id?: string
    class_booking_id?: string
    class_session_id?: string
    contact_id?: string
    promo_code_id?: string
    promo_code?: string
  }
  shipping_details?: { address: Record<string, string> }
  amount_total: number
  amount_subtotal?: number
  total_details?: { amount_discount?: number; amount_shipping?: number; amount_tax?: number }
}

async function handleCheckoutCompleted(
  supabase: SupabaseClient,
  stripe: Stripe,
  event: Stripe.Event,
) {
  const session = event.data.object as unknown as CheckoutSession

  // ── Class booking ─────────────────────────────────────────────────────
  if (session.metadata.class_booking_id) {
    const bookingId = session.metadata.class_booking_id
    // Only act when this actually transitions awaiting_payment -> paid, so a
    // replay/concurrent delivery does not re-send the confirmation emails.
    const { data: booking } = await supabase
      .from('class_bookings')
      .update({
        status: 'paid',
        payment_method: 'stripe',
        payment_received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('status', 'awaiting_payment')
      .select('id, session_id, name, email')
      .maybeSingle()

    if (booking) {
      const { data: cls } = await supabase
        .from('class_sessions')
        .select('title, starts_at, location_name, location_address, slug')
        .eq('id', booking.session_id)
        .single()
      if (cls) {
        const startsLabel = new Date(cls.starts_at).toLocaleString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
        })
        try {
          const { sendEmail } = await import('@/lib/email/send')
          const { brandedShell, ctaButton } = await import('@/lib/email/shell')
          const studentHtml = brandedShell(
            `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Your spot is confirmed</h2>
             <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
               ${booking.name}, payment received. See you in class.
             </p>
             <div style="background:white;border:1px solid #e5e0d8;border-radius:8px;padding:20px;margin:20px 0;">
               <p style="margin:0 0 6px;"><strong>When:</strong> ${startsLabel}</p>
               <p style="margin:0;"><strong>Where:</strong> ${cls.location_name}, ${cls.location_address}</p>
             </div>
             <p style="text-align:center;color:#666;font-size:13px;line-height:1.6;">
               If you haven't already, reply to this email with a photo of your pet.
             </p>
             <p style="text-align:center;color:#3A7D7B;font-size:13px;line-height:1.6;">— Margaret</p>`,
            { hideUnsubscribe: true, preheader: `${cls.title} on ${startsLabel}` }
          )
          await sendEmail({
            to: booking.email,
            subject: `You are confirmed for ${cls.title}`,
            html: studentHtml,
            replyTo: 'margaret117art@gmail.com',
          })
          const adminHtml = brandedShell(
            `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">New paid class booking</h2>
             <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
               <strong>${booking.name}</strong> (${booking.email}) just paid for ${cls.title} on ${startsLabel}.
             </p>
             ${ctaButton(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'}/admin`, 'Open admin')}`,
            { hideUnsubscribe: true }
          )
          await sendEmail({
            to: 'margaret117art@gmail.com',
            subject: `New paid class booking — ${cls.title}`,
            html: adminHtml,
            replyTo: booking.email,
          })
        } catch (e) {
          console.error('Class booking email failed:', e)
        }
      }
    }
    await logEvent(supabase, event, { kind: 'class_booking' })
    return
  }

  // ── Course enrollment ─────────────────────────────────────────────────
  if (session.metadata.course_id && session.metadata.profile_id) {
    // Idempotent: the existing unique(profile_id, course_id) makes a replay or a
    // concurrent delivery a no-op (a user can only enroll in a course once).
    const { error: enrollError } = await supabase
      .from('enrollments')
      .upsert(
        {
          profile_id: session.metadata.profile_id,
          course_id: session.metadata.course_id,
          status: 'active',
          stripe_checkout_session_id: session.id,
        },
        { onConflict: 'profile_id,course_id', ignoreDuplicates: true },
      )
    if (enrollError) {
      console.error('Course enrollment error:', enrollError)
      throw new Error(`enrollment failed: ${enrollError.message}`)
    }
    await logEvent(supabase, event, { kind: 'enrollment' })
    return
  }

  // ── Product order ─────────────────────────────────────────────────────
  // Resume-safe idempotency: fully-processed orders (row + items) short-circuit;
  // an order row that exists with NO items (a prior crash) is resumed.
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id, total, order_items(id)')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle()

  const existingItems = (existingOrder?.order_items as { id: string }[] | undefined) ?? []
  if (existingOrder && existingItems.length > 0) {
    return // already fully processed
  }

  const discountCents = session.total_details?.amount_discount ?? 0
  const shippingCents = session.total_details?.amount_shipping ?? 0
  const taxCents = session.total_details?.amount_tax ?? 0
  const subtotalCents = session.amount_subtotal ?? ((session.amount_total || 0) + discountCents - shippingCents - taxCents)

  let orderId = existingOrder?.id ?? null
  let orderTotal = existingOrder?.total ?? (session.amount_total || 0) / 100

  if (!orderId) {
    const { data: created, error: createErr } = await supabase
      .from('orders')
      .insert({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string,
        email: session.customer_email,
        status: 'processing',
        subtotal: subtotalCents / 100,
        shipping_cost: shippingCents / 100,
        tax: taxCents / 100,
        discount: discountCents / 100,
        total: (session.amount_total || 0) / 100,
        promo_code: session.metadata.promo_code || null,
        shipping_address: session.shipping_details?.address || {},
      })
      .select('id, total')
      .single()

    if (createErr) {
      // 23505 = a concurrent delivery already created this order. Let that
      // delivery own item creation; we ack. Any other error → retry (throw).
      if ((createErr as { code?: string }).code === '23505') {
        await logEvent(supabase, event, { kind: 'order', note: 'concurrent_duplicate' })
        return
      }
      throw new Error(`order insert failed: ${createErr.message}`)
    }
    orderId = created.id
    orderTotal = created.total
  }

  // B-5: line items come from the cart row, not Stripe metadata (500-char cap).
  // B-7/B-8/B-9: re-derive price + fulfillment from authoritative server data in
  // batched lookups (never trust cart-stored price), and claim originals atomically.
  let cartItems: Array<{ productId: string; variantId?: string | null; quantity: number }> = []
  if (session.metadata.cart_id) {
    const { data: cart } = await supabase
      .from('carts')
      .select('items')
      .eq('id', session.metadata.cart_id)
      .maybeSingle()
    if (Array.isArray(cart?.items)) {
      cartItems = (cart.items as Array<{ productId: string; variantId?: string | null; quantity: number }>).filter(
        (i) => i && i.productId && i.quantity,
      )
    }
  }

  const productIds = [...new Set(cartItems.map((i) => i.productId))]
  const variantIds = cartItems.filter((i) => i.variantId).map((i) => i.variantId as string)
  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? supabase.from('products').select('id, base_price, fulfillment_type').in('id', productIds)
      : Promise.resolve({ data: [] as Array<{ id: string; base_price: number; fulfillment_type: string | null }> }),
    variantIds.length
      ? supabase.from('product_variants').select('id, price, variant_type').in('id', variantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; price: number; variant_type: string | null }> }),
  ])
  const productMap = new Map((products || []).map((p) => [p.id, p]))
  const variantMap = new Map((variants || []).map((v) => [v.id, v]))

  for (const ci of cartItems) {
    const p = productMap.get(ci.productId)
    const v = ci.variantId ? variantMap.get(ci.variantId) : null
    const price = v?.price ?? p?.base_price ?? 0
    const fulfillmentType = v?.variant_type === 'original' ? 'self_ship' : (p?.fulfillment_type || 'lumaprints')

    // B-9: atomically claim a one-of-a-kind original. reserve_original clamps at
    // 0 (safe on resume) and returns false only when it was already sold out.
    if (v?.variant_type === 'original' && ci.variantId) {
      const { data: reserved } = await supabase.rpc('reserve_original', { p_variant_id: ci.variantId })
      if (reserved === false) {
        console.error(`OVERSELL: original variant ${ci.variantId} already sold (order ${orderId})`)
        await logEvent(supabase, event, { alert: 'oversell', variant_id: ci.variantId, order_id: orderId })
      }
    }

    await supabase.from('order_items').insert({
      order_id: orderId,
      product_id: ci.productId,
      variant_id: ci.variantId || null,
      quantity: ci.quantity,
      unit_price: price,
      fulfillment_type: fulfillmentType,
      fulfillment_status: 'pending',
    })
  }

  // Mark cart converted.
  if (session.metadata.cart_id) {
    await supabase
      .from('carts')
      .update({ converted_order_id: orderId, status: 'converted' })
      .eq('id', session.metadata.cart_id)
  }

  // CRM: ensure buyer exists, bump totals, record promo redemption (the single
  // unique index makes a single-use code's second redemption a caught no-op).
  try {
    if (session.customer_email) {
      await recordOrder(
        session.customer_email,
        orderTotal,
        {
          promoCodeId: session.metadata.promo_code_id || null,
          amountOffCents: discountCents,
          orderId: orderId as string,
        },
        supabase,
      )
    }
  } catch (err) {
    console.error('Buyer CRM update failed:', err)
  }

  // Meta CAPI Purchase.
  try {
    await sendServerEvent({
      event_name: 'Purchase',
      event_id: crypto.randomUUID(),
      event_time: Math.floor(event.created || Date.now() / 1000),
      user_data: { em: hashSHA256(session.customer_email) },
      custom_data: {
        value: (session.amount_total || 0) / 100,
        currency: 'USD',
        content_ids: cartItems.map((i) => i.productId),
      },
      event_source_url: `${process.env.NEXT_PUBLIC_SITE_URL}/order/${session.id}`,
    })
  } catch (err) {
    console.error('Meta Purchase event failed:', err)
  }

  // Route to fulfillment (idempotent — only processes pending items).
  try {
    await routeOrderToFulfillment(orderId as string)
  } catch (err) {
    console.error('Fulfillment routing failed (will retry):', err)
  }

  // Confirmation email.
  if (session.customer_email) {
    try {
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('quantity, unit_price, product:products(title), variant:product_variants(name)')
        .eq('order_id', orderId)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emailItems = (orderItems || []).map((oi: any) => ({
        name: Array.isArray(oi.product) ? oi.product[0]?.title : oi.product?.title || 'Artwork',
        quantity: oi.quantity,
        price: oi.unit_price * oi.quantity,
        variant: Array.isArray(oi.variant) ? oi.variant[0]?.name : oi.variant?.name || undefined,
      }))

      await sendOrderConfirmation(session.customer_email, orderId as string, emailItems, orderTotal)
    } catch (err) {
      console.error('Order confirmation email failed:', err)
    }

    // Post-purchase automation (studio note / nurture). Idempotent per order
    // (dedupe_key) and no-throw — never blocks the money path. (E-4)
    await sendPostPurchaseEmail(session.customer_email, orderId as string, {
      total: orderTotal,
      contactId: session.metadata.contact_id || null,
    })
  }

  await logEvent(supabase, event, { kind: 'order', order_id: orderId })
}
