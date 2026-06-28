import { getStripe, webhookSecretFor } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { routeOrderToFulfillment } from '@/lib/fulfillment/router'
import { sendOrderConfirmation } from '@/lib/email/send'
import { sendPostPurchaseEmail } from '@/lib/email/triggers'
import { escapeHtml } from '@/lib/email/escape'
import { recordOrder } from '@/lib/crm/contacts'
import { getOrderNotificationEmail } from '@/lib/settings/accessor'
import { checkFulfillable } from '@/lib/fulfillment/fulfillability'
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

// ---------------------------------------------------------------------------
// Purchase-time fulfillment snapshot (Phase 6.1)
// ---------------------------------------------------------------------------
// We snapshot the exact print spec onto each order_items row at purchase so an
// order can be fulfilled deterministically even if the variant is later edited
// or deleted. Everything here is best-effort + null-safe: a missing master,
// medium config, or column must NEVER break order creation.

interface OiCartItem {
  productId: string
  variantId?: string | null
  quantity: number
}
interface OiMasterArtwork {
  print_storage_path: string | null
  print_status: string | null
}
interface OiProduct {
  id: string
  base_price: number
  fulfillment_type: string | null
  master_artwork?: OiMasterArtwork | OiMasterArtwork[] | null
}
interface OiVariant {
  id: string
  price: number
  variant_type: string | null
  medium: string | null
  size_label: string | null
  width_in: number | null
  height_in: number | null
  fulfillment_metadata: Record<string, unknown> | null
}
interface OiMedium {
  medium: string
  subcategory_id: number | null
  option_ids: number[] | null
  enabled: boolean
}

interface OrderItemData {
  productMap: Map<string, OiProduct>
  variantMap: Map<string, OiVariant>
  mediumMap: Map<string, OiMedium>
}

// Link a product order to a registered account by matching the buyer's email to
// a profile (profiles.id == auth.uid()), so it appears under /account/orders.
// Best-effort + null-safe — never blocks order creation.
async function resolveProfileId(supabase: SupabaseClient, email: string | null | undefined): Promise<string | null> {
  if (!email) return null
  try {
    // P0-1: case-insensitive EXACT match. The buyer email must be treated as a
    // literal, not a LIKE pattern — emails legally contain '_' and '%', which
    // ilike would treat as wildcards and could match a DIFFERENT account
    // (stamping a stranger's profile_id onto the order = PII leak). Escape the
    // LIKE metacharacters (default backslash escape) so ilike matches exactly.
    const literal = email.replace(/([\\%_])/g, '\\$1')
    const { data } = await supabase.from('profiles').select('id').ilike('email', literal).limit(1)
    return (data?.[0]?.id as string) ?? null
  } catch {
    return null
  }
}

// Batched, authoritative lookups for the order_items rows + the print snapshot.
async function loadOrderItemData(supabase: SupabaseClient, cartItems: OiCartItem[]): Promise<OrderItemData> {
  const productIds = [...new Set(cartItems.map((i) => i.productId))]
  const variantIds = cartItems.filter((i) => i.variantId).map((i) => i.variantId as string)
  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? supabase
          .from('products')
          .select('id, base_price, fulfillment_type, master_artwork:master_artworks(print_storage_path, print_status)')
          .in('id', productIds)
      : Promise.resolve({ data: [] as OiProduct[] }),
    variantIds.length
      ? supabase
          .from('product_variants')
          .select('id, price, variant_type, medium, size_label, width_in, height_in, fulfillment_metadata')
          .in('id', variantIds)
      : Promise.resolve({ data: [] as OiVariant[] }),
  ])
  const productMap = new Map(((products || []) as OiProduct[]).map((p) => [p.id, p]))
  const variantMap = new Map(((variants || []) as OiVariant[]).map((v) => [v.id, v]))

  const mediums = [...new Set(((variants || []) as OiVariant[]).map((v) => v.medium).filter(Boolean) as string[])]
  let mediumMap = new Map<string, OiMedium>()
  if (mediums.length) {
    const { data: rows } = await supabase
      .from('lumaprints_mediums')
      .select('medium, subcategory_id, option_ids, enabled')
      .in('medium', mediums)
    mediumMap = new Map(((rows || []) as OiMedium[]).map((r) => [r.medium, r]))
  }
  return { productMap, variantMap, mediumMap }
}

// Build one order_items insert row, including the print snapshot for print items.
// `id` is pre-generated so external_item_id can equal order_items.id; on a
// resumed/duplicate delivery the (order_id,product_id,variant_id) upsert ignores
// the new id and preserves the original row's snapshot.
function buildOrderItemRow(
  orderId: string,
  ci: OiCartItem,
  p: OiProduct | undefined,
  v: OiVariant | null | undefined,
  mediumMap: Map<string, OiMedium>,
): Record<string, unknown> {
  const price = v?.price ?? p?.base_price ?? 0
  const fulfillmentType = v?.variant_type === 'original' ? 'self_ship' : (p?.fulfillment_type || 'lumaprints')
  const id = crypto.randomUUID()
  const row: Record<string, unknown> = {
    id,
    order_id: orderId,
    product_id: ci.productId,
    variant_id: ci.variantId || null,
    quantity: ci.quantity,
    unit_price: price,
    fulfillment_type: fulfillmentType,
    fulfillment_status: 'pending',
  }

  const isPrint = fulfillmentType !== 'self_ship' && v?.variant_type !== 'original' && Boolean(v?.medium)
  if (isPrint && v) {
    const cfg = v.medium ? mediumMap.get(v.medium) : undefined
    const meta = (v.fulfillment_metadata || {}) as Record<string, unknown>
    const metaSub = typeof meta.lumaprints_subcategory_id === 'number' ? meta.lumaprints_subcategory_id : null
    const metaOpts = Array.isArray(meta.lumaprints_option_ids) ? (meta.lumaprints_option_ids as number[]) : []
    const masterArtwork = Array.isArray(p?.master_artwork) ? p?.master_artwork[0] : p?.master_artwork
    row.medium = v.medium
    row.size_label = v.size_label
    row.print_width_in = v.width_in
    row.print_height_in = v.height_in
    row.lumaprints_subcategory_id = cfg?.subcategory_id ?? metaSub
    row.lumaprints_option_ids = cfg?.option_ids ?? metaOpts
    row.print_storage_path = masterArtwork?.print_storage_path ?? null
    row.external_item_id = id
  }
  return row
}

// Order-time safety net: is this print item fulfillable at LumaPrints right now
// (print-ready master + configured/enabled medium + framed option)? Originals /
// self-ship are always "ok". Returns a human reason when not.
function printItemFulfillability(
  p: OiProduct | undefined,
  v: OiVariant | null | undefined,
  mediumMap: Map<string, OiMedium>,
): { ok: boolean; reason?: string } {
  const fulfillmentType = v?.variant_type === 'original' ? 'self_ship' : (p?.fulfillment_type || 'lumaprints')
  if (fulfillmentType === 'self_ship' || v?.variant_type === 'original' || !v?.medium) return { ok: true }
  const cfg = mediumMap.get(v.medium)
  const master = Array.isArray(p?.master_artwork) ? p?.master_artwork[0] : p?.master_artwork
  return checkFulfillable({
    medium: v.medium,
    subcategoryId: cfg?.subcategory_id ?? null,
    mediumEnabled: Boolean(cfg?.enabled),
    mediumOptionIds: cfg?.option_ids ?? [],
    printStatus: master?.print_status ?? null,
    printStoragePath: master?.print_storage_path ?? null,
  })
}

// Email Margaret when a PAID order has a print item that can't auto-submit, so
// nothing fails silently. No-throw — never breaks the webhook.
async function notifyOrderNeedsAttention(orderId: string, reasons: string[]): Promise<void> {
  if (reasons.length === 0) return
  try {
    const { sendEmail } = await import('@/lib/email/send')
    const { brandedShell, ctaButton } = await import('@/lib/email/shell')
    const to = (await getOrderNotificationEmail().catch(() => null)) || 'margaret117art@gmail.com'
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'
    const html = brandedShell(
      `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">An order needs a quick fix to fulfill</h2>
       <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
         Order <strong>#${escapeHtml(orderId.slice(0, 8).toUpperCase())}</strong> was paid, but a print item can't be sent to Lumaprints yet:
       </p>
       <ul style="color:#666;font-size:14px;line-height:1.7;">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
       <p style="text-align:center;color:#666;font-size:13px;line-height:1.6;">Fix the item (e.g. crop the master), then refire the order from the admin.</p>
       ${ctaButton(`${site}/admin/orders/${orderId}`, 'Open the order')}`,
      { hideUnsubscribe: true, preheader: 'A paid order needs attention to fulfill.' },
    )
    await sendEmail({ to, subject: 'Action needed: an order can’t auto-fulfill', html })
  } catch (e) {
    console.error('notifyOrderNeedsAttention failed:', e)
  }
}

// POST /api/webhooks/stripe — handle Stripe events (orders, enrollments, class bookings, refunds, disputes); webhook, signature-verified.
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
  // resume-until-items-complete, booking status-transition, enrollment onConflict), and
  // we throw on unexpected failure so Stripe retries cleanly. (review findings 1+2)
  try {
    switch (event.type) {
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.completed': {
        // async_payment_succeeded fires when a delayed-notification payment
        // finally clears; it runs the same idempotent path (the payment_status
        // gate inside skips the earlier 'unpaid' completed delivery).
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

      case 'payment_intent.succeeded': {
        // Embedded Payment Elements checkout only (metadata.elements_checkout
        // === '1', set by /api/checkout/intent). Hosted Checkout sessions also
        // emit this event — those are fulfilled via checkout.session.completed,
        // so anything else is just logged (identical to the old default branch).
        const pi = event.data.object as Stripe.PaymentIntent
        if (pi.metadata?.elements_checkout === '1') {
          await handleElementsPaymentSucceeded(supabase, event)
        } else {
          await logEvent(supabase, event)
        }
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
  // 'paid' | 'unpaid' | 'no_payment_required' — gates async (delayed) payments.
  payment_status?: string
  // Guest checkouts (no pre-filled email) land the buyer's address here, not
  // on customer_email — Stripe collects it on the hosted checkout page.
  customer_details?: { name?: string | null; email?: string | null }
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
  shipping_details?: { name?: string; address: Record<string, string> }
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
          const notifyEmail =
            (await getOrderNotificationEmail().catch(() => null)) ||
            'margaret117art@gmail.com'
          const studentHtml = brandedShell(
            `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Your spot is confirmed</h2>
             <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
               ${escapeHtml(booking.name)}, payment received. See you in class.
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
            replyTo: notifyEmail,
          })
          const adminHtml = brandedShell(
            `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">New paid class booking</h2>
             <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
               <strong>${escapeHtml(booking.name)}</strong> (${escapeHtml(booking.email)}) just paid for ${cls.title} on ${startsLabel}.
             </p>
             ${ctaButton(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'}/admin`, 'Open admin')}`,
            { hideUnsubscribe: true }
          )
          await sendEmail({
            to: notifyEmail,
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
  // G5: only fulfill a PAID session. checkout.session.completed fires
  // immediately for delayed-notification (async) payment methods with
  // payment_status='unpaid'; the real money arrives later via
  // checkout.session.async_payment_succeeded (also routed here). Never create +
  // fulfill an unpaid product order. (For card checkout this is always 'paid'.)
  if (
    session.payment_status &&
    session.payment_status !== 'paid' &&
    session.payment_status !== 'no_payment_required'
  ) {
    await logEvent(supabase, event, { kind: 'product_order_unpaid', payment_status: session.payment_status })
    return
  }

  // Resume-safe idempotency: an order only short-circuits as fully processed
  // once the count of persisted order_items equals the number of distinct line
  // items in the cart being processed. An order row with NO items, or with only
  // SOME of them (a crash mid-loop), falls through and the idempotent upsert
  // loop below re-runs — the (order_id, product_id, variant_id) unique key keeps
  // already-inserted rows a no-op, so nothing is duplicated or double-charged.
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id, total, order_items(id)')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle()

  // B-5: line items come from the cart row, not Stripe metadata (500-char cap).
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

  const existingItems = (existingOrder?.order_items as { id: string }[] | undefined) ?? []
  // Distinct (product, variant) pairs each map to exactly one order_items row
  // (the upsert key), so this is how many rows a complete order should hold.
  const expectedItemCount = new Set(
    cartItems.map((i) => `${i.productId}:${i.variantId || ''}`),
  ).size
  // Short-circuit ONLY when every expected row is already persisted. With no
  // readable cart (expectedItemCount 0) fall back to the prior "has any items"
  // guard so behaviour is unchanged for that case.
  const fullyProcessed =
    expectedItemCount > 0
      ? existingItems.length >= expectedItemCount
      : existingItems.length > 0
  if (existingOrder && fullyProcessed) {
    return // already fully processed
  }

  const discountCents = session.total_details?.amount_discount ?? 0
  const shippingCents = session.total_details?.amount_shipping ?? 0
  const taxCents = session.total_details?.amount_tax ?? 0
  const subtotalCents = session.amount_subtotal ?? ((session.amount_total || 0) + discountCents - shippingCents - taxCents)

  // Guest checkouts only carry the buyer's email on customer_details. (P0-1)
  const buyerEmail = session.customer_email || session.customer_details?.email || ''

  let orderId = existingOrder?.id ?? null
  let orderTotal = existingOrder?.total ?? (session.amount_total || 0) / 100

  if (!orderId) {
    const { data: created, error: createErr } = await supabase
      .from('orders')
      .insert({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string,
        profile_id: await resolveProfileId(supabase, buyerEmail),
        email: buyerEmail,
        status: 'processing',
        subtotal: subtotalCents / 100,
        shipping_cost: shippingCents / 100,
        tax: taxCents / 100,
        discount: discountCents / 100,
        total: (session.amount_total || 0) / 100,
        promo_code: session.metadata.promo_code || null,
        shipping_address: {
          ...(session.shipping_details?.address || {}),
          name: session.shipping_details?.name || session.customer_details?.name || '',
        },
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

  // B-7/B-8/B-9: re-derive price + fulfillment from authoritative server data in
  // batched lookups (never trust cart-stored price), and claim originals atomically.
  const { productMap, variantMap, mediumMap } = await loadOrderItemData(supabase, cartItems)

  for (const ci of cartItems) {
    const p = productMap.get(ci.productId)
    const v = ci.variantId ? variantMap.get(ci.variantId) : null

    // B-9: atomically claim a one-of-a-kind original. reserve_original clamps at
    // 0 (safe on resume) and returns false only when it was already sold out.
    if (v?.variant_type === 'original' && ci.variantId) {
      const { data: reserved } = await supabase.rpc('reserve_original', { p_variant_id: ci.variantId })
      if (reserved === false) {
        console.error(`OVERSELL: original variant ${ci.variantId} already sold (order ${orderId})`)
        await logEvent(supabase, event, { alert: 'oversell', variant_id: ci.variantId, order_id: orderId })
      }
    }

    // FIN-1: idempotent on webhook replay/resume. A duplicate
    // (order_id, product_id, variant_id) is ignored rather than inserting a
    // second item row (which would double-submit to fulfillment + skew totals).
    await supabase.from('order_items').upsert(
      buildOrderItemRow(orderId, ci, p, v, mediumMap),
      { onConflict: 'order_id,product_id,variant_id', ignoreDuplicates: true },
    )
  }

  // Mark cart converted.
  if (session.metadata.cart_id) {
    await supabase
      .from('carts')
      .update({ converted_order_id: orderId, status: 'converted' })
      .eq('id', session.metadata.cart_id)
  }

  // Order-time safety net: alert Margaret about any paid print item that can't
  // auto-submit (no print-ready master / unconfigured-disabled medium / missing
  // framed option) so nothing fails silently. The order is still created.
  {
    const attention = new Set<string>()
    for (const ci of cartItems) {
      const p = productMap.get(ci.productId)
      const v = ci.variantId ? variantMap.get(ci.variantId) : null
      const fz = printItemFulfillability(p, v, mediumMap)
      if (!fz.ok && fz.reason) attention.add(fz.reason)
    }
    if (attention.size > 0) await notifyOrderNeedsAttention(orderId as string, [...attention])
  }

  // P0-4: reconcile the persisted line items against the merchandise subtotal
  // that was priced into the charge. A mismatch means what we'd ship does NOT
  // match what the customer paid for: an empty/unreadable cart (P0-2), a cart
  // mutated after the amount was locked, or a catalog price edited between
  // checkout and this webhook. order_items.unit_price and the intent's
  // subtotal_cents are both the pre-discount catalog sum, so they must be equal.
  // Never auto-fulfill a divergent order — flag it and alert the owner instead.
  const { data: persistedItems } = await supabase
    .from('order_items')
    .select('quantity, unit_price')
    .eq('order_id', orderId as string)
  const lineSumCents = Math.round(
    (persistedItems || []).reduce(
      (s: number, r: { quantity: number; unit_price: number }) => s + Number(r.unit_price) * Number(r.quantity),
      0,
    ) * 100,
  )
  const hasItems = (persistedItems?.length ?? 0) > 0
  const reconciled = hasItems && Math.abs(lineSumCents - subtotalCents) <= 1

  if (reconciled) {
    // Route to fulfillment (idempotent — only processes pending items, and FIN-2
    // pre-claims each item to 'submitting' before the provider call so a retry
    // cannot double-submit). Runs on every delivery; it is safe to repeat.
    try {
      await routeOrderToFulfillment(orderId as string)
    } catch (err) {
      console.error('Fulfillment routing failed (will retry):', err)
    }
  } else {
    // Charged-but-divergent: do NOT submit to fulfillment. Alert the studio
    // owner with the specifics so it can be resolved manually before shipping.
    const reason = !hasItems
      ? 'This paid order has NO line items — the cart was empty or unreadable when payment completed. Do not ship; investigate before fulfilling or refunding.'
      : `Line-item total $${(lineSumCents / 100).toFixed(2)} does not match the charged merchandise subtotal $${(subtotalCents / 100).toFixed(2)} — the cart may have changed after checkout. Verify before fulfilling.`
    await notifyOrderNeedsAttention(orderId as string, [reason])
    await logEvent(supabase, event, {
      alert: 'reconciliation_failed',
      order_id: orderId,
      line_sum_cents: lineSumCents,
      subtotal_cents: subtotalCents,
      has_items: hasItems,
    })
  }

  // FIN-1: the one-shot side effects below (CRM revenue, Meta Purchase,
  // confirmation + studio-owner emails) must run at most once per order even if
  // Stripe redelivers the event or a crashed delivery is resumed. Claim them
  // with a single atomic flip of side_effects_completed_at from NULL -> now();
  // only the delivery that wins the claim proceeds. A dedicated column is used
  // rather than a status transition because orders_status_check has no
  // 'confirmed' value and status is customer-visible.
  const { data: sideEffectClaim } = await supabase
    .from('orders')
    .update({ side_effects_completed_at: new Date().toISOString() })
    .eq('id', orderId as string)
    .is('side_effects_completed_at', null)
    .select('id')
    .maybeSingle()

  if (sideEffectClaim) {
    // CRM: ensure buyer exists, bump totals, record promo redemption (the single
    // unique index makes a single-use code's second redemption a caught no-op).
    try {
      if (buyerEmail) {
        await recordOrder(
          buyerEmail,
          orderTotal,
          {
            promoCodeId: session.metadata.promo_code_id || null,
            amountOffCents: discountCents,
            orderId: orderId as string,
          },
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
        user_data: buyerEmail ? { em: hashSHA256(buyerEmail) } : {},
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

    // Confirmation email.
    if (buyerEmail) {
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

        await sendOrderConfirmation(buyerEmail, orderId as string, emailItems, orderTotal)
      } catch (err) {
        console.error('Order confirmation email failed:', err)
      }

      // Post-purchase automation (studio note / nurture). Idempotent per order
      // (dedupe_key) and no-throw — never blocks the money path. (E-4)
      await sendPostPurchaseEmail(buyerEmail, orderId as string, {
        total: orderTotal,
        contactId: session.metadata.contact_id || null,
      })
    }

    // Order notification to the studio owner (settings-driven, best-effort —
    // never blocks the money path).
    try {
      const notifyEmail = await getOrderNotificationEmail()
      if (notifyEmail) {
        const { sendEmail } = await import('@/lib/email/send')
        const { brandedShell, ctaButton } = await import('@/lib/email/shell')
        const orderLabel = String(orderId).slice(0, 8).toUpperCase()
        const totalLabel = `$${Number(orderTotal || 0).toFixed(2)}`
        const itemsCount = cartItems.reduce((sum, i) => sum + (i.quantity || 0), 0)
        const html = brandedShell(
          `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">New order #${orderLabel} — ${totalLabel}</h2>
           <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
             ${itemsCount} item${itemsCount === 1 ? '' : 's'} · total ${totalLabel}
           </p>
           ${ctaButton('https://artbyme.studio/admin/orders', 'View order')}`,
          { hideUnsubscribe: true, preheader: `New order #${orderLabel} — ${totalLabel}` }
        )
        await sendEmail({
          to: notifyEmail,
          subject: `New order #${orderLabel} — ${totalLabel}`,
          html,
          ...(buyerEmail ? { replyTo: buyerEmail } : {}),
        })
      }
    } catch (err) {
      console.error('Order notification email failed:', err)
    }
  }

  await logEvent(supabase, event, { kind: 'order', order_id: orderId })
}

// ── Embedded Payment Elements order ──────────────────────────────────────
// Mirrors the product-order branch of handleCheckoutCompleted, keyed on
// stripe_payment_intent_id instead of the checkout session id. Totals come
// from the breakdown /api/checkout/intent stored in PI metadata; shipping
// address comes from pi.shipping (collected by <AddressElement/>); items come
// from carts.items via metadata.cart_id exactly like the hosted flow (B-5).
async function handleElementsPaymentSucceeded(
  supabase: SupabaseClient,
  event: Stripe.Event,
) {
  const pi = event.data.object as Stripe.PaymentIntent
  const md = (pi.metadata || {}) as Record<string, string>

  // Resume-safe idempotency: an order only short-circuits as fully processed
  // once the count of persisted order_items equals the number of distinct line
  // items in the cart being processed. An order row with NO items, or with only
  // SOME of them (a crash mid-loop), falls through and the idempotent upsert
  // loop below re-runs — the (order_id, product_id, variant_id) unique key keeps
  // already-inserted rows a no-op, so nothing is duplicated or double-charged.
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id, total, order_items(id)')
    .eq('stripe_payment_intent_id', pi.id)
    .maybeSingle()

  // B-5: line items come from the cart row, not Stripe metadata.
  let cartItems: Array<{ productId: string; variantId?: string | null; quantity: number }> = []
  if (md.cart_id) {
    const { data: cart } = await supabase
      .from('carts')
      .select('items')
      .eq('id', md.cart_id)
      .maybeSingle()
    if (Array.isArray(cart?.items)) {
      cartItems = (cart.items as Array<{ productId: string; variantId?: string | null; quantity: number }>).filter(
        (i) => i && i.productId && i.quantity,
      )
    }
  }

  const existingItems = (existingOrder?.order_items as { id: string }[] | undefined) ?? []
  // Distinct (product, variant) pairs each map to exactly one order_items row
  // (the upsert key), so this is how many rows a complete order should hold.
  const expectedItemCount = new Set(
    cartItems.map((i) => `${i.productId}:${i.variantId || ''}`),
  ).size
  // Short-circuit ONLY when every expected row is already persisted. With no
  // readable cart (expectedItemCount 0) fall back to the prior "has any items"
  // guard so behaviour is unchanged for that case.
  const fullyProcessed =
    expectedItemCount > 0
      ? existingItems.length >= expectedItemCount
      : existingItems.length > 0
  if (existingOrder && fullyProcessed) {
    return // already fully processed
  }

  const subtotalCents = Number(md.subtotal_cents) || 0
  const discountCents = Number(md.discount_cents) || 0
  const shippingCents = Number(md.surcharge_cents) || 0
  const taxCents = Number(md.tax_cents) || 0
  const totalCents = pi.amount_received || pi.amount || 0

  // orders.email is NOT NULL — confirmPayment sets receipt_email, the intent
  // route mirrors it into metadata; a placeholder is the absolute last resort.
  let buyerEmail = pi.receipt_email || md.email || ''
  if (!buyerEmail) {
    console.error(`Elements order for ${pi.id} has no buyer email — storing placeholder`)
    buyerEmail = 'unknown@artbyme.studio'
  }

  // Same JSON shape the session branch stores — address + the ship-to name
  // (the name is a sibling of the address on the PaymentIntent's shipping).
  const piShipping = pi.shipping as { name?: string; address?: Record<string, string> } | null | undefined
  const shippingAddress = {
    ...((piShipping?.address as Record<string, string> | undefined) || {}),
    name: piShipping?.name || '',
  }

  let orderId = existingOrder?.id ?? null
  let orderTotal = existingOrder?.total ?? totalCents / 100

  if (!orderId) {
    const { data: created, error: createErr } = await supabase
      .from('orders')
      .insert({
        stripe_payment_intent_id: pi.id,
        profile_id: await resolveProfileId(supabase, buyerEmail),
        email: buyerEmail,
        status: 'processing',
        subtotal: subtotalCents / 100,
        shipping_cost: shippingCents / 100,
        tax: taxCents / 100,
        discount: discountCents / 100,
        total: totalCents / 100,
        promo_code: md.promo_code || null,
        shipping_address: shippingAddress,
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

  const { productMap, variantMap, mediumMap } = await loadOrderItemData(supabase, cartItems)

  for (const ci of cartItems) {
    const p = productMap.get(ci.productId)
    const v = ci.variantId ? variantMap.get(ci.variantId) : null

    // B-9: atomically claim a one-of-a-kind original.
    if (v?.variant_type === 'original' && ci.variantId) {
      const { data: reserved } = await supabase.rpc('reserve_original', { p_variant_id: ci.variantId })
      if (reserved === false) {
        console.error(`OVERSELL: original variant ${ci.variantId} already sold (order ${orderId})`)
        await logEvent(supabase, event, { alert: 'oversell', variant_id: ci.variantId, order_id: orderId })
      }
    }

    // FIN-1: idempotent on webhook replay/resume. A duplicate
    // (order_id, product_id, variant_id) is ignored rather than inserting a
    // second item row (which would double-submit to fulfillment + skew totals).
    await supabase.from('order_items').upsert(
      buildOrderItemRow(orderId, ci, p, v, mediumMap),
      { onConflict: 'order_id,product_id,variant_id', ignoreDuplicates: true },
    )
  }

  // Mark cart converted.
  if (md.cart_id) {
    await supabase
      .from('carts')
      .update({ converted_order_id: orderId, status: 'converted' })
      .eq('id', md.cart_id)
  }

  // Order-time safety net: alert Margaret about any paid print item that can't
  // auto-submit (no print-ready master / unconfigured-disabled medium / missing
  // framed option) so nothing fails silently. The order is still created.
  {
    const attention = new Set<string>()
    for (const ci of cartItems) {
      const p = productMap.get(ci.productId)
      const v = ci.variantId ? variantMap.get(ci.variantId) : null
      const fz = printItemFulfillability(p, v, mediumMap)
      if (!fz.ok && fz.reason) attention.add(fz.reason)
    }
    if (attention.size > 0) await notifyOrderNeedsAttention(orderId as string, [...attention])
  }

  // P0-4: reconcile the persisted line items against the merchandise subtotal
  // that was priced into the charge. A mismatch means what we'd ship does NOT
  // match what the customer paid for: an empty/unreadable cart (P0-2), a cart
  // mutated after the amount was locked, or a catalog price edited between
  // checkout and this webhook. order_items.unit_price and the intent's
  // subtotal_cents are both the pre-discount catalog sum, so they must be equal.
  // Never auto-fulfill a divergent order — flag it and alert the owner instead.
  const { data: persistedItems } = await supabase
    .from('order_items')
    .select('quantity, unit_price')
    .eq('order_id', orderId as string)
  const lineSumCents = Math.round(
    (persistedItems || []).reduce(
      (s: number, r: { quantity: number; unit_price: number }) => s + Number(r.unit_price) * Number(r.quantity),
      0,
    ) * 100,
  )
  const hasItems = (persistedItems?.length ?? 0) > 0
  const reconciled = hasItems && Math.abs(lineSumCents - subtotalCents) <= 1

  if (reconciled) {
    // Route to fulfillment (idempotent — only processes pending items, and FIN-2
    // pre-claims each item to 'submitting' before the provider call so a retry
    // cannot double-submit). Runs on every delivery; it is safe to repeat.
    try {
      await routeOrderToFulfillment(orderId as string)
    } catch (err) {
      console.error('Fulfillment routing failed (will retry):', err)
    }
  } else {
    // Charged-but-divergent: do NOT submit to fulfillment. Alert the studio
    // owner with the specifics so it can be resolved manually before shipping.
    const reason = !hasItems
      ? 'This paid order has NO line items — the cart was empty or unreadable when payment completed. Do not ship; investigate before fulfilling or refunding.'
      : `Line-item total $${(lineSumCents / 100).toFixed(2)} does not match the charged merchandise subtotal $${(subtotalCents / 100).toFixed(2)} — the cart may have changed after checkout. Verify before fulfilling.`
    await notifyOrderNeedsAttention(orderId as string, [reason])
    await logEvent(supabase, event, {
      alert: 'reconciliation_failed',
      order_id: orderId,
      line_sum_cents: lineSumCents,
      subtotal_cents: subtotalCents,
      has_items: hasItems,
    })
  }

  // FIN-1: run the one-shot side effects (CRM revenue, Meta Purchase,
  // confirmation + studio-owner emails) at most once per order, even on a
  // redelivered payment_intent.succeeded or a resumed crashed delivery. The
  // first delivery to flip side_effects_completed_at from NULL wins; the rest
  // skip. (Dedicated column, not a status transition — orders_status_check has
  // no 'confirmed' value and status is customer-visible.)
  const { data: sideEffectClaim } = await supabase
    .from('orders')
    .update({ side_effects_completed_at: new Date().toISOString() })
    .eq('id', orderId as string)
    .is('side_effects_completed_at', null)
    .select('id')
    .maybeSingle()

  if (sideEffectClaim) {
    // CRM: ensure buyer exists, bump totals, record promo redemption.
    try {
      if (buyerEmail) {
        await recordOrder(
          buyerEmail,
          orderTotal,
          {
            promoCodeId: md.promo_code_id || null,
            amountOffCents: discountCents,
            orderId: orderId as string,
          },
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
        user_data: buyerEmail ? { em: hashSHA256(buyerEmail) } : {},
        custom_data: {
          value: totalCents / 100,
          currency: 'USD',
          content_ids: cartItems.map((i) => i.productId),
        },
        event_source_url: `${process.env.NEXT_PUBLIC_SITE_URL}/order/${pi.id}`,
      })
    } catch (err) {
      console.error('Meta Purchase event failed:', err)
    }

    // Confirmation email.
    if (buyerEmail) {
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

        await sendOrderConfirmation(buyerEmail, orderId as string, emailItems, orderTotal)
      } catch (err) {
        console.error('Order confirmation email failed:', err)
      }

      // Post-purchase automation — idempotent per order, never blocks the money path.
      await sendPostPurchaseEmail(buyerEmail, orderId as string, {
        total: orderTotal,
        contactId: md.contact_id || null,
      })
    }

    // Order notification to the studio owner (best-effort).
    try {
      const notifyEmail = await getOrderNotificationEmail()
      if (notifyEmail) {
        const { sendEmail } = await import('@/lib/email/send')
        const { brandedShell, ctaButton } = await import('@/lib/email/shell')
        const orderLabel = String(orderId).slice(0, 8).toUpperCase()
        const totalLabel = `$${Number(orderTotal || 0).toFixed(2)}`
        const itemsCount = cartItems.reduce((sum, i) => sum + (i.quantity || 0), 0)
        const html = brandedShell(
          `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">New order #${orderLabel} — ${totalLabel}</h2>
           <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
             ${itemsCount} item${itemsCount === 1 ? '' : 's'} · total ${totalLabel}
           </p>
           ${ctaButton('https://artbyme.studio/admin/orders', 'View order')}`,
          { hideUnsubscribe: true, preheader: `New order #${orderLabel} — ${totalLabel}` }
        )
        await sendEmail({
          to: notifyEmail,
          subject: `New order #${orderLabel} — ${totalLabel}`,
          html,
          ...(buyerEmail ? { replyTo: buyerEmail } : {}),
        })
      }
    } catch (err) {
      console.error('Order notification email failed:', err)
    }
  }

  await logEvent(supabase, event, { kind: 'order', order_id: orderId })
}
