import { getStripe, webhookSecretFor } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { enqueueFulfillmentJob } from '@/lib/fulfillment/queue'
import { notifyOrderNeedsAttention } from '@/lib/fulfillment/alerts'
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
  title: string | null
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

// P1-1: link an order to a customer account, creating one if needed. If a
// profile already exists for the email, use it; otherwise auto-provision a
// passwordless, email-confirmed account so the buyer can sign in (via magic link
// / password reset) to track the order and keep shopping. The handle_new_user
// trigger creates the matching profiles row and back-links prior guest orders.
// Best-effort + null-safe — never blocks order creation; a failure just leaves
// the order with profile_id NULL (recoverable later on self-signup via P1-2).
async function ensureCustomerAccount(supabase: SupabaseClient, email: string | null | undefined): Promise<string | null> {
  if (!email) return null
  const norm = email.toLowerCase().trim()
  if (!norm || norm === 'unknown@artbyme.studio' || !norm.includes('@')) return null
  const existing = await resolveProfileId(supabase, norm)
  if (existing) return existing
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: norm,
      email_confirm: true,
      user_metadata: { source: 'purchase' },
    })
    if (data?.user?.id) return data.user.id
    if (error) console.error('ensureCustomerAccount createUser failed:', error.message)
  } catch (e) {
    console.error('ensureCustomerAccount threw:', e)
  }
  // Race / pre-existing auth user without a profile: re-resolve (the trigger may
  // have just created the profiles row).
  return await resolveProfileId(supabase, norm)
}

// P0-3: read the immutable purchase-time line-item snapshot for a Stripe payment
// reference (PaymentIntent id or Checkout Session id). Fail-soft: returns null
// when there is no snapshot (orders placed before snapshots existed) or the
// table is unavailable, so the caller falls back to the legacy carts.items read.
async function loadSnapshotItems(
  supabase: SupabaseClient,
  paymentRef: string,
): Promise<Array<{ productId: string; variantId?: string | null; quantity: number }> | null> {
  try {
    const { data } = await supabase
      .from('checkout_snapshots')
      .select('items')
      .eq('payment_ref', paymentRef)
      .maybeSingle()
    if (data && Array.isArray(data.items)) {
      return (data.items as Array<{ productId: string; variantId?: string | null; quantity: number }>).filter(
        (i) => i && i.productId && i.quantity,
      )
    }
    return null
  } catch {
    return null
  }
}

/** Funnel attribution locked into the checkout snapshot at purchase time. */
async function loadSnapshotFunnelId(
  supabase: SupabaseClient,
  paymentRef: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('checkout_snapshots')
      .select('funnel_id')
      .eq('payment_ref', paymentRef)
      .maybeSingle()
    return (data?.funnel_id as string | null) ?? null
  } catch {
    return null
  }
}

/**
 * Count a funnel purchase exactly once per order: only the delivery that
 * CREATES the order row calls this, so webhook replays cannot inflate the
 * counter. Best-effort analytics; never blocks the money path.
 */
async function recordFunnelPurchase(
  supabase: SupabaseClient,
  funnelId: string | null,
): Promise<void> {
  if (!funnelId) return
  const { error } = await supabase.rpc('increment_funnel_metric', {
    p_funnel_id: funnelId,
    p_metric: 'purchase',
  })
  if (error) console.error('funnel purchase attribution failed:', error)
}

/** PostgREST embed rows for the confirmation-email item list. */
interface OrderEmailItemRow {
  quantity: number
  unit_price: number
  product: { title: string | null } | Array<{ title: string | null }> | null
  variant: { name: string | null } | Array<{ name: string | null }> | null
}

/** Flatten order_items embed rows into the confirmation email's item shape. */
function toEmailItems(rows: OrderEmailItemRow[] | null) {
  return (rows || []).map((oi) => {
    const product = Array.isArray(oi.product) ? oi.product[0] : oi.product
    const variant = Array.isArray(oi.variant) ? oi.variant[0] : oi.variant
    return {
      name: product?.title || 'Artwork',
      quantity: oi.quantity,
      price: oi.unit_price * oi.quantity,
      variant: variant?.name || undefined,
    }
  })
}

/**
 * A paid order contains an original that could not be claimed (its hold lapsed
 * and someone else's purchase converted first, or a pre-hold legacy race).
 * Never fulfill it: refund the full charge, restock any of this order's
 * ALREADY-converted originals, mark the order refunded, and tell the buyer and
 * the studio owner what happened. Claims the order's one-shot side-effect slot
 * so the normal confirmation flow can never also run; idempotent across
 * webhook replays (refund uses a per-order idempotency key, restock flips hold
 * status once, and the claim is atomic).
 */
async function refundOversoldOrder(
  supabase: SupabaseClient,
  stripe: Stripe,
  event: Stripe.Event,
  opts: {
    orderId: string
    paymentRef: string
    paymentIntentId: string | null
    buyerEmail: string
    oversoldTitles: string[]
  },
): Promise<void> {
  const { orderId, paymentRef, paymentIntentId, buyerEmail, oversoldTitles } = opts

  if (paymentIntentId) {
    try {
      await stripe.refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey: `oversell-refund-${orderId}` },
      )
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code !== 'charge_already_refunded') {
        // Money must go back: surface the failure so Stripe redelivers and the
        // refund is retried rather than silently dropped.
        throw new Error(`oversell refund failed for order ${orderId}: ${(err as Error).message}`)
      }
    }
  }

  // Restock this order's other originals that DID convert; the refund returns
  // them to the storefront. Status flip is one-way, so replays are no-ops.
  await supabase.rpc('refund_original_holds', { p_payment_ref: paymentRef })

  await supabase
    .from('orders')
    .update({ status: 'refunded', updated_at: new Date().toISOString() })
    .eq('id', orderId)

  const { data: claim } = await supabase
    .from('orders')
    .update({ side_effects_completed_at: new Date().toISOString() })
    .eq('id', orderId)
    .is('side_effects_completed_at', null)
    .select('id')
    .maybeSingle()

  if (claim) {
    const titleList = oversoldTitles.length > 0 ? oversoldTitles.join(', ') : 'an original artwork'
    try {
      const { sendEmail } = await import('@/lib/email/send')
      const { brandedShell } = await import('@/lib/email/shell')
      const notifyEmail = await getOrderNotificationEmail().catch(() => null)
      if (buyerEmail) {
        const buyerHtml = brandedShell(
          `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">About your order</h2>
           <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
             ${escapeHtml(titleList)} is one of a kind, and another collector completed its purchase moments before you.
             Your payment has been refunded in full; it arrives back on your card within 5 to 10 business days.
           </p>
           <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
             Fine art prints of many pieces remain available, and Margaret would love to talk about a commission.
           </p>
           <p style="text-align:center;color:#3A7D7B;font-size:13px;line-height:1.6;">— Margaret</p>`,
          { hideUnsubscribe: true, preheader: 'Your payment has been refunded in full' },
        )
        await sendEmail({
          to: buyerEmail,
          subject: 'Your ArtByME payment has been refunded',
          html: buyerHtml,
          ...(notifyEmail ? { replyTo: notifyEmail } : {}),
        })
      }
    } catch (err) {
      console.error('Oversell buyer email failed:', err)
    }
    await notifyOrderNeedsAttention(orderId, [
      `Oversell auto-refund: ${titleList} was already sold when this payment arrived. The full charge was refunded, the buyer was emailed, and any other originals in the order were restocked. No action needed unless the refund needs review in Stripe.`,
    ])
  }

  await logEvent(supabase, event, {
    alert: 'oversell_refunded',
    order_id: orderId,
    payment_ref: paymentRef,
  })
}

// Batched, authoritative lookups for the order_items rows + the print snapshot.
async function loadOrderItemData(supabase: SupabaseClient, cartItems: OiCartItem[]): Promise<OrderItemData> {
  const productIds = [...new Set(cartItems.map((i) => i.productId))]
  const variantIds = cartItems.filter((i) => i.variantId).map((i) => i.variantId as string)
  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? supabase
          .from('products')
          .select('id, title, base_price, fulfillment_type, master_artwork:master_artworks(print_storage_path, print_status)')
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

// notifyOrderNeedsAttention now lives in '@/lib/fulfillment/alerts' (shared with
// the fulfillment router + worker).

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
        const session = event.data.object as { id: string; metadata?: { class_booking_id?: string } }
        if (session.metadata?.class_booking_id) {
          await supabase
            .from('class_bookings')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', session.metadata.class_booking_id)
            .eq('status', 'awaiting_payment')
        }
        // Release this session's original holds: the piece goes straight back
        // on sale instead of waiting out the hold TTL.
        await supabase.rpc('release_original_holds', { p_payment_ref: session.id })
        await logEvent(supabase, event)
        break
      }

      case 'payment_intent.canceled': {
        // Embedded-checkout intents hold originals under the intent id; a
        // cancellation (buyer abandoned, or the expired-holds cron) releases
        // them immediately.
        const pi = event.data.object as { id: string }
        await supabase.rpc('release_original_holds', { p_payment_ref: pi.id })
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
          await handleElementsPaymentSucceeded(supabase, stripe, event)
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
        // charge.refunded also fires for PARTIAL refunds; `refunded` is only
        // true once the charge is fully refunded. Flip the order and restock
        // its originals only then: a partial refund keeps the order live and
        // the piece sold.
        const charge = event.data.object as { payment_intent: string; refunded?: boolean }
        if (charge.payment_intent && charge.refunded === true) {
          const { data: refundedOrder } = await supabase
            .from('orders')
            .update({ status: 'refunded', updated_at: new Date().toISOString() })
            .eq('stripe_payment_intent_id', charge.payment_intent)
            .select('id, stripe_checkout_session_id')
            .maybeSingle()
          // Restock converted originals under whichever reference keyed the
          // holds (session id for hosted checkout, intent id for embedded).
          // Both calls are idempotent no-ops when nothing matches.
          await supabase.rpc('refund_original_holds', { p_payment_ref: charge.payment_intent })
          if (refundedOrder?.stripe_checkout_session_id) {
            await supabase.rpc('refund_original_holds', {
              p_payment_ref: refundedOrder.stripe_checkout_session_id,
            })
          }
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

// Exported so the reconciliation sweep (/api/cron/reconcile-orders) can replay a
// paid-but-unrecorded Checkout Session through the EXACT same idempotent path the
// live webhook uses — no duplicated order/booking/enrollment logic. Safe to call
// with a synthesized event: orders are UNIQUE on the session id, bookings
// transition awaiting_payment→paid only, and enrollments upsert on (profile,course).
export async function handleCheckoutCompleted(
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
    .select('id, total, side_effects_completed_at, order_items(id)')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle()

  // P0-3: prefer the immutable purchase-time snapshot (keyed by the session id);
  // fall back to the mutable carts.items only for orders placed before snapshots
  // existed. B-5: items never come from Stripe metadata (500-char cap).
  let cartItems: Array<{ productId: string; variantId?: string | null; quantity: number }> =
    (await loadSnapshotItems(supabase, session.id)) ?? []
  if (cartItems.length === 0 && session.metadata.cart_id) {
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
  const itemsComplete =
    expectedItemCount > 0
      ? existingItems.length >= expectedItemCount
      : existingItems.length > 0
  // P2-1: only short-circuit when the one-shot side effects (confirmation email /
  // CRM / Meta) were ALSO claimed. An order whose items were persisted by a
  // delivery that then crashed BEFORE the side-effect claim must fall through so
  // those side effects run on redelivery. The upsert loop, reconciliation, enqueue,
  // and the side_effects_completed_at claim below are all idempotent, so re-running
  // is safe and nothing is duplicated.
  const sideEffectsDone = existingOrder?.side_effects_completed_at != null
  if (existingOrder && itemsComplete && sideEffectsDone) {
    return // already fully processed (items + side effects)
  }

  const discountCents = session.total_details?.amount_discount ?? 0
  const shippingCents = session.total_details?.amount_shipping ?? 0
  const taxCents = session.total_details?.amount_tax ?? 0
  const subtotalCents = session.amount_subtotal ?? ((session.amount_total || 0) + discountCents - shippingCents - taxCents)

  // Reconcile against the merchandise subtotal locked at checkout, NOT Stripe's
  // amount_subtotal: sales tax is added as its own Stripe line item, so it inflates
  // amount_subtotal (Stripe's amount_tax stays 0) and would make every taxed order
  // look divergent and get stranded from fulfillment. The immutable checkout
  // snapshot stores the merchandise subtotal separately; prefer it, and fall back to
  // the Stripe-derived value for pre-snapshot orders (identical when tax is off).
  let reconcileTargetCents = subtotalCents
  {
    const { data: snap } = await supabase
      .from('checkout_snapshots')
      .select('subtotal_cents')
      .eq('payment_ref', session.id)
      .maybeSingle()
    if (snap && Number.isFinite(Number(snap.subtotal_cents))) {
      reconcileTargetCents = Number(snap.subtotal_cents)
    }
  }

  // Guest checkouts only carry the buyer's email on customer_details. (P0-1)
  const buyerEmail = session.customer_email || session.customer_details?.email || ''

  let orderId = existingOrder?.id ?? null
  let orderTotal = existingOrder?.total ?? (session.amount_total || 0) / 100

  if (!orderId) {
    // Funnel attribution rides the immutable snapshot; stamping it on the order
    // and counting the purchase happen ONLY on the delivery that creates the
    // row, so replays cannot double-count.
    const funnelId = await loadSnapshotFunnelId(supabase, session.id)
    const { data: created, error: createErr } = await supabase
      .from('orders')
      .insert({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string,
        profile_id: await ensureCustomerAccount(supabase, buyerEmail),
        email: buyerEmail,
        status: 'processing',
        subtotal: subtotalCents / 100,
        shipping_cost: shippingCents / 100,
        tax: taxCents / 100,
        discount: discountCents / 100,
        total: (session.amount_total || 0) / 100,
        promo_code: session.metadata.promo_code || null,
        funnel_id: funnelId,
        shipping_address: {
          ...(session.shipping_details?.address || {}),
          name: session.shipping_details?.name || session.customer_details?.name || '',
        },
      })
      .select('id, total')
      .single()

    if (!createErr && created) await recordFunnelPurchase(supabase, funnelId)

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

  const oversoldTitles: string[] = []
  for (const ci of cartItems) {
    const p = productMap.get(ci.productId)
    const v = ci.variantId ? variantMap.get(ci.variantId) : null

    // B-9: convert this session's checkout-time hold into the sale. Exactly one
    // inventory decrement per (session, variant) across replays; 'oversold'
    // means no hold survived AND no free unit remains, so this paid order must
    // be refunded, never fulfilled.
    if (v?.variant_type === 'original' && ci.variantId) {
      const { data: outcome, error: convertErr } = await supabase.rpc('convert_original_hold', {
        p_payment_ref: session.id,
        p_variant_id: ci.variantId,
      })
      if (convertErr) {
        // Claim state is unknowable: throw so Stripe redelivers and the
        // idempotent conversion re-runs, instead of guessing.
        throw new Error(`convert_original_hold failed for ${ci.variantId}: ${convertErr.message}`)
      }
      if (outcome === 'oversold') {
        console.error(`OVERSELL: original variant ${ci.variantId} already sold (order ${orderId})`)
        oversoldTitles.push(p?.title || 'Original artwork')
      }
    }

    // FIN-1: idempotent on webhook replay/resume. A duplicate
    // (order_id, product_id, variant_id) is ignored rather than inserting a
    // second item row (which would double-submit to fulfillment + skew totals).
    // P2-4: inspect the upsert error. ignoreDuplicates makes a replay a no-op, so a
    // returned error is a REAL write failure — throw (→ 500, Stripe redelivers)
    // rather than reconciling / enqueueing fulfillment / running side effects on a
    // partial item set. The resume path re-runs this loop idempotently.
    const { error: itemUpsertErr } = await supabase.from('order_items').upsert(
      buildOrderItemRow(orderId, ci, p, v, mediumMap),
      { onConflict: 'order_id,product_id,variant_id', ignoreDuplicates: true },
    )
    if (itemUpsertErr) {
      throw new Error(`order_items upsert failed for product ${ci.productId}: ${itemUpsertErr.message}`)
    }
  }

  // A paid order containing an unclaimable original never fulfills: full
  // refund, restock, buyer + owner notice, done. The cart is deliberately NOT
  // marked converted so the buyer can adjust it and check out again.
  if (oversoldTitles.length > 0) {
    await refundOversoldOrder(supabase, stripe, event, {
      orderId: orderId as string,
      paymentRef: session.id,
      paymentIntentId: (session.payment_intent as string) || null,
      buyerEmail,
      oversoldTitles,
    })
    return
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
  const reconciled = hasItems && Math.abs(lineSumCents - reconcileTargetCents) <= 1

  if (reconciled) {
    // P2-2: enqueue fulfillment instead of submitting inline. This webhook runs
    // under maxDuration=60; a synchronous LumaPrints / Printful submit here could
    // time out mid-flight and strand un-submitted prints with no recovery. The
    // fulfillment-worker cron drains the durable queue off the request path, with
    // bounded retries + a stranded-item sweep. enqueue is idempotent (one active job
    // per order via the partial unique index) and no-throw.
    await enqueueFulfillmentJob(supabase, orderId as string)
  } else {
    // Charged-but-divergent: do NOT submit to fulfillment. Alert the studio
    // owner with the specifics so it can be resolved manually before shipping.
    const reason = !hasItems
      ? 'This paid order has NO line items — the cart was empty or unreadable when payment completed. Do not ship; investigate before fulfilling or refunding.'
      : `Line-item total $${(lineSumCents / 100).toFixed(2)} does not match the charged merchandise subtotal $${(reconcileTargetCents / 100).toFixed(2)} — the cart may have changed after checkout. Verify before fulfilling.`
    await notifyOrderNeedsAttention(orderId as string, [reason])
    await logEvent(supabase, event, {
      alert: 'reconciliation_failed',
      order_id: orderId,
      line_sum_cents: lineSumCents,
      subtotal_cents: reconcileTargetCents,
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

        const emailItems = toEmailItems(orderItems as OrderEmailItemRow[] | null)

        // P1-3: the public order page works for guests (keyed by the Stripe id),
        // so it is a real "track your order" link, not a login wall.
        const orderUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'}/order/${session.id}`
        await sendOrderConfirmation(buyerEmail, orderId as string, emailItems, orderTotal, orderUrl)
      } catch (err) {
        console.error('Order confirmation email failed:', err)
      }

      // Post-purchase automation (studio note / nurture). Idempotent per order
      // (dedupe_key) and no-throw — never blocks the money path. (E-4)
      await sendPostPurchaseEmail(buyerEmail, orderId as string, {
        total: orderTotal,
        contactId: session.metadata.contact_id || null,
        orderUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'}/order/${session.id}`,
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
  stripe: Stripe,
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
    .select('id, total, side_effects_completed_at, order_items(id)')
    .eq('stripe_payment_intent_id', pi.id)
    .maybeSingle()

  // P0-3: prefer the immutable purchase-time snapshot (keyed by the PaymentIntent
  // id); fall back to the mutable carts.items only for orders placed before
  // snapshots existed. B-5: items never come from Stripe metadata.
  let cartItems: Array<{ productId: string; variantId?: string | null; quantity: number }> =
    (await loadSnapshotItems(supabase, pi.id)) ?? []
  if (cartItems.length === 0 && md.cart_id) {
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
  const itemsComplete =
    expectedItemCount > 0
      ? existingItems.length >= expectedItemCount
      : existingItems.length > 0
  // P2-1: only short-circuit when the one-shot side effects (confirmation email /
  // CRM / Meta) were ALSO claimed. An order whose items were persisted by a
  // delivery that then crashed BEFORE the side-effect claim must fall through so
  // those side effects run on redelivery. The upsert loop, reconciliation, enqueue,
  // and the side_effects_completed_at claim below are all idempotent, so re-running
  // is safe and nothing is duplicated.
  const sideEffectsDone = existingOrder?.side_effects_completed_at != null
  if (existingOrder && itemsComplete && sideEffectsDone) {
    return // already fully processed (items + side effects)
  }

  const subtotalCents = Number(md.subtotal_cents) || 0
  // The embedded (PaymentIntent) flow already reconciles against the merchandise
  // subtotal carried in metadata, so the reconciliation target is the same value.
  const reconcileTargetCents = subtotalCents
  const discountCents = Number(md.discount_cents) || 0
  const shippingCents = Number(md.surcharge_cents) || 0
  const taxCents = Number(md.tax_cents) || 0
  const totalCents = pi.amount_received || pi.amount || 0

  // P1-5: keep orders.email truthful. confirmPayment sets receipt_email and the
  // intent route mirrors it into metadata; if BOTH are somehow empty we store an
  // empty string (NOT a fake address that bounces) and alert the owner in the
  // side-effects block rather than emailing a placeholder.
  const buyerEmail = (pi.receipt_email || md.email || '').toLowerCase().trim()
  if (!buyerEmail) {
    console.error(`Elements order for ${pi.id} has no buyer email`)
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
    // Funnel attribution rides the immutable snapshot; only the creating
    // delivery stamps and counts it, so replays cannot double-count.
    const funnelId = await loadSnapshotFunnelId(supabase, pi.id)
    const { data: created, error: createErr } = await supabase
      .from('orders')
      .insert({
        stripe_payment_intent_id: pi.id,
        profile_id: await ensureCustomerAccount(supabase, buyerEmail),
        email: buyerEmail,
        status: 'processing',
        subtotal: subtotalCents / 100,
        shipping_cost: shippingCents / 100,
        tax: taxCents / 100,
        discount: discountCents / 100,
        total: totalCents / 100,
        promo_code: md.promo_code || null,
        funnel_id: funnelId,
        shipping_address: shippingAddress,
      })
      .select('id, total')
      .single()

    if (!createErr && created) await recordFunnelPurchase(supabase, funnelId)

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

  const oversoldTitles: string[] = []
  for (const ci of cartItems) {
    const p = productMap.get(ci.productId)
    const v = ci.variantId ? variantMap.get(ci.variantId) : null

    // B-9: convert this intent's checkout-time hold into the sale (exactly one
    // decrement per (intent, variant) across replays; 'oversold' means the
    // paid order must be refunded, never fulfilled).
    if (v?.variant_type === 'original' && ci.variantId) {
      const { data: outcome, error: convertErr } = await supabase.rpc('convert_original_hold', {
        p_payment_ref: pi.id,
        p_variant_id: ci.variantId,
      })
      if (convertErr) {
        throw new Error(`convert_original_hold failed for ${ci.variantId}: ${convertErr.message}`)
      }
      if (outcome === 'oversold') {
        console.error(`OVERSELL: original variant ${ci.variantId} already sold (order ${orderId})`)
        oversoldTitles.push(p?.title || 'Original artwork')
      }
    }

    // FIN-1: idempotent on webhook replay/resume. A duplicate
    // (order_id, product_id, variant_id) is ignored rather than inserting a
    // second item row (which would double-submit to fulfillment + skew totals).
    // P2-4: inspect the upsert error. ignoreDuplicates makes a replay a no-op, so a
    // returned error is a REAL write failure — throw (→ 500, Stripe redelivers)
    // rather than reconciling / enqueueing fulfillment / running side effects on a
    // partial item set. The resume path re-runs this loop idempotently.
    const { error: itemUpsertErr } = await supabase.from('order_items').upsert(
      buildOrderItemRow(orderId, ci, p, v, mediumMap),
      { onConflict: 'order_id,product_id,variant_id', ignoreDuplicates: true },
    )
    if (itemUpsertErr) {
      throw new Error(`order_items upsert failed for product ${ci.productId}: ${itemUpsertErr.message}`)
    }
  }

  // A paid order containing an unclaimable original never fulfills: full
  // refund, restock, buyer + owner notice, done. The cart is deliberately NOT
  // marked converted so the buyer can adjust it and check out again.
  if (oversoldTitles.length > 0) {
    await refundOversoldOrder(supabase, stripe, event, {
      orderId: orderId as string,
      paymentRef: pi.id,
      paymentIntentId: pi.id,
      buyerEmail,
      oversoldTitles,
    })
    return
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
  const reconciled = hasItems && Math.abs(lineSumCents - reconcileTargetCents) <= 1

  if (reconciled) {
    // P2-2: enqueue fulfillment instead of submitting inline. This webhook runs
    // under maxDuration=60; a synchronous LumaPrints / Printful submit here could
    // time out mid-flight and strand un-submitted prints with no recovery. The
    // fulfillment-worker cron drains the durable queue off the request path, with
    // bounded retries + a stranded-item sweep. enqueue is idempotent (one active job
    // per order via the partial unique index) and no-throw.
    await enqueueFulfillmentJob(supabase, orderId as string)
  } else {
    // Charged-but-divergent: do NOT submit to fulfillment. Alert the studio
    // owner with the specifics so it can be resolved manually before shipping.
    const reason = !hasItems
      ? 'This paid order has NO line items — the cart was empty or unreadable when payment completed. Do not ship; investigate before fulfilling or refunding.'
      : `Line-item total $${(lineSumCents / 100).toFixed(2)} does not match the charged merchandise subtotal $${(reconcileTargetCents / 100).toFixed(2)} — the cart may have changed after checkout. Verify before fulfilling.`
    await notifyOrderNeedsAttention(orderId as string, [reason])
    await logEvent(supabase, event, {
      alert: 'reconciliation_failed',
      order_id: orderId,
      line_sum_cents: lineSumCents,
      subtotal_cents: reconcileTargetCents,
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

        const emailItems = toEmailItems(orderItems as OrderEmailItemRow[] | null)

        // P1-3: the public order page works for guests (keyed by the PaymentIntent
        // id), so it is a real "track your order" link, not a login wall.
        const orderUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'}/order/${pi.id}`
        await sendOrderConfirmation(buyerEmail, orderId as string, emailItems, orderTotal, orderUrl)
      } catch (err) {
        console.error('Order confirmation email failed:', err)
      }

      // Post-purchase automation — idempotent per order, never blocks the money path.
      await sendPostPurchaseEmail(buyerEmail, orderId as string, {
        total: orderTotal,
        contactId: md.contact_id || null,
        orderUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'}/order/${pi.id}`,
      })
    } else {
      // P1-5: a paid order with no buyer email — no confirmation can be sent.
      // Alert the owner so they can reach the customer via Stripe.
      await notifyOrderNeedsAttention(orderId as string, [
        'This paid order has no buyer email, so no confirmation or tracking email can be sent. Contact the customer through the Stripe dashboard.',
      ])
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
