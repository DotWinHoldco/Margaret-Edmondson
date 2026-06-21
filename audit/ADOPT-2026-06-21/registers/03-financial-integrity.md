# 03 — Financial Integrity Register (ADOPT 2026-06-21)

**Scope (phase 5):** money path `checkout -> payment -> webhook -> order -> fulfillment`.
**Method:** READ-ONLY. Each prior `audit/findings/B-payments.md` (2026-06-07) claim verified against CURRENT code; fixed vs open noted.
**Stack:** Next.js 16.2 App Router, Supabase `@supabase/ssr` (`createServiceClient` = service role, bypasses RLS), Stripe (Hosted Checkout + embedded Payment Elements), fulfillment via LumaPrints / Printful / ShipStation.

## Posture summary

The money path has been substantially hardened since the stale B-payments audit. The webhook now
uses `createServiceClient()` (B-1 fixed), `orders.stripe_checkout_session_id` has a UNIQUE constraint,
the handler is resume-safe-idempotent, and prices + fulfillment_type + shipping surcharge are all
re-derived from authoritative DB/cart data (client price/qty/surcharge can no longer alter the charge).
Atomic `reserve_original` (FOR UPDATE) and `book_class_session` RPCs close the original/class oversell
TOCTOU races. Stripe idempotency is **adequate** for the order/enrollment/class paths.

Remaining gaps cluster around **fulfillment dedup** (no provider-order-id uniqueness; a retry/re-run of
`routeOrderToFulfillment` can re-submit a still-`pending` item if the provider succeeded but the local
status write was lost) and **side-effect idempotency for the order path** (confirmation email, owner
notification, Meta CAPI, CRM totals can fire more than once across a resumed/concurrent delivery because
the short-circuit guard keys on "order has >=1 item" and the per-item insert is not itself deduped).

## Severity counts

P0: 1 (FIN-1b) · P1: 3 (FIN-1, FIN-2, FIN-3) · P2: 5 (FIN-4..FIN-8) · P3: 2 (FIN-9, FIN-10)

## Money-path control matrix

| Control | Result | Note |
|---|---|---|
| Webhook idempotency (no dup order / dup enroll / dup booking) | **Partial** | Hosted-Checkout path: Pass (UNIQUE session_id + resume-safe). Embedded Elements path: **Fail** — no UNIQUE on `stripe_payment_intent_id` (FIN-1b). Plus side-effect re-run on resume (FIN-1). |
| Amount / total integrity (server-derived cents, no client price) | **Pass** | checkout re-derives price+fulfillment+surcharge from DB/cart; webhook re-derives unit_price from DB |
| Capability token (order confirmation by session id) | **Pass** | service-client read scoped to the row matched by Stripe session/PI id (unguessable `cs_*`/`pi_*`); no enumerable id, minimal columns |
| Fulfillment dedup (no dup provider submission) | **Partial** | provider call is keyed off item `fulfillment_status='pending'`; status→`submitted` write happens AFTER the provider call, so a lost/crashed write or retry re-submits to the provider. No provider-order-id uniqueness or pre-claim. |
| Reconciliation (payment<->order<->fulfillment, failure states) | **Partial** | failure states exist (`failed`/`failed_validation`), inbound provider webhooks set shipped/delivered, but no money reconciliation job (order total vs Stripe), and provider→pending revert on `order_failed` re-arms the resubmit race |
| Refund / cancel path | **Pass** | admin PATCH issues real `stripe.refunds.create` and refuses to flip status if the refund call fails; `charge.refunded`/`charge.dispute.created` webhook cases update order status |

## Prior-audit reconciliation (B-payments.md, 2026-06-07)

| Prior | Status now | Evidence |
|---|---|---|
| B-1 anon webhook client | **FIXED** | `webhooks/stripe/route.ts:79` `createServiceClient()` |
| B-2 no idempotency / no UNIQUE | **FIXED** | `orders_stripe_checkout_session_id_key` UNIQUE (`2026060801`); resume-safe handler `route.ts:303-355` |
| B-3 PII in webhook_logs | **FIXED** | `logEvent()` stores PII-free summary `route.ts:18-43` |
| B-4 missing failed/refund/dispute/expired handlers | **FIXED** | cases at `route.ts:93-154` |
| B-5 items_json 500-char truncation | **FIXED** | items read from `carts.items`; not stored in metadata (`checkout/route.ts:99-127,222-225`) |
| B-6 client-trusted surcharge | **FIXED** | surcharge read from `carts.shipping_surcharge_cents` server value (`checkout/route.ts:104-127`) |
| B-7 client fulfillmentType fallback | **FIXED** | derived from server `product.fulfillment_type` (`checkout/route.ts:74-77`, webhook `route.ts:391`) |
| B-8 webhook N+1 | **FIXED** | batched `.in()` lookups (`route.ts:374-385`) |
| B-9 non-atomic original decrement | **FIXED** | `reserve_original` FOR UPDATE RPC (`2026060806`), called `route.ts:396` |
| B-10 class capacity TOCTOU | **FIXED** | `book_class_session` FOR UPDATE RPC; called `classes/[slug]/checkout/route.ts:43` |
| B-11 abandoned awaiting_payment | **FIXED** | `checkout.session.expired` handler cancels held booking `route.ts:93-106` |
| B-12 / B-13 enrollment anon insert | **FIXED** | service client + `upsert onConflict profile_id,course_id` `route.ts:281-291` |
| B-14 refund is DB-only | **FIXED** | real `stripe.refunds.create` + 502 on failure `admin/orders/[id]/route.ts:59-81` |
| B-15 Printful draft never confirmed | **FIXED (caveat)** | `confirmOrder` called `router.ts:288-294` — but see FIN-5 (externalId truthiness) |
| B-16 Lumaprints `{id:id}` options | **FIXED (verify)** | now sends `optionIds` array `router.ts:231`; doc-verify vs live API still flagged in-code |
| B-17 ShipStation no router case | **OPEN (by design)** | router has no `shipstation` case; inbound webhook only matches `self_ship`. See FIN-9 |
| B-18 fulfillment endpoints cron-secret only | **FIXED** | `requireAdmin()` primary gate `fulfillment/submit/route.ts`, `retry/[itemId]/route.ts` |
| B-19 single-use promo race | **FIXED** | `promo_code_redemptions_single_use_key` partial UNIQUE (`2026060806`) |
| B-20 promo coupon UPDATE via anon | **FIXED** | service client used for the update `checkout/route.ts:177-183` |
| B-24 stale Stripe mode cache | see FIN-10 | not re-verified in depth this pass |

---

## Findings

### FIN-1 — Order side-effects (confirmation email, CRM totals, Meta CAPI) can fire more than once on resume/concurrent delivery
- **Severity:** P1 (deterministic over-count / duplicate customer email; not duplicate money movement)
- **file:line:** `src/app/api/webhooks/stripe/route.ts:300-312, 387-412, 424-457, 467-493` (and the mirror Elements path `:540-557, 633-657, 667-736`)
- **Why:** The idempotency short-circuit is "order row exists AND has >=1 order_item" (`:310`). The per-item loop (`:403`) inserts `order_items` with **no unique constraint** on `(order_id, product_id, variant_id)` (confirmed: no such constraint in migrations; base table has none referenced). Failure modes:
  1. **Resume after partial crash:** if the handler crashed after inserting the order row but mid-item-loop, on Stripe retry the resume path re-runs the *entire* loop, duplicating any items that were already inserted, then re-runs `recordOrder` (bumps `total_spent_cents` + `total_orders` again), re-sends the confirmation email, re-fires Meta Purchase, re-sends the owner notification. None of these are dedupe-guarded except the promo redemption (DB unique) and enrollment.
  2. **Concurrent delivery:** Stripe can deliver the same event to two function instances. Instance A inserts the order; instance B hits 23505 and returns (good). But if A is still mid-item-loop when B reads (`:303`), B sees the order with 0 items and proceeds to *also* run the loop → duplicate items + double CRM/email.
- **Remediation:** (a) add a UNIQUE constraint on `order_items (order_id, product_id, variant_id)` and use `upsert(..., onConflict, ignoreDuplicates:true)` so item creation is idempotent; (b) gate the one-shot side-effects (confirmation email, owner email, `recordOrder`, Meta Purchase) on a single atomic transition — e.g. only run them when the order row transitions `status` `processing`→`confirmed` via a conditional `.update().eq('status','processing').select()` that returns a row, mirroring the booking pattern at `:203-214`; or record a `confirmation_sent_at` / `crm_recorded_at` timestamp and skip if set.
- **prior-ref:** new (prior audit's B-2 only covered the order-row dup, which UNIQUE now prevents; the *item-loop + side-effect* re-run is a distinct residual gap).
- **regression test:** invoke `handleCheckoutCompleted` twice for the same session (simulating retry) against a seeded cart; assert `order_items` count == cart length (not 2x), `crm_contacts.total_orders` incremented by exactly 1, and `sendOrderConfirmation` called once.

### FIN-1b — Elements (Payment Elements) order path has NO UNIQUE on `stripe_payment_intent_id` → duplicate orders under concurrent/retried delivery
- **Severity:** P0 (duplicate order + duplicate fulfillment + double customer email on the embedded checkout path)
- **file:line:** `src/app/api/webhooks/stripe/route.ts:542-603` (read-then-insert keyed on `stripe_payment_intent_id`); migration check: **no** `UNIQUE`/index on `orders.stripe_payment_intent_id` exists in `supabase/migrations/*` (grep returns zero).
- **Why:** The hosted path is protected by `orders_stripe_checkout_session_id_key` UNIQUE, so a concurrent second insert hits 23505 and safely returns (`:347`). The Elements path inserts with only `stripe_payment_intent_id` (no session id) and the code's 23505 branch (`:595`) can therefore **never fire** because there is no unique constraint to violate. Two deliveries of `payment_intent.succeeded` (Stripe at-least-once + Vercel retry) that both pass the `existingOrder` read at `:542` before either inserts will create **two orders**, run the item loop twice, route fulfillment twice, and email twice. This is the same class as the now-fixed B-2 but reintroduced for the embedded flow that postdates the prior audit.
- **Remediation:** add `ALTER TABLE orders ADD CONSTRAINT orders_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id)` (allowing NULLs). Then the existing 23505 branch becomes effective. Combine with FIN-1's side-effect guard.
- **prior-ref:** new (embedded checkout did not exist at B-payments).
- **regression test:** insert two orders with the same `stripe_payment_intent_id`; assert the DB rejects the second (constraint) and that `handleElementsPaymentSucceeded` invoked twice yields one order + one set of items.

### FIN-2 — Fulfillment re-submission to provider on retry (no provider-order-id pre-claim / dedup)
- **Severity:** P1 (duplicate provider order = real money to Margaret + duplicate physical shipment)
- **file:line:** `src/lib/fulfillment/router.ts:382-479` (submit), `:536-687` (retry); `submitToLumaprints :235`, `submitToPrintful :269-294`
- **Why:** Items are selected for submission by `fulfillment_status IN ('pending','failed','failed_validation')` (`:360`). The provider API call (`lumaprintsSubmitOrder` / `printfulCreateOrder`) is made **before** the status is written to `submitted` (`:468-477`). If the provider call succeeds but the subsequent Supabase `update` fails, or the serverless function is killed (Stripe webhook → Vercel timeout), the item stays `pending` and the next `routeOrderToFulfillment` (called again from a webhook retry, or admin "re-fire") submits a **second** order to LumaPrints/Printful for the same item. There is no idempotency key sent to the provider (LumaPrints `reference` = our `orderId` is reused but the order API does not dedupe on it here), and no check that `external_order_id` is already set before submitting. Inbound provider webhooks reverting `order_failed`/`order_canceled` back to `pending` (`lumaprints/route.ts:147-151`, `printful/route.ts:135-156`) further re-arm this.
- **Remediation:** before calling the provider, atomically claim the item: `update order_items set fulfillment_status='submitting' where id=? and fulfillment_status in ('pending','failed','failed_validation') returning id` and only call the provider if a row came back. Send an idempotency/reference key the provider honors (LumaPrints external reference per *item*, Printful `external_id`) and on retry first `getOrder(reference)` to detect an existing provider order before creating a new one. Persist `external_order_id` in the same statement that flips to `submitted`.
- **prior-ref:** extends B-15/B-16 (those addressed draft-confirm and option format, not the resubmit race).
- **regression test:** stub the provider client to succeed; run `routeOrderToFulfillment(orderId)`, then simulate a lost status-write and run it again; assert the provider create stub was called exactly once per item (or that the second run short-circuits because the item is no longer `pending`).

### FIN-3 — `record_order_for_contact` is SECURITY DEFINER granted to `anon` — lets an unauthenticated caller forge promo redemptions and inflate CRM/usage counters
- **Severity:** P1 (data integrity on the money-adjacent promo ledger; promo `usage_count` drives single-use enforcement)
- **file:line:** `supabase/migrations/20260522_crm_anon_rpcs.sql:77-120` (`grant execute ... to anon, authenticated`)
- **Why:** The function upserts a contact, bumps `total_orders`/`total_spent_cents`, **inserts into `promo_code_redemptions`, and increments `promo_codes.usage_count`** — all as `SECURITY DEFINER` (bypassing RLS). It is granted to `anon`. Any unauthenticated visitor can call this RPC directly (PostgREST) with an arbitrary `p_promo_code_id` and `p_order_total`, fabricating redemptions and bumping `usage_count` toward a code's `usage_limit` (a denial-of-discount vector) or polluting CRM revenue totals. The webhook now uses the service client, so anon access is unnecessary.
- **Remediation:** `revoke execute ... from anon, authenticated; grant execute ... to service_role;` (mirror the `reserve_original` grant pattern in `2026060806`). The webhook already calls it with the service client, so this is non-breaking.
- **prior-ref:** the prior audit flagged this as a cross-area note only; confirmed still open in current migrations.
- **regression test:** as the `anon` role, `select record_order_for_contact('x@y.com', 999, '<promo-uuid>')` must raise permission-denied; as `service_role` it succeeds.

### FIN-4 — Money stored as floating `numeric`-from-JS-number dollars, not integer cents (rounding exposure)
- **Severity:** P2 (constrained; sub-cent drift / reconciliation friction, not a direct loss on the happy path)
- **file:line:** webhook order insert `src/app/api/webhooks/stripe/route.ts:333-337` (`subtotalCents/100`, `total: (amount_total||0)/100`), order_items `unit_price: price` (dollars) `:408`; `database.ts:151-155,178` types are `number`.
- **Why:** Stripe is authoritative in integer cents, but the app divides by 100 and stores dollars in `numeric` columns; `order_items.unit_price` stores the dollar `variant.price`. Re-summing `unit_price*quantity` for display/reconciliation (`order/[session]/page.tsx:165`, email `:475-480`) can disagree with the Stripe-charged `total` by rounding, and any future arithmetic in JS floats risks `0.1+0.2` style drift. The charge itself is correct (Stripe computes from `unit_amount` cents in `checkout/route.ts:212`), so this is integrity/reconciliation, not over/undercharge.
- **Remediation:** store money as integer cents end-to-end (or at minimum keep the authoritative `amount_total`/line `unit_amount` cents on the order/order_items and treat dollar columns as derived). Add a reconciliation assertion that `sum(order_items.unit_price*qty) + shipping + tax - discount == total` within 1 cent.
- **prior-ref:** new.
- **regression test:** seed an order with three items at `$x.33`; assert stored `total` equals the Stripe `amount_total/100` and the re-summed line total matches within $0.01.

### FIN-5 — Printful `externalId` truthiness bug can skip confirm and store a falsy external id
- **Severity:** P2 (Printful order left as draft / un-trackable; reliability)
- **file:line:** `src/lib/fulfillment/router.ts:282-300`
- **Why:** `const externalId: string = response?.result?.id || response?.id || ''`. Printful returns the order id as a **number**. If the id were ever `0` it is falsy (minor), but more importantly `externalId` is typed `string` yet assigned a number; `confirmOrder(externalId)` and `external_order_id` then receive a number coerced via `String()` only at write time (`:299`) — the confirm call at `:290` passes the raw number (fine, signature allows it), but if `result.id` is absent and only a nested shape exists, confirm is skipped silently and the item is still marked `submitted` with `external_order_id=''`, which the inbound `package_shipped` webhook (`printful/route.ts:97`) can never match (`.eq('external_order_id','')`) → tracking never recorded.
- **Remediation:** parse defensively to the documented Printful field (`response.result.id`), assert it is a positive number before marking `submitted`; if absent, mark `failed` (not `submitted`) so admin re-fires. Ensure `external_order_id` is the same value the `package_shipped` webhook will send.
- **prior-ref:** extends B-15.
- **regression test:** feed `submitToPrintful` a mocked response missing `result.id`; assert the item is marked `failed`, not `submitted` with empty external id.

### FIN-6 — Inbound provider webhooks have no event idempotency and no signature on ShipStation beyond a URL query secret
- **Severity:** P2 (constrained: duplicate status writes are mostly harmless, but `order_failed`→`pending` revert re-arms FIN-2; ShipStation secret-in-URL is weaker than HMAC)
- **file:line:** `webhooks/lumaprints/route.ts:69-159`, `webhooks/printful/route.ts:67-161`, `webhooks/shipstation/route.ts:7-17,62-115`
- **Why:** (a) None of the three dedupe on a provider event id — a replayed `order_failed` flips items back to `pending`, which FIN-2 will then resubmit. (b) ShipStation auth is `?secret=` query-param equality (`shipstation/route.ts:16`): the secret lands in access logs/referrers and is not an HMAC over the body, so a captured URL is a replayable bearer. (c) status reverts to `pending` on cancel/fail lose the prior `external_order_id` association implicitly (the row keeps it, but a re-route may create a new provider order under a new id).
- **Remediation:** dedupe inbound provider events (store provider event id in `webhook_logs.stripe_event_id`-equivalent unique column, or no-op when the target status is already terminal); for ShipStation prefer an HMAC signature header if available, else rotate the URL secret and treat as low-trust; on `order_failed` set a distinct `failed`/`provider_cancelled` status that does NOT auto-resubmit without admin action.
- **prior-ref:** new (prior audit established Stripe-only signature posture).
- **regression test:** POST a duplicate `order.shipped` for an already-`delivered` item; assert no state regression. POST ShipStation without `?secret`; assert 400.

### FIN-7 — Elements-flow placeholder email writes a fake buyer address on the order
- **Severity:** P2 (records integrity; a paid order can be stored with `unknown@artbyme.studio`)
- **file:line:** `src/app/api/webhooks/stripe/route.ts:561-565`
- **Why:** If a Payment Elements order arrives with no `receipt_email` and no `md.email`, the code stores `buyerEmail='unknown@artbyme.studio'` to satisfy the NOT NULL column, then proceeds to call `recordOrder('unknown@artbyme.studio', ...)` — polluting CRM with a fake buyer and sending the confirmation/owner emails to a placeholder. The intent route sets `receipt_email` and mirrors `email` into metadata (`checkout/intent/route.ts:193,200`), so this is an edge case, but it silently corrupts CRM.
- **Remediation:** if no real buyer email is resolvable, skip `recordOrder` and the confirmation email (still create the order so money/fulfillment proceed), and log an alert for manual follow-up rather than writing a synthetic contact.
- **prior-ref:** new (Elements flow did not exist at prior audit).
- **regression test:** drive `handleElementsPaymentSucceeded` with a PI lacking email; assert order is created but `recordOrder` is NOT called with the placeholder.

### FIN-8 — `discountCents` for tax base in Elements vs hosted may diverge; promo `min_order_amount`/usage not re-checked at webhook time
- **Severity:** P2 (constrained money: tax computed on discounted subtotal client-route-side; the charge is server-computed so customer can't lower it, but tax base trust spans two code paths)
- **file:line:** hosted `checkout/route.ts:247-274` (tax line added to session), Elements `checkout/intent/route.ts:160-176` (tax folded into PI amount); webhook stores `taxCents` from `session.total_details.amount_tax` (hosted, authoritative) vs `md.tax_cents` (Elements, from the intent route's own computation).
- **Why:** For the hosted flow the webhook reads tax from Stripe's `total_details` (authoritative). For Elements the webhook trusts `md.tax_cents` that the *intent route* wrote — which is fine because the same route also set the PI `amount`, so the customer cannot tamper it. The residual issue is that neither flow re-validates the promo at capture time (usage_limit/expiry could change between checkout creation and webhook), but single-use is DB-enforced (B-19 fixed) so impact is limited to a code that expired mid-session still honoring its already-created Stripe coupon. Documented as accepted-risk-grade.
- **Remediation:** low priority — optionally re-assert promo validity in the webhook before `recordOrder`; otherwise document as accepted.
- **prior-ref:** relates to B-19 (fixed).
- **regression test:** n/a (accepted) or assert webhook stores `amount_tax` from Stripe for hosted flow.

### FIN-9 — ShipStation is dead fulfillment path (no router case); any `shipstation` item would be marked failed
- **Severity:** P3 (maintainability / misleading; no item currently routes to it)
- **file:line:** `src/lib/fulfillment/router.ts:386-465` (no `shipstation` case → default → `failed`); inbound `webhooks/shipstation/route.ts` only matches `self_ship`.
- **Why:** Confirms prior B-17 still open. `fulfillment_type` is only ever `lumaprints`/`printful`/`self_ship` (derived in checkout), so no live item routes to ShipStation; the inbound webhook exists to receive tracking for manually-shipped `self_ship` items. The integration is otherwise inert.
- **Remediation:** document that ShipStation inbound is the tracking channel for `self_ship` and that there is no outbound ShipStation submission, or remove unused outbound integration code. No action required for correctness.
- **prior-ref:** B-17 (open, by design).
- **regression test:** n/a.

### FIN-10 — Stripe mode cache not invalidated on settings change (test↔live window)
- **Severity:** P3 (operational; site is test-mode today)
- **file:line:** `src/lib/stripe/index.ts` module-level `modeCache`/`stripeCache`; `clearStripeModeCache()` defined but verify it is called on admin settings update.
- **Why:** Carryover of prior B-24; a brief window after toggling live mode could use the cached test key across warm instances. Low impact pre-launch.
- **Remediation:** call `clearStripeModeCache()` from the settings update handler; consider `MODE_CACHE_MS=0` for the launch.
- **prior-ref:** B-24.
- **regression test:** toggle mode; assert next `getStripe()` reflects new mode.

---

## Notes / verified-clean
- **Amount integrity (Pass):** both checkout routes re-price every line from `products.base_price`/`product_variants.price` and ignore client price; `unit_amount` is integer cents (`checkout/route.ts:212`); surcharge is the server cart value; promo discount is server-validated (`validateDiscountCode`). Client cannot raise/lower the charge.
- **Capability token (Pass):** order confirmation reads via service client filtered to the exact Stripe `cs_*`/`pi_*` token (`order/[session]/page.tsx:59-82`); the token is unguessable and the page is `noindex`; only that one order's columns are selected. No customer id is exposed and no enumeration is possible. `OrderConfirmationPoll` is a dumb client-side `router.refresh()` (no data access).
- **Stripe webhook signature + idempotency (Pass for order/enroll/booking dedup):** dual-secret `constructEvent` verification (`route.ts:56-77`); resume-safe handler; UNIQUE session id; 23505 concurrent-insert handled; throws non-2xx on genuine failure so Stripe retries. The *residual* gaps are FIN-1 (side-effect re-run) and the Elements PI path keyed on `stripe_payment_intent_id` (no DB UNIQUE on that column was found in migrations — verify base schema; if absent, two PI deliveries before the first item write could double-insert exactly like FIN-1).
- **Refund/cancel (Pass):** real Stripe refund issued, status not flipped on failure; dispute/refund/failed webhook cases present.

