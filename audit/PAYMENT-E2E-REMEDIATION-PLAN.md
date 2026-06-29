# Payment + Fulfillment E2E Remediation Plan

Authored by DotWin · 2026-06-27

Source: full-pipeline trace + adversarial verification of the
checkout → account → LumaPrints → master-dimensions path (14-agent audit,
findings cross-checked against source; the two headline items re-confirmed by hand).

Goal mapping (what the owner asked to be true end to end):
- **G1** a customer's checkout completes in Stripe (cart → Stripe → paid).
- **G2** after payment a customer account exists where they can log in, track their order/shipment, and keep shopping.
- **G3** a LumaPrints fulfillment order is created appropriately (correct payload, idempotent, gated, alerted).
- **G4** the print master is handed to LumaPrints with the correct dimensions / aspect ratio.

Original verdict (2026-06-27): **NO-GO for live selling.** The Stripe charge completes, but G2 was
structurally broken for guest checkout, the LumaPrints legs cannot be exercised in prod today
(0 print variants, 0 print-ready masters, Stripe in LIVE mode), and several money-correctness /
silent-failure defects existed in the paths that do run.

Every phase ends green only when `npm run build-check` passes (never hand-set status).
Branch per phase off `main`; stage files explicitly (never `git add -A`).

---

## STATUS (updated 2026-06-28)

| Phase | State | Detail |
|-------|-------|--------|
| **Phase 0 — money correctness + privacy** | ✅ **DONE + DEPLOYED** | merged to `main`, Vercel READY on artbyme.studio. |
| **Phase 1 — G2 customer accounts** | ✅ **DONE + DEPLOYED** | merged to `main`, Vercel READY on artbyme.studio. |
| **Phase 2 — fulfillment reliability** | ⬜ not started | highest-risk seam; see below. |
| **Phase 3 — G4 print correctness** | ⬜ not started | |
| **Phase 4 — tracking + webhook hardening** | ⬜ not started | cron backstops, lower urgency. |
| **Phase 5 — live-test harness** | ⬜ not started | human-gated prereqs (test mode, cropped master, print variant, sandbox creds). |

Prod is at `32f34d0` (main). Migrations `2026062800` (checkout_snapshots) and `2026062801`
(g2_account_linkage) are applied + verified in prod. Both phase branches (`fix/payment-p0`,
`fix/payment-p1-g2-accounts`) are merged and can be deleted.

### RESUME / HANDOFF FOR COWORK — start here

The remaining work is **Phases 2 → 5, in order**. Each is its own branch off `main`, green only
when `npm run build-check` prints GREEN, merged + deployed, then verified READY on Vercel.

Operating facts for this repo:
- Supabase prod ref `klwkajukicsoiwpsgftt`; apply migrations via the Supabase MCP `apply_migration`
  AND commit the matching `supabase/migrations/<ts>_*.sql` file (keep them in sync).
- Vercel project `prj_ntGVQ8P3ptujQICjhQMZbyPpmC0j`, team `team_m2LgJy4E3OF5MMzl4zqP7cFY`.
- `build-check`'s `build` step occasionally crashes transiently (Turbopack worker right after the
  test gate, tail "at ignore-listed frames"); `npm run build` alone exits 0 — just re-run build-check.
- `database.types.ts` regeneration is a non-blocking advisory; the money-path code uses the
  untyped service client, so new tables don't break typecheck. Regen is optional cleanup.
- Owner alert emails go to `getOrderNotificationEmail()` → fallback `margaret117art@gmail.com`.
- Reuse the existing alert helpers: `notifyOrderNeedsAttention` / `notifyFulfillmentFailures`.

What changed vs. the plan as written (so you don't redo it):
- **P0-2 + P0-4** shipped together as one reconciliation block in both webhook handlers (compares
  persisted `order_items` sum to the locked `subtotal_cents`; on mismatch it skips fulfillment,
  alerts the owner, logs `alert: reconciliation_failed`). `hasItems`/`reconciled` are computed there.
- **P0-3** = `checkout_snapshots` table; both checkout routes write it (fail-soft), the webhook reads
  it via `loadSnapshotItems` and falls back to `carts.items` for legacy orders.
- **P1-1** auto-provisions a *passwordless, email_confirmed* account (`ensureCustomerAccount`);
  **P1-2** back-link lives in the `handle_new_user` trigger; **P1-3** emails link to the public
  `/order/{ref}` page + `/forgot-password`; **P1-6** needed no change (RLS already owner-scoped).
- The empty-confirmation-email gating idea from P1-5 was handled by storing `''` (not a placeholder)
  and alerting the owner; the buyer email still sends only when an email exists.

**Phase 2 is the priority and the highest-risk seam.** Today the Stripe webhook does order insert +
per-item LumaPrints submit + CRM + Meta + up to 5 emails synchronously under `maxDuration=60`. Two
joined defects: (a) the resume short-circuit returns on `order_items` row-existence *before* the
side-effects claim, so a mid-flight timeout permanently skips the confirmation email/CRM/Meta; and
(b) the only LumaPrints cron polls `submitted`/`in_production`, so stranded `pending`/`submitting`
items have no automated recovery. The clean fix (P2-1..P2-6 in the plan) is to (1) include
`side_effects_completed_at IS NULL` in the short-circuit, and (2) move LumaPrints submission out of
the webhook into a durable `fulfillment_jobs` queue + cron worker, with post-submit write-error
guards and `recomputeOrderStatus` correctness. See the Phase 2 table below for the file refs.

---

## Phase 0 — P0: money correctness + data/privacy (blocks any real customer)

These are "charged-but-broken" or "data leak" defects. Ship before a single live sale.

| ID | Finding | Fix | Files | Type | Effort |
|----|---------|-----|-------|------|--------|
| P0-1 | **Cross-account PII mislink.** `resolveProfileId` matches the buyer email with `.ilike('email', email)` — the raw email is a SQL LIKE pattern, so `a_b@gmail.com` wildcard-matches `aXb@gmail.com` and `.limit(1)` stamps a stranger's `profile_id` onto the order (their address + items leak under someone else's `/account/orders`). | Replace with a case-insensitive **exact** match: `.eq('email', email)` (normalize/lowercase first) or escape `%`/`_`. | `src/app/api/webhooks/stripe/route.ts:96-104` (used :568, :857) | code | S |
| P0-2 | **Null `cartId` → charged with ZERO items, no fulfillment, no alert.** Items persisted only inside `if (cartId)`; webhook reads items solely from `carts.items`. A fast new buyer (hard-nav aborts the 800ms cart sync) is charged for an empty order, and `notifyOrderNeedsAttention` iterates the empty cart so nobody is told. Affects both Elements and hosted paths. | (a) Snapshot the priced item set server-side at intent/session creation regardless of `cartId` (see P0-3). (b) Add a **paid-order-with-zero-`order_items` alert** (webhook + a sweep cron) so it can never be silent. | `intent/route.ts:102-125`, `checkout/route.ts:107-129`, `webhooks/stripe/route.ts:519-532,776-808,636-645,919-928` | code | M |
| P0-3 | **Cart mutable after amount locked (pay-for-one-receive-many).** Amount is fixed at PI/session creation but the webhook reads the item set + quantities live from `carts.items`; only unit price is re-derived, nothing reconciles against `amount_received`. | Persist the **validated priced lines into a locked snapshot** keyed by the PI/session id (e.g. PI metadata is 500-char capped → write to a `checkout_intents`/locked cart row that `track_cart` cannot mutate). Webhook builds `order_items` from that snapshot, not live `carts.items`. Add `status <> 'converted'` guard to `track_cart`. | `intent/route.ts:102-208`, `webhooks/stripe/route.ts:602-623,886-906`, `track_cart` migration `2026062501:49-60` | code + migration | L |
| P0-4 | **No amount reconciliation.** Nothing asserts `Σ(unit_price·qty)+shipping+tax−discount == captured amount`. Root enabler of P0-2/P0-3. | After building `order_items`, assert the computed total equals `amount_received` (within rounding). On mismatch: still create the order but mark `needs_attention` + alert the owner; never silently fulfill a divergent order. | `webhooks/stripe/route.ts:827-867,551-575` | code | M |
| P0-5 | **Submit-time fulfillment failures are invisible.** `router.ts` has no email helper; a 406 aspect mismatch, missing `LUMAPRINTS_STORE_ID`, or 5xx writes only a `webhook_logs` row. `notifyOrderNeedsAttention` only runs at order-time for fulfillability reasons. | Notify the owner on `failed`/`failed_validation` at submit time (add a notify in the router failure paths, or a sweep that emails on new `failed*` rows). | `lib/fulfillment/router.ts:478-486,565-574,693-701,767-777`; `webhooks/stripe/route.ts:636-644` | code | S |
| P0-6 | **Trust-boundary depends on a migration being applied.** `track_cart` is anon-callable unless `2026062501` (anon/authenticated revoke) shipped to prod. | Verify `2026062501_harden_data_exposure.sql:183-184` is applied in prod; if not, apply it. | `supabase/migrations/2026062501...` | verify | S |

Phase 0 gate: build-check green + a manual proof that (i) a fast/empty-cart checkout cannot
produce a silent itemless order, (ii) a tampered cart cannot inflate the shipped set, (iii)
the email match is exact.

---

## Phase 1 — G2: account creation, order visibility, "keep shopping" (the explicit ask)

The webhook never provisions an account (grep-confirmed: no `createUser`/`inviteUserByEmail`/
`signUp` in the money path). Guests get `profile_id = NULL` orders they can never see, and a
later signup with the same email is never back-linked.

| ID | Finding | Fix | Files | Type | Effort |
|----|---------|-----|-------|------|--------|
| P1-1 | **No account provisioned at purchase.** | On a guest order, auto-provision a **passwordless customer account** (`auth.admin.createUser`, email-confirmed) and set `orders.profile_id`. Recommended over a forced password: e-commerce best practice. | `webhooks/stripe/route.ts:96-104,568,857` | code | M |
| P1-2 | **Orphan guest orders never back-linked.** | On signup / first auth, **UPDATE `orders SET profile_id` WHERE `email` matches AND `profile_id IS NULL`** (extend `handle_new_user` trigger or the auth callback). | `migrations/2026060802_handle_new_user.sql`, `auth/callback`, `account/orders/page.tsx:16` | migration + code | M |
| P1-3 | **Post-purchase email CTA dead-ends at a login wall** (`/account/orders` → `/login` for guests). | Send the order-confirmation magic-link / "view your order" link (Supabase magic link to the new account), and/or a guest order-lookup (email + order #). Don't wall the buyer. | `lib/email/triggers.ts:300,309`, `account/orders/page.tsx:11` | code | M |
| P1-4 | **Cart never reset after purchase; `track_cart` can resurrect a converted cart.** | Dispatch `CLEAR` + clear `localStorage('artbyme-cart')` on the order-confirmation page; add the `status <> 'converted'` guard (shared with P0-3). | `lib/cart/context.tsx:28,75-76`, order page, `track_cart` migration | code + migration | S |
| P1-5 | **Placeholder-email guest order** (`unknown@artbyme.studio`) → unlinked, no receipt, bounced email. | When `pi.receipt_email` and `md.email` are both empty, mark `needs_attention` instead of storing a placeholder + emailing a fake address. | `webhooks/stripe/route.ts:835-839,856-857,990-1015` | code | S |
| P1-6 | **Order-detail RLS relies on a service-read after an ownership check, not a buyer policy.** | Confirm `orders`/`order_items` read-own posture is intentional; document it. The list/detail filters by `profile_id`, which now matters more once P1-1/P1-2 populate it. | `account/orders/[id]/page.tsx:57-72` | verify | S |

Phase 1 gate: a guest checkout produces a usable account + a working "view your order"
link; a later signup with the same email surfaces the prior order; cart is empty post-purchase.

---

## Phase 2 — fulfillment reliability: idempotency + recovery (decouple from the 60s webhook)

Highest-risk seam: the webhook does order insert + per-item LumaPrints submit + CRM + Meta +
up to 5 emails **synchronously under `maxDuration=60`**. A mid-flight timeout strands
un-submitted prints AND skips the confirmation email/CRM/Meta, permanently, with no alert and
no recovery cron.

| ID | Finding | Fix | Files | Type | Effort |
|----|---------|-----|-------|------|--------|
| P2-1 | **Side-effects idempotency hole.** Resume short-circuit returns on `order_items` count before re-entering fulfillment + the one-shot side-effects claim → confirmation email / CRM / Meta permanently skipped after a crash. | Include `side_effects_completed_at IS NULL` in the short-circuit, **or** claim/run side-effects before the item-count short-circuit. | `webhooks/stripe/route.ts:543-549,651,663-669,819-825,933-951` | code | S |
| P2-2 | **No recovery for stranded `pending`/`submitting` items.** `routeOrderToFulfillment` is called only inline + a manual admin route; the status cron polls only `submitted`/`in_production`. | **Move LumaPrints submission out of the synchronous webhook into a durable queue** (`fulfillment_jobs` table + cron worker) so it is not under the 60s budget, OR add a cron that re-routes `pending`/`submitting` rows older than N minutes. Queue is the cleaner long-term fix. | `lib/fulfillment/router.ts:403,436`, `cron/lumaprints-status/route.ts:46-49` | code (+ migration if queue) | L |
| P2-3 | **Post-submit DB write errors silently orphan the order in `submitting`** (supabase-js `.update()` returns error, doesn't throw); the throwing sub-case re-marks `failed` → **duplicate physical LumaPrints order** on refire. | Check `{error}` on the post-submit `{fulfillment_status:'submitted', external_order_id}` write; on failure, do NOT leave it claimable without reconciling against the already-created LumaPrints order. | `lib/fulfillment/router.ts:527-536,551-590,732-741` | code | M |
| P2-4 | **`order_items` upsert error swallowed; no retry.** Non-23505 failure is not inspected; for originals, inventory was already decremented. | Destructure + handle the upsert error; fail the webhook (let Stripe redeliver) rather than proceeding to fulfillment + side-effects on a partial write. | `webhooks/stripe/route.ts:619-622,902-905` | code | S |
| P2-5 | **`externalId` reused across partial/retry submits** → possible duplicate LumaPrints orders or a 400. | Use a per-item external id (e.g. `order_items.id`) for the LumaPrints order externalId, not `orderId`; verify dedup behavior in sandbox. | `lib/fulfillment/router.ts:280,709` | code | S |
| P2-6 | **Order status rollup may mark an order shipped while an item is stranded.** | Ensure `recomputeOrderStatus` requires ALL items terminal before rolling to shipped/delivered. | `lib/fulfillment/order-status.ts` | code | S |

Phase 2 gate: kill the webhook mid-fulfillment (simulated) and confirm the order is fully
fulfilled + emailed on recovery with no duplicates; no `pending`/`submitting` row survives > N min.

---

## Phase 3 — G4: print correctness (aspect / DPI safety net)

The aspect/tier math is sound and the purchase snapshot freezes `print_width/height_in` + the
master path together. The gaps are validation and drift.

| ID | Finding | Fix | Files | Type | Effort |
|----|---------|-----|-------|------|--------|
| P3-1 | **`checkImageConfig` is dead code** — no pre-submit aspect/DPI validation anywhere; correctness rests on LumaPrints' submit-time 406 (which then also fails to alert). | Call `checkImageConfig` pre-submit (expected-vs-actual px, 1% aspect, requiredDPI) and alert on mismatch (pairs with P0-5). | `lib/integrations/lumaprints.ts:213-229`, `lib/fulfillment/router.ts:168-220` | code | M |
| P3-2 | **Aspect drift: variants from a raw scan can go Live against a differently-cropped master**; nothing re-validates aspect before sale/submit. The `custom` create route publishes Live **bypassing** the print-ready gate the PATCH route enforces. | Re-validate variant aspect vs the cropped master at Live-flip and order time; gate `custom` route `is_active:true` on `loadVariantFulfillability` like PATCH does; re-validate/invalidate variants when a master is re-cropped. | `variants/custom/route.ts:30-34,58-74`, `admin/variants/[id]/route.ts:28-33`, `builder-context.ts:54-56`, `fulfillability.ts:34-45` | code | M |
| P3-3 | **Builder derives sizes from `print_width_px/height_px` without requiring `print_status='ready'`** → stale dims after a re-crop (which sets `pending` but leaves old px). | Require `print_status='ready'` before deriving sizes; treat re-crop as invalidating dependent variants. | `lib/pricing/builder-context.ts:54` | code | S |
| P3-4 | **1-hour signed URL may expire before LumaPrints fetches; `file.saveImage` never set.** | Lengthen TTL or set `file.saveImage`; confirm LumaPrints fetch timing (sync at submit vs lazy) in sandbox. | `router.ts:127,276`, `lumaprints.ts:145` | code | S |
| P3-5 | **`requiredDPI=200` + canvas bounds hardcoded**, not reconciled against a live subcategory probe; could under-res or wrongly drop the largest sizes. | Reconcile bounds/DPI against the LumaPrints products/cost probe; treat 200 as provisional. | `lib/pricing/subcategory-bounds.ts:21-35`, `size-tiers.ts:192-193` | code | M |
| P3-6 | **Re-crop overwrites `print/<id>.tif` in place** (`upsert:true`); a manual refire mints new bytes against old snapshotted inches. | Version the print master path (content-addressed or `<id>-<rev>.tif`) so a snapshot always resolves to the bytes it priced. | `scripts/process-master-crop.mjs:122-123`, `webhooks/stripe/route.ts:177` | code | M |
| P3-7 | **Fractional 0.05in sizes priced LIVE; fractional pricing unconfirmed** → cost can fall to $0 on a live variant. | Confirm fractional pricing in sandbox; block `is_active:true` when `cost_cents=0`/unpriceable. | `size-tiers.ts:46-48`, `lumaprints-cache.ts:65-90`, `variant-insert.ts:84-92` | code + sandbox | S |

Phase 3 gate: a sandbox order with a deliberately mismatched aspect is caught pre-submit and
alerted; the largest offered size meets DPI; no $0 live print variant.

---

## Phase 4 — tracking + webhook hardening (cron backstops, lower urgency)

| ID | Finding | Fix | Files | Type | Effort |
|----|---------|-----|-------|------|--------|
| P4-1 | **Inbound LumaPrints webhook is dead** (invented HMAC scheme + wrong event shape; also never subscribed). Cron backstops shipping at ≤30min. | Either fix to the documented inbound shape (optional Basic auth, `orderNumber/externalId/shipments[]`, no `event` field) and subscribe it, or formally rely on the cron and delete the dead handler. | `webhooks/lumaprints/route.ts:30-44,99,108-191` | code | M |
| P4-2 | **Customer gets a tracking number but no clickable URL** (cron always passes `trackingUrl:null`). | Build the carrier tracking URL from carrier + number; render a real link. | `cron/lumaprints-status/route.ts:108`, `lib/email/send.ts:172-174` | code | S |
| P4-3 | **Checkout allows CA addresses but fulfillment defaults to a US store** → CA print orders may 406 post-charge. | Verify the US store/subcategories fulfill to CA, or restrict checkout to US. | `checkout/page.tsx:358`, `router.ts:237-252`, `lumaprints.ts:3-4` | verify/code | S |
| P4-4 | **Status cron capped at 15 orders/run with no alerting** — a silent ceiling at higher volume. | Alert when the deferred backlog exceeds the per-run cap. | `cron/lumaprints-status/route.ts:12,54-55` | code | S |
| P4-5 | **AK/HI/CA surcharge collected only if the shopper manually quotes; the Elements path locks surcharge before the address is known.** | Compute the address-based surcharge after the AddressElement collects the address (or at webhook time from the shipping address). | `cart/page.tsx:50-81`, `intent/route.ts:102-124` | code | M |
| P4-6 | **Rate limiting is per-lambda in-memory** (resets per cold start, not shared). | Move to a shared store (e.g. a DB/Upstash counter) if abuse becomes real. | `lib/rate-limit.ts:11` | code | M |

---

## Phase 5 — live-test harness + observability (validate the whole thing)

Prereqs to actually run an end-to-end test (human-gated, from the readiness check):
- Flip `site_settings.stripe_test_mode = true` (currently **false → LIVE**) and confirm
  `STRIPE_*_TEST` keys + a Stripe TEST webhook endpoint at `/api/webhooks/stripe` in Vercel.
- Crop ≥1 master to print-ready (`print_status='ready'` + `print_storage_path`); 0/39 today.
- Activate ≥1 print variant (`variant_type != 'original'`, medium set) through the Live gate;
  0 today (22/22 active variants are `original`/self-ship).
- Export sandbox `LUMAPRINTS_BASE_URL` (api-sandbox host), `LUMAPRINTS_API_KEY/SECRET/STORE_ID`;
  confirm `RESEND_API_KEY` + `CRON_SECRET` in Vercel.

Then:
1. Run `scripts/lumaprints-sandbox-dryrun.mjs <public-padded-master-url>` (isolated, self-guards
   to the sandbox host) to prove dimensions echo correctly.
2. Full storefront test order (test card) → assert: order + `order_items` snapshot written →
   account provisioned + order visible at `/account/orders` → LumaPrints sandbox order created
   with correct W×H + master URL → confirmation + tracking emails sent.
3. Observability to add: webhook 400/500 rate alert; paid-order-with-zero-items sweep;
   stranded `pending`/`submitting` cron; new-`failed_validation` alert.

---

## Sequencing summary

- **Phase 0** before any real sale (security + money correctness).
- **Phase 1** to actually deliver G2 (the explicit ask).
- **Phase 2** before relying on print fulfillment at any volume.
- **Phase 3** before turning on print inventory (G4 correctness).
- **Phase 4** as hardening once live.
- **Phase 5** is the gate that proves it end to end; the prereqs (test mode, cropped master,
  active print variant, sandbox creds) are human-gated and should be coordinated before Phase 2/3
  verification.

Full raw findings: 14-agent audit run `wf_21ddc3cf-093` (transcript in the session subagents dir).
