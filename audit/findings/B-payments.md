# Audit B: Payments, Checkout & Fulfillment

**Scope:** cart → checkout → Stripe webhook → order → fulfillment → email
**Files read:** ~35 source files + 3 migrations
**Date:** 2026-06-07

---

## Severity Key

| Tag | Meaning |
|-----|---------|
| CRITICAL | Money does not flow / orders lost in production right now |
| HIGH | Security hole or significant data loss scenario |
| MEDIUM | Wrong behavior in normal usage; edge cases that will occur at scale |
| LOW | Correctness nuisance; degrades reliability but does not break the happy path |
| INFO | Design note; not a defect |

---

## Findings

---

### B-1: Stripe webhook uses anon Supabase client — ALL order writes silently fail

- **Severity:** CRITICAL / Correctness + Data Loss
- **Evidence:** `src/app/api/webhooks/stripe/route.ts:43`
  ```ts
  const supabase = await createClient()
  ```
  `createClient()` reads cookies; a webhook has no cookies → resolves as the anon role. Every INSERT/UPDATE that follows (orders, order_items, webhook_logs, carts, class_bookings, enrollments, inventory) is gated by RLS policies that require `is_admin_or_artist()` or have no policy at all. Result: all writes are silently rejected by Postgres, the webhook handler reaches `return Response.json({ received: true })` anyway, Stripe marks it delivered, and no retry is attempted. Confirmed by 0-row counts in orders, order_items, class_bookings, enrollments, webhook_logs.
- **Impact:** No order is ever persisted. No fulfillment fires. No confirmation email sends. No inventory decrements. No CRM attribution. The site accepts payment and does nothing else.
- **Fix:**
  1. Replace line 43 with `const supabase = createServiceClient()` (synchronous; already imported elsewhere).
  2. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel (reference doc notes it "may not be set" — verify and add if missing).
  3. Full diff:
  ```ts
  // BEFORE (line 43)
  const supabase = await createClient()
  // AFTER
  import { createServiceClient } from '@/lib/supabase/server'
  const supabase = createServiceClient()
  ```
  No other changes needed — `createServiceClient()` already exists and is used in `router.ts`.

---

### B-2: No idempotency guard — Stripe can replay webhooks and create duplicate orders

- **Severity:** CRITICAL / Correctness + Money
- **Evidence:** `src/app/api/webhooks/stripe/route.ts:173-191`
  The webhook inserts a new row into `orders` with no prior existence check. `orders.stripe_checkout_session_id` has **no UNIQUE constraint** (confirmed: no migration defines one; `grep -rn stripe_checkout_session_id supabase/` returns zero DDL hits).
  ```ts
  const { data: order } = await supabase
    .from('orders')
    .insert({ stripe_checkout_session_id: session.id, ... })
  ```
  Stripe guarantees at-least-once delivery and retries on non-2xx responses. Even with a 200 response, network timeouts during the handler can cause Stripe to fire the event twice. Two calls → two identical orders, two fulfillment dispatches, two confirmation emails, inventory decremented twice.
- **Impact:** Double-charging fulfillment (cost to Margaret), double confirmation emails to customer, inventory oversold.
- **Fix — two-part:**
  1. Add UNIQUE constraint on `orders.stripe_checkout_session_id`:
  ```sql
  -- migration: 20260608_orders_session_unique.sql
  ALTER TABLE orders
    ADD CONSTRAINT orders_stripe_checkout_session_id_key
    UNIQUE (stripe_checkout_session_id);
  ```
  2. Change the insert to upsert-or-skip at the top of the `checkout.session.completed` handler:
  ```ts
  // Check for existing order first
  const { data: existing } = await supabase
    .from('orders')
    .select('id')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle()
  if (existing) {
    console.log(`Webhook replay ignored: order already exists for session ${session.id}`)
    break
  }
  ```
  Additionally add `stripe_event_id TEXT UNIQUE` to `webhook_logs` and pre-check it at line 46 before doing any work:
  ```sql
  ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS stripe_event_id TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS webhook_logs_stripe_event_id_key
    ON webhook_logs (stripe_event_id) WHERE stripe_event_id IS NOT NULL;
  ```
  ```ts
  // At top of handler, before the switch
  const { error: dupeErr } = await supabase.from('webhook_logs').insert({
    source: 'stripe', event_type: event.type,
    stripe_event_id: event.id,
    payload: {} // store full payload separately or omit PII — see B-3
  })
  if (dupeErr?.code === '23505') {
    return Response.json({ received: true }) // already processed
  }
  ```

---

### B-3: Full Stripe event object stored verbatim in webhook_logs — PII leak

- **Severity:** HIGH / Security + Privacy (CCPA/GDPR)
- **Evidence:** `src/app/api/webhooks/stripe/route.ts:49`
  ```ts
  payload: event.data.object as unknown as Record<string, unknown>,
  ```
  `event.data.object` for `checkout.session.completed` contains `customer_email`, full `shipping_details.address` (street, city, state, zip), `customer_details.name`, and sometimes `customer_details.phone`. `webhook_logs` has no RLS policy (only service role can query it), but the raw PII is persisted indefinitely with no TTL, no masking, and no retention policy.
- **Impact:** Any Supabase service-role credential leak → full customer PII export. Violates CCPA right-to-deletion unless a deletion mechanism exists.
- **Fix:** Strip PII before storing. Replace the payload with a safe summary:
  ```ts
  const safePayload = {
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    session_id: (event.data.object as { id?: string }).id,
    amount_total: (event.data.object as { amount_total?: number }).amount_total,
  }
  await supabase.from('webhook_logs').insert({
    source: 'stripe',
    event_type: event.type,
    stripe_event_id: event.id,
    payload: safePayload,
  })
  ```
  Add a 90-day row retention policy:
  ```sql
  -- periodic cron or pg_cron
  DELETE FROM webhook_logs WHERE created_at < now() - INTERVAL '90 days';
  ```

---

### B-4: No handlers for payment_intent.payment_failed, charge.refunded, charge.dispute.created, checkout.session.expired — failed/disputed orders never update

- **Severity:** HIGH / Correctness
- **Evidence:** `src/app/api/webhooks/stripe/route.ts:52-334`
  The `switch` only handles `checkout.session.completed`. All other Stripe event types fall through to `return Response.json({ received: true })` with no processing.
- **Impact:**
  - `payment_intent.payment_failed` / `checkout.session.expired` / `checkout.session.async_payment_failed`: If a class booking was pre-inserted with status `awaiting_payment` (`src/app/api/classes/[slug]/checkout/route.ts:53`) and payment never completes, that booking slot stays in `awaiting_payment` forever, counting against capacity (B-13 below).
  - `charge.refunded`: The admin can manually set order status to `refunded` via the PATCH endpoint but Stripe-initiated refunds (from Stripe Dashboard) never update order status. CRM totals are never decremented.
  - `charge.dispute.created`: No chargebacks are tracked; Margaret has no automated alert.
- **Fix:** Add cases to the switch:
  ```ts
  case 'checkout.session.expired':
  case 'checkout.session.async_payment_failed': {
    const sess = event.data.object as { metadata?: { class_booking_id?: string } }
    if (sess.metadata?.class_booking_id) {
      await supabase.from('class_bookings')
        .update({ status: 'cancelled' })
        .eq('id', sess.metadata.class_booking_id)
        .eq('status', 'awaiting_payment')
    }
    break
  }
  case 'payment_intent.payment_failed': {
    const pi = event.data.object as { id: string }
    await supabase.from('orders')
      .update({ status: 'failed_payment' })
      .eq('stripe_payment_intent_id', pi.id)
    break
  }
  case 'charge.refunded': {
    const charge = event.data.object as { payment_intent: string }
    await supabase.from('orders')
      .update({ status: 'refunded' })
      .eq('stripe_payment_intent_id', charge.payment_intent)
    break
  }
  case 'charge.dispute.created': {
    const dispute = event.data.object as { payment_intent: string; amount: number }
    await supabase.from('orders')
      .update({ status: 'disputed' })
      .eq('stripe_payment_intent_id', dispute.payment_intent)
    // TODO: send admin alert email
    break
  }
  ```
  Also add `'failed_payment'` and `'disputed'` to the `VALID_STATUSES` array in `src/app/api/admin/orders/[id]/route.ts:3`.

---

### B-5: metadata.items_json will silently truncate for multi-item carts — orders created with empty item list

- **Severity:** HIGH / Correctness + Money
- **Evidence:** `src/app/api/checkout/route.ts:170-175`
  ```ts
  items_json: JSON.stringify(validatedItems.map((i) => ({
    productId: i.productId,
    variantId: i.variantId,
    fulfillmentType: i.fulfillmentType,
    quantity: i.quantity,
  }))),
  ```
  Stripe metadata values are **hard-capped at 500 characters per key**. A 3-item cart with UUID product/variant IDs and fulfillmentType strings already consumes ~350 chars. A 4-5 item cart crosses 500 chars. Stripe silently truncates the value at the 500-char boundary, causing `JSON.parse` in the webhook (line 166) to throw a `SyntaxError`. The catch is none — the `JSON.parse` is unwrapped — so `items` becomes `[]`, the order is created with zero items, and fulfillment never fires.
  ```ts
  // webhook line 166 — no try/catch:
  const items = session.metadata.items_json ? JSON.parse(session.metadata.items_json) : []
  ```
- **Impact:** Any cart with 4+ distinct items creates an order with no line items. Fulfillment is never routed. Confirmation email shows empty order.
- **Fix — store items in the cart row, not Stripe metadata:**
  1. In `src/app/api/checkout/route.ts`, after validating items, upsert them into the `carts` table using the service client:
  ```ts
  // After validatedItems is built, before stripe session creation
  if (cartId) {
    const svc = createServiceClient()
    await svc.from('carts').update({
      items: validatedItems.map(i => ({
        productId: i.productId, variantId: i.variantId,
        fulfillmentType: i.fulfillmentType, quantity: i.quantity,
        price: i.price,
      })),
      checkout_session_id: null, // will be set after session creation
    }).eq('id', cartId)
  }
  ```
  2. In the webhook, instead of parsing `items_json`, read from the cart:
  ```ts
  const cartId = session.metadata.cart_id
  let items = []
  if (cartId) {
    const { data: cart } = await supabase.from('carts').select('items').eq('id', cartId).single()
    items = cart?.items || []
  }
  ```
  3. Remove `items_json` from `sessionParams.metadata` entirely (keep `cart_id`, `contact_id`, `promo_code_id`, `promo_code`).
  4. As a defensive fallback, wrap the existing `JSON.parse` in a try/catch regardless:
  ```ts
  let items = []
  try {
    items = session.metadata.items_json ? JSON.parse(session.metadata.items_json) : []
  } catch (e) {
    console.error('items_json parse failed — empty order will result', e)
  }
  ```

---

### B-6: Shipping surcharge is entirely client-trusted — customer can zero it out

- **Severity:** HIGH / Money
- **Evidence:** `src/app/api/checkout/route.ts:28,87-89`
  ```ts
  const { items, email, cartId, shippingSurcharge, shippingSurchargeLabel, promoCode } = await request.json()
  const surchargeCents = typeof shippingSurcharge === 'number' && shippingSurcharge > 0
    ? Math.round(shippingSurcharge * 100)
    : 0
  ```
  The surcharge value comes entirely from the client POST body. A customer shipping to Hawaii (which can be $15-60 more) can simply POST `shippingSurcharge: 0` and pay CONUS pricing. The server does not re-derive the surcharge from the cart items and destination zip.
- **Impact:** Margaret pays the Lumaprints shipping delta out of pocket on every AK/HI/CA order submitted with a tampered surcharge.
- **Fix:** The server should re-derive the surcharge using the same logic as `src/app/api/cart/shipping-quote/route.ts`. Add a helper:
  ```ts
  // In checkout/route.ts, after validatedItems is built
  // Re-compute server-side rather than trusting client value
  // Pass the destination zip from the Stripe session — but the session
  // hasn't been created yet. Best approach: accept zip from client,
  // re-quote server-side, and only use result.
  // Alternatively: keep surcharge in carts row (set by /api/cart/shipping-quote)
  // and read it back from there, not from the POST body.
  ```
  Minimum safe approach: read the surcharge from the `carts` row (persisted by `/api/cart/shipping-quote`) rather than the POST body:
  ```ts
  let surchargeCents = 0
  if (cartId) {
    const { data: cart } = await supabase.from('carts').select('shipping_surcharge_cents').eq('id', cartId).single()
    surchargeCents = cart?.shipping_surcharge_cents ?? 0
  }
  ```
  Requires adding `shipping_surcharge_cents INT` to the `carts` table and setting it from `/api/cart/shipping-quote`.

---

### B-7: fulfillmentType falls back to client-supplied value with wrong default logic

- **Severity:** HIGH / Correctness (affects fulfillment routing)
- **Evidence:** `src/app/api/checkout/route.ts:72`
  ```ts
  fulfillmentType: item.fulfillmentType || (item.variantType === 'original' ? 'self_ship' : 'lumaprints'),
  ```
  `item.fulfillmentType` and `item.variantType` both come from the client POST body (see `src/app/(marketing)/cart/page.tsx:151-155` — neither field is sent). Because the cart page does not send `fulfillmentType` or `variantType`, both are `undefined`, so the fallback logic runs. But the fallback checks `item.variantType` (from client, absent) not the server-fetched `variant.variant_type`, so all items default to `'lumaprints'` — including originals, which should be `'self_ship'`, and Printful products, which should be `'printful'`.
  The server does fetch `product.fulfillment_type` on line 41 (`select('id, title, base_price, fulfillment_type')`) but **never uses it in the fallback**.
- **Impact:** Original artworks sent to Lumaprints (which will reject them — no print master file). Printful products also sent to Lumaprints. Fulfillment router sets `failed_validation` and admin must manually intervene on every order.
- **Fix:** Use the server-fetched `product.fulfillment_type` as the authoritative source:
  ```ts
  // Replace line 68-73:
  validatedItems.push({
    ...item,
    title: product.title + variantName,
    price,
    // Use server-side product.fulfillment_type, with variant_type override for originals
    fulfillmentType: (variant?.variant_type === 'original')
      ? 'self_ship'
      : (product.fulfillment_type || 'lumaprints'),
  })
  ```
  This requires keeping `variant` in scope (already fetched at line 52).

---

### B-8: Webhook N+1 — per-item product and variant DB queries inside a loop

- **Severity:** MEDIUM / Performance + Reliability
- **Evidence:** `src/app/api/webhooks/stripe/route.ts:194-228`
  ```ts
  for (const item of items) {
    const { data: product } = await supabase.from('products').select(...).eq('id', item.productId).single()
    // ...
    const { data: variant } = await supabase.from('product_variants').select(...).eq('id', item.variantId).single()
    // ...
    await supabase.from('order_items').insert(...)
  }
  ```
  For a 5-item order this is 10 serial DB round-trips (5 product fetches + 5 variant fetches) before any writes, each potentially 20-50ms on Supabase us-east-1. Total latency for fetch phase alone: ~500ms. Stripe webhooks time out at 30s but Vercel Serverless Functions default to 10s (hobby) or 30s (pro) — on hobby tier a large order risks timeout.
  Additionally, the prices re-fetched here are redundant; they were already fetched and validated in `checkout/route.ts` and are available in `items_json` / the cart row.
- **Impact:** Slow webhook processing; risk of Vercel timeout on large orders leading to 500 response and Stripe retry (which with B-2 unfixed creates duplicate orders).
- **Fix:** Batch the lookups before the loop:
  ```ts
  const productIds = [...new Set(items.map((i: { productId: string }) => i.productId))]
  const variantIds = items.filter((i: { variantId?: string }) => i.variantId).map((i: { variantId: string }) => i.variantId)
  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase.from('products').select('id, base_price').in('id', productIds),
    variantIds.length ? supabase.from('product_variants').select('id, price, variant_type').in('id', variantIds) : Promise.resolve({ data: [] }),
  ])
  const productMap = Object.fromEntries((products || []).map(p => [p.id, p]))
  const variantMap = Object.fromEntries((variants || []).map(v => [v.id, v]))
  ```
  Then replace the per-item queries with map lookups.

---

### B-9: Original artwork inventory decrement is not atomic — race condition allows double-sell

- **Severity:** HIGH / Correctness + Business Loss
- **Evidence:** `src/app/api/checkout/route.ts:60-62` (read-then-check) and `src/app/api/webhooks/stripe/route.ts:211-215` (blind update):
  ```ts
  // checkout: check inventory
  if (variant.variant_type === 'original' && variant.inventory_count !== null && variant.inventory_count <= 0) {
    return jsonError(...)
  }
  // ...later, webhook: decrement
  await supabase.from('product_variants').update({ inventory_count: 0 }).eq('id', item.variantId)
  ```
  Two customers can simultaneously pass the `inventory_count > 0` check in checkout (race window = time between checkout session creation and webhook processing, typically 1-5 minutes). Both pay. The webhook sets `inventory_count = 0` twice. Margaret must ship two originals that do not exist.
- **Impact:** Double-sale of a one-of-a-kind original artwork. Potentially severe customer relations and financial damage.
- **Fix:** Use a conditional UPDATE that only succeeds if inventory is still > 0:
  ```ts
  // In webhook, replace the blind update:
  const { data: decremented, error: invErr } = await supabase
    .from('product_variants')
    .update({ inventory_count: 0 })
    .eq('id', item.variantId)
    .gt('inventory_count', 0) // atomic guard
    .select('id')
    .single()
  if (!decremented) {
    // Second buyer: cancel order, issue refund via Stripe
    console.error(`OVERSELL DETECTED: variant ${item.variantId} already sold`)
    // TODO: call stripe.refunds.create({ payment_intent: session.payment_intent })
    //       and update order status to 'cancelled'
  }
  ```
  For the checkout, augment the check with a `FOR UPDATE` lock. This is not directly available via the Supabase client — use an RPC:
  ```sql
  CREATE OR REPLACE FUNCTION reserve_original(p_variant_id UUID)
  RETURNS BOOLEAN LANGUAGE plpgsql AS $$
  DECLARE v_count INT;
  BEGIN
    SELECT inventory_count INTO v_count FROM product_variants WHERE id = p_variant_id FOR UPDATE;
    IF v_count > 0 THEN
      UPDATE product_variants SET inventory_count = inventory_count - 1 WHERE id = p_variant_id;
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END;
  $$;
  ```

---

### B-10: Class booking capacity check is a TOCTOU race — class can be oversold

- **Severity:** HIGH / Correctness
- **Evidence:** `src/app/api/classes/[slug]/checkout/route.ts:39-58`
  ```ts
  const { count } = await supabase.from('class_bookings').select('id', { count: 'exact', head: true })
    .eq('session_id', session.id).in('status', ['awaiting_payment', 'paid'])
  if ((count || 0) >= session.capacity) {
    return apiError('This class is fully booked', 409, 'SOLD_OUT')
  }
  // ...
  const { error: insertErr } = await supabase.from('class_bookings').insert({ id: bookingId, status: 'awaiting_payment', ... })
  ```
  The count check and the insert are two separate operations with no lock. Two simultaneous requests on a class with 1 seat remaining both read `count = capacity - 1`, both pass the check, both insert, resulting in `count = capacity + 1`.
- **Impact:** Class is oversold. Margaret owes a spot she cannot fulfill.
- **Fix:** Use a Postgres function with `SELECT COUNT(...) FOR UPDATE` or a `WITH CHECK` constraint:
  ```sql
  CREATE OR REPLACE FUNCTION book_class_session(
    p_session_id UUID, p_booking_id UUID,
    p_name TEXT, p_email TEXT, p_phone TEXT, p_notes TEXT, p_photos JSONB
  ) RETURNS TEXT LANGUAGE plpgsql AS $$
  DECLARE
    v_capacity INT; v_count INT;
  BEGIN
    SELECT capacity INTO v_capacity FROM class_sessions WHERE id = p_session_id FOR UPDATE;
    SELECT COUNT(*) INTO v_count FROM class_bookings
      WHERE session_id = p_session_id AND status IN ('awaiting_payment','paid');
    IF v_count >= v_capacity THEN RETURN 'SOLD_OUT'; END IF;
    INSERT INTO class_bookings (id, session_id, name, email, phone, special_notes, pet_photo_urls, status)
      VALUES (p_booking_id, p_session_id, p_name, p_email, p_phone, p_notes, p_photos, 'awaiting_payment');
    RETURN 'OK';
  END;
  $$;
  ```
  Call this RPC from the checkout route instead of the separate count+insert pattern. Mirror the same fix in `src/app/api/classes/[slug]/signup/route.ts` (same race).

---

### B-11: Abandoned awaiting_payment bookings permanently hold class capacity

- **Severity:** HIGH / Business Impact
- **Evidence:** `src/app/api/classes/[slug]/checkout/route.ts:52-57` creates booking with `status: 'awaiting_payment'` before Stripe checkout. If the user abandons (closes browser, card declined), no `checkout.session.expired` handler exists (B-4). The booking status stays `awaiting_payment` indefinitely and counts against capacity in the `['awaiting_payment', 'paid']` filter.
- **Impact:** After a few abandoned checkouts a class shows as sold out even when seats remain.
- **Fix:**
  1. Implement `checkout.session.expired` handler (see B-4).
  2. Add a Vercel cron job (`/api/cron/expire-bookings`) to cancel `awaiting_payment` bookings older than 2 hours (Stripe checkout sessions expire after 24h, but shorter is safer):
  ```sql
  UPDATE class_bookings SET status = 'cancelled'
  WHERE status = 'awaiting_payment'
    AND created_at < now() - INTERVAL '2 hours';
  ```

---

### B-12: Course enrollment via webhook uses anon client — enrollment INSERT silently fails (same root as B-1, but enrollment-specific detail)

- **Severity:** CRITICAL / Correctness
- **Evidence:** `src/app/api/webhooks/stripe/route.ts:149-163`
  ```ts
  const { error: enrollError } = await supabase
    .from('enrollments')
    .insert({ profile_id: ..., course_id: ..., status: 'active', ... })
  ```
  This uses the same anon `supabase` from line 43. `enrollments` has RLS policies requiring the authenticated user's own `profile_id`. Anon insert is denied. `enrollError` is logged but the webhook returns 200 regardless — Stripe does not retry.
- **Impact:** Paid course enrollees are not enrolled. They paid but get no access.
- **Fix:** Fixed by B-1 (switch to service client). No additional change needed once the service client is in use for the whole webhook.

---

### B-13: Free course enrollment uses anon client, RLS denies INSERT

- **Severity:** HIGH / Correctness
- **Evidence:** `src/app/api/courses/[id]/enroll/route.ts:71-83`
  ```ts
  const supabase = await createClient()
  // ...
  const { data: enrollment, error: enrollError } = await supabase
    .from('enrollments').insert({ profile_id: profileId, course_id: courseId, status: 'active' })
  ```
  `createClient()` in an authenticated context works only if the user's cookie is in the request — which it should be for this route (Bearer or cookie auth is checked at lines 14-29). However, `enrollments` has the same RLS policy structure as orders: insert requires matching `profile_id`. The anon/unauthed path still fails. A logged-in user should succeed here, but the dual-auth fallback at lines 23-27 (`supabase.auth.getUser()` after `createClient()` without a cookie context in some deployment modes) may resolve as anon in edge cases.
- **Impact:** Intermittent enrollment failures for free courses.
- **Fix:** Use `createServiceClient()` for the actual insert, after verifying auth with the cookie client:
  ```ts
  const svc = createServiceClient()
  const { data: enrollment, error: enrollError } = await svc
    .from('enrollments').insert({ profile_id: profileId, course_id: courseId, status: 'active' })
    .select().single()
  ```

---

### B-14: Admin refund endpoint is UI-only status update — no Stripe refund is issued

- **Severity:** HIGH / Business + Legal
- **Evidence:** `src/app/api/admin/orders/[id]/route.ts:1-68`
  The PATCH handler accepts `{ status: 'refunded' }` and writes it to the `orders` table. It does not call `stripe.refunds.create()` or read the payment intent from the order row.
  ```ts
  // Entire PATCH handler — just a status field update, no Stripe call
  await supabase.from('orders').update({ status, updated_at: ... }).eq('id', id)
  ```
  There is no `refunds.create` anywhere in the codebase (`grep -r "refunds.create" src/` returns no matches).
- **Impact:** Admin marks order "refunded" in the UI, customer is never actually refunded. Chargebacks likely follow. Also no `charge.refunded` webhook fires (since no refund was initiated), so Stripe Dashboard and the app are inconsistent.
- **Fix:** When setting status to `'refunded'`, fetch the payment intent and issue the Stripe refund:
  ```ts
  if (status === 'refunded') {
    const { data: orderRow } = await supabase.from('orders')
      .select('stripe_payment_intent_id, total').eq('id', id).single()
    if (orderRow?.stripe_payment_intent_id) {
      const stripe = await getStripe()
      await stripe.refunds.create({
        payment_intent: orderRow.stripe_payment_intent_id,
        // amount: Math.round(orderRow.total * 100), // omit for full refund
      })
    }
  }
  ```

---

### B-15: Printful orders created in draft state — never confirmed/submitted to production

- **Severity:** HIGH / Fulfillment
- **Evidence:** `src/lib/integrations/printful.ts:30-50`
  ```ts
  return request('/orders', { method: 'POST', body: JSON.stringify(orderData) })
  ```
  Printful's `/orders` endpoint creates an order in **Draft** status by default. A separate call to `POST /orders/{id}/confirm` is required to submit it for production. No such call exists anywhere in the codebase. The `router.ts` considers the item `submitted` after the `/orders` call succeeds, but Printful is waiting for a confirmation that never comes.
- **Impact:** All Printful orders sit in Draft forever. Customer pays, order appears submitted in admin, Printful never produces or ships it.
- **Fix:** Add a confirm call in `submitToPrintful` after order creation:
  ```ts
  const created = await request('/orders', { method: 'POST', body: JSON.stringify(orderData) })
  const orderId = (created as { result?: { id: number } })?.result?.id
  if (!orderId) throw new Error('Printful order creation returned no ID')
  await request(`/orders/${orderId}/confirm`, { method: 'POST' })
  return items.map(item => ({ itemId: item.id, success: true, externalOrderId: String(orderId) }))
  ```

---

### B-16: Lumaprints options mapping is wrong — key and value are both the optionId string

- **Severity:** MEDIUM / Fulfillment correctness
- **Evidence:** `src/lib/fulfillment/router.ts:223-226`
  ```ts
  options: validated.optionIds.reduce<Record<string, string>>((acc, id) => {
    acc[String(id)] = String(id)
    return acc
  }, {}),
  ```
  This builds `{ "27": "27" }`. Lumaprints' order API expects `options` to be a map of option group ID → option value ID (or similar), not a self-mapping. The exact shape depends on the Lumaprints API spec, but mapping `id → id` is almost certainly wrong and will cause all framed canvas orders to be rejected or produce unexpected results.
- **Impact:** Framed canvas orders fail at Lumaprints or are produced without the correct frame option.
- **Fix:** Verify the Lumaprints API spec for the options field format. Based on the admin sync data in `lumaprints_mediums.option_ids`, the options likely need to be sent as an array or as `{ optionGroupId: optionValueId }`. The `submitOrder` function signature in `lumaprints.ts:103-126` takes `options: Record<string, string>` but the format needs to match Lumaprints docs. Update after checking the API reference.

---

### B-17: ShipStation integration is wired up but never called from the fulfillment router

- **Severity:** MEDIUM / Dead code / Misleading
- **Evidence:** `src/lib/integrations/shipstation.ts` exists with `getRates`, `createLabel`, `validateAddress` functions. `src/lib/fulfillment/router.ts:369-447` only handles `lumaprints`, `printful`, and `self_ship` in the switch statement — no `shipstation` case exists.
- **Impact:** If any `order_item.fulfillment_type = 'shipstation'` is ever set, the default case catches it and marks it `failed` with "Unknown fulfillment provider". ShipStation labels can never be created automatically.
- **Fix:** Either add a `shipstation` case to the router switch (using `createLabel` from the integration), or remove the ShipStation integration file if it is not intended for use. Clarify with product owner.

---

### B-18: Fulfillment submit and retry endpoints use CRON_SECRET not admin auth — callable by anyone who knows the cron secret

- **Severity:** MEDIUM / Security
- **Evidence:**
  - `src/app/api/fulfillment/submit/route.ts:9`: `if (secret !== process.env.CRON_SECRET)`
  - `src/app/api/fulfillment/retry/[itemId]/route.ts:12`: same check
  These routes can submit and retry arbitrary orders. They accept any `orderId` / `itemId` — no check that the caller has admin rights or that the order belongs to them.
- **Impact:** CRON_SECRET is typically a shared, static secret. If it leaks (logged, in error output, shared with a contractor) anyone can trigger fulfillment submission for any order ID, or retry failed items with manipulated data.
- **Fix:** Replace the cron secret check with `requireAdmin()`:
  ```ts
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  ```
  The cron secret check can remain as an _additional_ alternative for the actual cron path, but the admin check must be the primary gate for the HTTP endpoint.

---

### B-19: Promo code discount is applied to Stripe but the webhook does not re-validate discount against the actual charged amount

- **Severity:** MEDIUM / Money
- **Evidence:** The RPC `validate_promo_code_public` at checkout time validates `p_cart_subtotal`. The Stripe coupon is created and applied. In the webhook (`route.ts:168`), `discountCents` is read from `session.total_details.amount_discount`. The promo `usage_count` is incremented via `record_order_for_contact`. However:
  1. If the same promo code is validated twice in rapid succession (two tabs, two devices), both checkouts pass validation because `usage_count` is only incremented **after** the webhook fires — which is delayed minutes.
  2. For `single_use_per_contact` codes: the RPC checks `promo_code_redemptions` — but a redemption is only inserted in the webhook. Two simultaneous purchases both pass the `already_redeemed` check.
- **Impact:** Single-use codes can be redeemed multiple times in a race window.
- **Fix:** Add a pre-redemption reservation at checkout time: increment a `reserved_count` column immediately when a checkout session is created, and decrement it if the session expires. Or use a DB-level unique index on `(promo_code_id, contact_id)` for `single_use_per_contact` codes:
  ```sql
  CREATE UNIQUE INDEX promo_code_redemptions_single_use_key
    ON promo_code_redemptions (promo_code_id, contact_id)
    WHERE contact_id IS NOT NULL;
  ```
  The webhook insert would then fail with a unique-violation for the second redemption, which should be logged but not block the order (the Stripe coupon was already applied).

---

### B-20: checkout/route.ts uses anon client to UPDATE promo_codes.stripe_coupon_id — will silently fail

- **Severity:** MEDIUM / Data Integrity
- **Evidence:** `src/app/api/checkout/route.ts:139-143`
  ```ts
  await supabase
    .from('promo_codes')
    .update({ stripe_coupon_id: appliedCoupon.id })
    .eq('id', validation.code.id)
  ```
  `supabase` here is the cookie/anon client from line 34. The `promo_codes` table has no explicit UPDATE policy for anon (the reference doc notes RLS enabled; admin-only write path). This UPDATE is silently dropped by RLS. Next time the same code is validated, `stripe_coupon_id` is null, so a new Stripe coupon is created every time — accumulating orphaned coupons in Stripe and bypassing `max_redemptions: 1`.
- **Impact:** Every checkout with a promo code creates a new Stripe coupon. The `max_redemptions: 1` guard on the coupon is meaningless because a new coupon with a fresh redemption count is created on each use. Promo codes that should be single-use can be used unlimited times.
- **Fix:** Use the service client for this specific update in checkout, or add the stripe_coupon_id persistence to the webhook handler (where the service client is already used after B-1 fix):
  ```ts
  // In checkout/route.ts, use a service client just for this update:
  const svc = createServiceClient()
  await svc.from('promo_codes').update({ stripe_coupon_id: appliedCoupon.id }).eq('id', validation.code.id)
  ```

---

### B-21: No shipping address collected for digital-only / self-ship-only carts

- **Severity:** LOW / UX / Wasted data
- **Evidence:** `src/app/api/checkout/route.ts:164`
  ```ts
  shipping_address_collection: { allowed_countries: ['US', 'CA'] },
  ```
  `shipping_address_collection` is set unconditionally for every checkout session regardless of whether the items require shipping (e.g., a course enrollment that accidentally routes through this endpoint, or a future digital download product).
- **Impact:** Customers are always prompted for a shipping address even for non-physical items. Minor friction. Not blocking.
- **Fix:** Conditionally set `shipping_address_collection` only when at least one item has `fulfillmentType !== 'digital'`. Low priority.

---

### B-22: Pricing engine uses hardcoded canvas cost table that drifts from Lumaprints actual pricing

- **Severity:** LOW / Business
- **Evidence:** `src/lib/pricing/canvas-prints.ts:27-35`
  ```ts
  { size: '8×10', canvasCost: 10.99, frameCost: 28.17, defaultWorstCaseShipping: 8.5, ... },
  ```
  These costs are hardcoded in source. Lumaprints prices change. The comment says they "are overwritten the first time refresh runs against the live API" but `cost_cents` is only written to `lumaprints_pricing_cache` (not back to the variants table) and the `canvas-prints.ts` constants are still used as the fallback in `wholesale-lookup.ts` when `lumaprints_mediums` is not configured.
  The live fetch path in `lumaprints-cache.ts` actually reads costs from `lumaprints_mediums.sizes[].cost_cents` (set by the admin sync), not from the API. So if the admin hasn't run the sync, stale hardcoded costs are used.
- **Impact:** Margin calculation errors until the admin runs the Lumaprints sync. At 65% margin on an 8×10, a $1 underestimate in cost → ~$2.86 shortfall per print.
- **Fix:** Surface a prominent admin warning when `lumaprints_pricing_cache` table is empty or stale (all rows older than 7 days) on the pricing settings page. Block variant publishing until a sync has run successfully.

---

### B-23: variant-pricing.ts margin formula uses a different approach from compute.ts — inconsistency

- **Severity:** LOW / Correctness (minor)
- **Evidence:**
  - `src/lib/pricing/compute.ts:12`: `price = totalCost / (1 - marginPct)` — markup-on-cost-to-achieve-target-margin
  - `src/lib/pricing/variant-pricing.ts:28`: `Math.round(v.lumaprints_cost_cents * (1 + margin))` — simple markup
  For a 65% margin target:
  - `compute.ts`: price = cost / 0.35 = 2.857× cost
  - `variant-pricing.ts`: price = cost × 1.65 = 1.65× cost
  These produce very different prices (e.g., cost = $10.99 → compute gives $31.40, variant-pricing gives $18.13). `compute.ts` is the correct "gross margin" formula; `variant-pricing.ts` is a simple cost-plus markup.
- **Impact:** If `variant-pricing.ts` is what actually sets `product_variants.price` (via `/api/admin/variants/refresh`), prices are significantly lower than the intended margin would produce. Margaret may be selling prints at a loss or near-cost.
- **Fix:** Standardize on `compute.ts` formula in `variant-pricing.ts`:
  ```ts
  // In customerPriceCents(), replace:
  const printPrice = Math.round(v.lumaprints_cost_cents * (1 + margin))
  // With:
  const totalCostCents = v.lumaprints_cost_cents + v.shipping_cost_cents
  return Math.round(totalCostCents / (1 - margin / 100))
  // (Note: shipping is already added separately in current code — verify the intent)
  ```
  Audit all callers of both functions to ensure they use the same formula and the admin pricing refresh tool re-prices all variants after fixing.

---

### B-24: Stale Stripe mode cache can survive between hot reloads / mode changes

- **Severity:** LOW / Operational
- **Evidence:** `src/lib/stripe/index.ts:9-11`
  ```ts
  let modeCache: { ts: number; mode: StripeMode } | null = null
  let stripeCache: { mode: StripeMode; instance: Stripe } | null = null
  ```
  Module-level mutable state in a Next.js serverless environment persists across requests within a warm instance but is lost on cold starts. In Vercel's multi-instance environment, one instance may have the cached test mode while another has live mode for 10 seconds after a site_settings change. `clearStripeModeCache()` is defined but not called on settings update.
- **Impact:** After flipping from test → live mode in site_settings, the next 10 seconds of requests may still use the test Stripe key. Unlikely to cause real harm since the site is currently in test mode, but worth fixing for the live launch.
- **Fix:** Call `clearStripeModeCache()` from the admin settings update handler. Also consider reducing `MODE_CACHE_MS` to 0 (or relying on Vercel's edge config / env vars instead of a DB-backed mode toggle for security-critical configuration).

---

### B-25: No admin UI or API to trigger manual fulfillment for self_ship items

- **Severity:** MEDIUM / Operational Gap
- **Evidence:** `src/lib/fulfillment/router.ts:286-296`
  ```ts
  function submitSelfShip(items): FulfillmentResult[] {
    return items.map((item) => ({
      itemId: item.id, success: true,
      externalOrderId: `self_ship_${item.id}`,
    }))
  }
  ```
  Self-ship items are immediately marked `submitted` with a placeholder external ID. There is no admin view to see "items needing manual shipment," no way to enter a tracking number, and no way to mark them `shipped` / `delivered` without direct DB manipulation. The `order_items` table has `tracking_number`, `tracking_url`, `carrier`, `shipped_at` columns but no API endpoint or admin UI to populate them.
- **Impact:** Margaret cannot track or update self-ship (original artwork) shipments through the admin. Customers cannot get shipping updates.
- **Fix:** Add a `PATCH /api/admin/order-items/[id]` endpoint to update tracking fields, and a corresponding admin UI panel on the order detail page. At minimum, expose a textarea for tracking number entry.

---

## Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 3 | B-1, B-2, B-12 |
| HIGH | 10 | B-3, B-4, B-5, B-6, B-7, B-9, B-10, B-11, B-14, B-15 |
| MEDIUM | 7 | B-8, B-13, B-16, B-17, B-18, B-19, B-20, B-25 |
| LOW | 4 | B-21, B-22, B-23, B-24 |
| **Total** | **24** | |

*(B-25 counted in MEDIUM; B-13 counted in HIGH)*

---

## Top 15 One-Liners (priority order)

1. **CRITICAL** `webhooks/stripe/route.ts:43` — anon client used; all order/enrollment/booking writes silently denied by RLS → fix: `createServiceClient()`
2. **CRITICAL** `webhooks/stripe/route.ts:173` — no idempotency; Stripe retry creates duplicate orders (no UNIQUE on `orders.stripe_checkout_session_id`)
3. **CRITICAL** `webhooks/stripe/route.ts:150` — paid course enrollment INSERT uses anon client → enrollments never created
4. **HIGH** `checkout/route.ts:170` — `items_json` metadata hits Stripe 500-char cap for 4+ item carts → webhook gets `[]` items; order has no line items
5. **HIGH** `checkout/route.ts:72` — fulfillmentType falls back to client-supplied + wrong field; originals routed to Lumaprints instead of self_ship
6. **HIGH** `checkout/route.ts:87-88` — shipping surcharge is entirely client-trusted; post to `shippingSurcharge: 0` skips AK/HI/CA fees
7. **HIGH** `admin/orders/[id]/route.ts:1-68` — "refunded" status update writes DB only; no `stripe.refunds.create()` call — customers never actually refunded
8. **HIGH** `integrations/printful.ts:30` — Printful orders created in Draft, never confirmed; `POST /orders/{id}/confirm` never called → zero Printful items ever shipped
9. **HIGH** `webhooks/stripe/route.ts:211-215` — original inventory decrement is non-atomic; two simultaneous buyers both pass `inventory > 0` check
10. **HIGH** `classes/[slug]/checkout/route.ts:39-57` — capacity check + booking insert are two separate operations; class oversells on concurrent requests
11. **HIGH** `classes/[slug]/checkout/route.ts:53` — `awaiting_payment` bookings never expired; no `checkout.session.expired` handler → permanent phantom capacity hold
12. **HIGH** `webhooks/stripe/route.ts:49` — full Stripe event (customer email, street address) stored verbatim in `webhook_logs` — PII with no retention policy
13. **MEDIUM** `checkout/route.ts:139` — `promo_codes.stripe_coupon_id` UPDATE uses anon client → silently fails → new Stripe coupon created on every checkout → `max_redemptions:1` bypass
14. **MEDIUM** `fulfillment/router.ts:219-226` — Lumaprints option mapping is `{id: id}` self-map; likely wrong format → framed canvas orders may fail or misprint
15. **MEDIUM** `pricing/variant-pricing.ts:28` vs `pricing/compute.ts:12` — two different margin formulas; variant-pricing uses cost-plus (1+margin) not gross-margin (1/(1-margin)) → prices may be significantly below intended margin

---

## Cross-Area Notes

- **Agent A (auth/security):** B-1 and B-12 are the direct consequence of the confirmed anon-webhook finding. Once fixed with `createServiceClient()`, also verify that `createServiceClient()` itself calls `createClient(url, key)` with the service role key (not the anon key) — see `src/lib/supabase/server.ts`.
- **Agent A:** The `record_order_for_contact` RPC is `SECURITY DEFINER` callable by `anon` — this means any anon caller can artificially inflate `usage_count` on any promo code by fabricating orders. Consider restricting to `service_role` only (the webhook, which will use service client after B-1 fix, can call it).
- **Agent C/D (classes, courses):** B-10 and B-11 are capacity enforcement failures in the classes flow. B-13 is a free course enrollment failure.
- **Fulfillment completeness:** ShipStation (B-17) is wired at the integration level but has no router case — it is dead integration code. Printful (B-15) has a router case but the Draft→Confirm step is absent. Lumaprints is the most complete provider but B-16 (options format) may cause silent rejects.
- **No refund/cancel lifecycle:** There is no `stripe.refunds.create` anywhere in the codebase. The admin can set status to "refunded" in the UI but this is purely cosmetic. Issuing actual refunds requires Stripe Dashboard access.
