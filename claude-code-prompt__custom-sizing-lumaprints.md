# Claude Code Prompt — Custom (Nonstandard) Print Sizes via LumaPrints

**Run this from the repo root `~/Margaret-Edmondson`** (the Next.js 16 / Supabase app for artbyme.studio; package name `margaret-edmonson`). Supabase project `MargaretEdmondson` — ref `klwkajukicsoiwpsgftt`.

You are wiring **true-to-aspect custom print sizes** through the whole product system. Today every variant is forced onto LumaPrints **standard** sizes (8×10, 11×14, … 30×40), but most of Margaret's originals are nonstandard (Poolside **4×12**, Dig **9.25×11**, Dolphin Watch **7.5×9.5**, Sweet Home Alabama **5×8**, Road Trip **6×12**, Pins & Needles **6×10**). The job: derive each artwork's real print sizes from its master image, **send those exact dimensions to LumaPrints for live pricing**, publish the resulting customer prices, and **submit orders with the correct dimensions**.

Work in **phases, in order.** Operating rules below mirror `audit/OVERNIGHT-PLAN.md`: **push to `main`, no branches, annotated `restore/*` tags; never hard-stop — fix forward and log; write all integration code env-guarded so it works the moment keys are present.**

---

## 0. OPERATING RULES (read fully before starting)

> **Prime directive: DO NOT STOP. Fix forward.** Failed gate? Fix and re-run. Missing LumaPrints key? Still write complete, correct code (read creds from env; guard gracefully), and log it.

1. Work directly on **`main`** (no feature branches — they break Vercel previews). Before starting, create & push annotated tag `restore/pre-custom-sizing` at HEAD; create `restore/pre-phaseN` before each phase that does DB work.
2. Commit after each task; push every commit to `main`. For any migration, include inverse (down) SQL as a comment.
3. Maintain a running log at `audit/CUSTOM-SIZING-LOG.md`: one entry per task — **DONE / FIXED-FORWARD / DEFERRED(reason)** — files touched and every judgment call.
4. After **every phase**, run the **Phase Gate**: `npm run typecheck` → `npm run lint` → `npm run build` → `npm test`. Do not stop on failure — fix forward until green. Never leave `main` un-buildable.
5. **Critical gotcha (do NOT trip):** the Next.js 16 middleware is **`src/proxy.ts`**, not `src/middleware.ts`. Do not create `src/middleware.ts`.
6. **Branding:** "ArtByME" (capital M and E). Artist: Margaret Edmondson.
7. **Env-guard every LumaPrints call.** If `LUMAPRINTS_API_KEY/SECRET/STORE_ID` are absent, code must no-op/queue gracefully (never throw at import or crash a request). Missing keys never block a task — write the code complete and log which keys the human must add in Vercel.
8. **Money/fulfillment path — extra care.** Do NOT flip Stripe to live. Do NOT place a real (production) LumaPrints order during development — use the **sandbox** host for all test submissions (see Phase 0). Keep all DB changes additive/reversible.

**Hard refusals:** no `src/middleware.ts`; no deleting data / dropping columns; no printing or inventing secrets; no live Stripe; no production LumaPrints order until the human signs off.

---

## 1. Verified context (confirmed against the repo + LumaPrints docs on 2026-06-15)

### 1a. The LumaPrints API (authoritative — from https://api-docs.lumaprints.com)

The integration's pricing API is **already dimension-based** — it accepts arbitrary `{width, height}`. The gaps are in (a) which sizes we feed it and (b) the **order** payload. Confirmed shapes:

- **Products cost** (batch pricing): `POST /api/v1/pricing/products` — body is an **array** of `{ subcategoryId, size: { width, height }, options: number[] }`; returns `[{ success, subcategoryId, size, price, options:[{optionId,price,…}], error? }]`. Custom (nonstandard) `width`/`height` are accepted; out-of-range sizes return `success:false`. The repo already calls this in `src/lib/integrations/lumaprints.ts → getProductsCost` (used only by the catalog sync today). **This is our custom-size price source.**
- **Shipping cost:** `POST /api/v1/pricing/shipping` — `{ recipient, orderItems:[{ subcategoryId, quantity, width, height, orderItemOptions:number[] }] }`. Already dimension-based; already used by `quoteWorstCaseCONUS`.
- **Submit order:** `POST /api/v1/orders` — **NOTE the repo currently posts to the wrong path and wrong shape.** Documented body:
  ```json
  {
    "externalId": "<our order id>",
    "storeId": 818,
    "shippingMethod": "default",
    "productionTime": "regular",
    "specialInstructions": "optional",
    "recipient": { "firstName","lastName","addressLine1","addressLine2","city","state","zipCode","country","phone","company" },
    "orderItems": [
      { "externalItemId":"<our order_item id>", "subcategoryId":103001, "quantity":1,
        "width":8, "height":10, "file": { "imageUrl":"https://…signed-master.tif" },
        "orderItemOptions":[11,51,23], "solidColorHexCode": null }
    ]
  }
  ```
  Success → `201 { "message":"…queued…", "orderNumber": 10000001440 }`.
- **Get order:** `GET /api/v1/orders/{orderNumber}` (response includes `orderStatus`, `recipient`, and `orderItems[]` with `width`/`height`/`file.imageUrl`/`itemCostTotal`/`orderItemOptions[]`).
- **Hosts:** production `https://us.api.lumaprints.com` (current `LUMAPRINTS_BASE_URL`), sandbox `https://us.api-sandbox.lumaprints.com`. Auth = HTTP Basic `key:secret` (already implemented).

> ⚠️ **The repo's order endpoints are wrong** and would fail against the live API: `submitOrder`/`getOrder`/`getShipments` use `/api/v1/stores/${STORE_ID}/orders…`; `submitOrder` sends `{ reference, items:[{imageUrl, categoryId, subcategoryId, orderItemOptions, quantity}], shippingAddress:{name,address1,zip,…} }` — there is **no width/height**, the field/endpoint names don't match the docs, and `storeId` belongs in the body. Phase 4 corrects all of this.

### 1b. Relevant code (file → role)

- `src/lib/integrations/lumaprints.ts` — API client. `getProductsCost` (custom pricing, OK), `getShippingCost` (OK), `submitOrder`/`getOrder`/`getShipments` (**wrong path + shape — fix in Phase 4**).
- `src/lib/pricing/mediums.ts` — `MEDIUMS`, `Medium`, the **STANDARD_PORTRAIT/SQUARE/LANDSCAPE** grids, `sizeDimensions(label)` (⚠️ **integer-only regex** — must accept decimals, Phase 1), `orientationForAspect`.
- `src/lib/pricing/medium-config.ts` — `getMediumConfig(supabase, medium)` → `{ subcategory_id, option_ids, sizes, enabled, name }` from `lumaprints_mediums`.
- `src/lib/pricing/lumaprints-cache.ts` — `getCachedPrice`/`refreshCachedPrice`. **`fetchLivePrice` takes cost from the admin standard-size grid (`costFromMediumConfig`)** and only quotes shipping live. ⚠️ For custom sizes it must fetch **base cost live via `getProductsCost`** (Phase 2).
- `src/lib/pricing/variant-pricing.ts` — `customerPriceCents(...)` (margin math; size-agnostic — **no change needed**).
- `src/lib/pricing/canvas-prints.ts` — legacy hardcoded 8-size table. Superseded; leave but do not extend.
- `src/app/api/admin/variants/bulk-create/route.ts` — creates variants from `size_labels[]`; already writes `width_in`/`height_in` from `sizeDimensions`. Extend to custom sizes (Phase 3).
- `src/app/api/admin/lumaprints/sync/route.ts` — prices the standard grid into `lumaprints_mediums.sizes`. Leave; custom pricing bypasses the grid.
- `src/app/api/admin/pricing/refresh/route.ts` — re-prices variants (Phase 5).
- `src/lib/fulfillment/router.ts` — **the order path.** `validateLumaprintsItem` (checks `size_label` but **does not carry width/height**), `submitToLumaprints` (builds items **without width/height**), the `Variant` interface (no `width_in/height_in`), and **two** variant SELECTs (~L356, ~L561 — select `size_label`, not the inch columns). All fixed in Phase 4.

### 1c. Schema (already custom-size-ready — confirmed live)

- `product_variants`: `medium`, `size_label` (text), **`width_in`** (numeric), **`height_in`** (numeric), `lumaprints_cost_cents`, `shipping_cost_cents`, `price`, `margin_override_pct`, `manual_price_override_cents`, `fulfillment_metadata` (jsonb: `{ size, lumaprints_subcategory_id, lumaprints_option_ids }`), `is_lumaprints_available`, `last_priced_at`.
- `master_artworks`: **`width_px`**, **`height_px`**, `dpi` — the **aspect-ratio source** (Skylar's decision: derive from the print-ready master image).
- `lumaprints_mediums`: per-medium `subcategory_id`, `option_ids`, `sizes` (jsonb standard grid), `enabled`.
- `lumaprints_pricing_cache`: unique `(medium, size_label)` → `cost_cents, shipping_cents, expires_at` (TTL 24h). Custom `size_label`s (e.g. `"20x15"`, `"20x14.8"`) fit this key as-is — **no migration required.**

> **No schema migration is strictly required** — `width_in`/`height_in`/`size_label` and the cache already exist. The only optional additive change (Phase 3) is storing the tier name in `fulfillment_metadata.tier`; that's jsonb, so still no DDL.

### 1d. Locked product decisions (from Skylar)

- **Offering model:** per-artwork **proportional tiers** (Small / Medium / Large) that **preserve the artwork's exact aspect ratio**, clamped to each subcategory's published min/max. Default longest-edge targets **S≈12", M≈20", L≈30"** (make these a constant/site-setting).
- **Aspect-ratio source:** the **print-ready master image** — `master_artworks.width_px / height_px`.

---

## PHASE 0 — Preflight & API verification (sandbox)

0.1 **Baseline.** `npm ci`; run the Phase Gate; record "before" in `audit/CUSTOM-SIZING-LOG.md`. Create & push `restore/pre-custom-sizing`.

0.2 **Env check.** Confirm presence (not values) of `LUMAPRINTS_API_KEY`, `LUMAPRINTS_API_SECRET`, `LUMAPRINTS_STORE_ID`, `LUMAPRINTS_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Log which are missing. **Do not block on missing keys.**

0.3 **Confirm the live API shapes against a sandbox** before changing the order code. Add a dev-only script `scripts/luma-probe.mjs` (env-guarded; **no-op with a printed notice if keys absent**) that, against `LUMAPRINTS_BASE_URL` defaulting to `https://us.api-sandbox.lumaprints.com`:
  - `GET /api/v1/products/categories` and the canvas subcategory list → capture each subcategory's `minimumWidth/maximumWidth/minimumHeight/maximumHeight` for `101002` (stretched canvas) and `102002` (framed canvas). Save to `audit/diag/luma-subcategory-bounds.json`.
  - `POST /api/v1/pricing/products` with a **nonstandard** size, e.g. `[{subcategoryId:101002, size:{width:9.25, height:11}, options:[]}]`, and an integer control `{width:9, height:11}`. **Record whether fractional dimensions are accepted** (success vs error). Save raw responses to `audit/diag/luma-custom-price-probe.json`.
  - Do **not** submit an order here. (Order submission is verified in Phase 6 against sandbox.)
  Log the fractional-acceptance result — it decides the rounding policy in Phase 1 (see 1.2).

---

## PHASE 1 — Decimal-aware sizing + proportional tier derivation

1.1 **Fix `sizeDimensions` to accept decimals.** In `src/lib/pricing/mediums.ts`, the regex `^(\d+)\s*[x×]\s*(\d+)$` drops fractional sizes (so `"9.25x11"` → `null`, silently zero-pricing custom variants). Replace with decimal-aware parsing:
  ```ts
  export function sizeDimensions(size_label: string): { width: number; height: number } | null {
    const m = size_label.match(/^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i)
    if (!m) return null
    return { width: Number(m[1]), height: Number(m[2]) }
  }
  ```
  Add unit tests covering `"9.25x11"`, `"20x14.8"`, `"24×30"`, and rejects (`""`, `"foo"`).

1.2 **New pure module `src/lib/pricing/size-tiers.ts`** (no I/O — golden-file testable, like `variant-pricing.ts`). It turns a master's pixel dimensions + a subcategory's inch bounds into proportional, aspect-preserving print sizes:
  ```ts
  export interface SubcategoryBounds { minW: number; maxW: number; minH: number; maxH: number }
  export interface SizeTier { tier: 'S' | 'M' | 'L'; size_label: string; width_in: number; height_in: number }

  // Longest-edge targets per tier (inches). Keep here; allow a site-setting override later.
  export const TIER_LONG_EDGE_IN: Record<'S'|'M'|'L', number> = { S: 12, M: 20, L: 30 }

  // Round to the precision LumaPrints accepts. If Phase 0 found fractional
  // sizes accepted, use 0.25"; otherwise set STEP = 1 (whole inches) and pad
  // the master to the chosen aspect at fulfillment to avoid auto-crop (see 4.5).
  const STEP = 0.25
  const round = (x: number) => Math.round(x / STEP) * STEP

  export function deriveSizeTiers(
    widthPx: number, heightPx: number, bounds: SubcategoryBounds,
  ): SizeTier[] {
    if (!(widthPx > 0) || !(heightPx > 0)) return []
    const landscape = widthPx >= heightPx
    const ratioShortOverLong = Math.min(widthPx, heightPx) / Math.max(widthPx, heightPx)
    const out: SizeTier[] = []
    for (const tier of ['S','M','L'] as const) {
      const longEdge = TIER_LONG_EDGE_IN[tier]
      let w = landscape ? longEdge : round(longEdge * ratioShortOverLong)
      let h = landscape ? round(longEdge * ratioShortOverLong) : longEdge
      // Clamp to bounds; if clamping breaks aspect by more than a hair, drop it.
      const cw = Math.min(Math.max(w, bounds.minW), bounds.maxW)
      const ch = Math.min(Math.max(h, bounds.minH), bounds.maxH)
      if (cw !== w || ch !== h) {
        // Out of the printable envelope for this tier — skip rather than distort.
        continue
      }
      out.push({ tier, size_label: `${trim(w)}x${trim(h)}`, width_in: w, height_in: h })
    }
    // De-dupe identical labels (small + clamp collisions) and return.
    return dedupeByLabel(out)
  }
  ```
  - `trim()` formats `20` → `"20"`, `14.75` → `"14.75"` (no trailing `.0`).
  - **Aspect is preserved exactly** on the long edge; the short edge is rounded to `STEP`. Document that a ≤`STEP/2` rounding on the short edge is intentional and that the master is padded to the **chosen** print aspect at fulfillment (4.5) so LumaPrints never auto-crops the art.
  - Golden tests: Poolside `4×12` (ratio .333), Dig `9.25×11`, square `12×12`, a wide panorama, plus a tiny piece where S clamps out (assert it's dropped, not distorted).

1.3 **Phase Gate.** Commit `feat(pricing): decimal size parsing + proportional size-tier derivation`.

---

## PHASE 2 — Live custom-size pricing + cache

2.1 **Make `fetchLivePrice` fetch base cost live for non-grid sizes.** In `src/lib/pricing/lumaprints-cache.ts`, today `cost_cents = costFromMediumConfig(cfg, size_label)` only finds **standard** grid rows (custom → `0`). Change so that when the size_label isn't in `cfg.sizes`, it calls the live products-cost API with the parsed dims:
  ```ts
  import { getProductsCost } from '@/lib/integrations/lumaprints'
  // …
  const dims = sizeDimensions(size_label)
  if (!dims) throw new Error(`Unrecognized size_label ${size_label}`)

  let cost_cents = costFromMediumConfig(cfg, size_label)
  if (!cost_cents) {
    // Custom (or un-synced) size — price the exact dimensions live.
    const [res] = await getProductsCost([{
      subcategoryId: cfg.subcategory_id,
      size: { width: dims.width, height: dims.height },
      options: cfg.option_ids,
    }])
    if (!res?.success || res.price == null) {
      throw new Error(`LumaPrints rejected ${size_label} for ${medium}: ${res?.error ?? 'no price'}`)
    }
    const optionsTotal = (res.options ?? []).reduce((s, o) => s + (o.price || 0), 0)
    cost_cents = Math.round((res.price + optionsTotal) * 100)
  }
  ```
  (Shipping already quotes live by width/height — unchanged.) This keeps standard sizes hitting the cheap grid and routes **custom** sizes to the live API, all cached by `(medium, size_label)`.

2.2 **Bounds guard.** Before pricing, validate `dims` against the subcategory bounds captured in Phase 0 (or fetch once and cache). If out of range, throw a clear, surfaced error (`SIZE_OUT_OF_BOUNDS`) so the admin sees it rather than a silent `$0`.

2.3 **Env-guard.** If keys are missing, `getProductsCost` must throw a typed, caught error that the caller renders as "Set cost / configure LumaPrints" (mirror existing behavior) rather than crashing.

2.4 **Phase Gate.** Commit `feat(pricing): live custom-size cost via products-cost API with cache`.

---

## PHASE 3 — Generate proportional-tier variants per product

3.1 **Server helper** `deriveProductSizeTiers(supabase, productId, medium)`:
  - Load `products.master_artwork_id → master_artworks.width_px/height_px`.
  - Load the medium's subcategory bounds (Phase 0 JSON or a live fetch, cached in `lumaprints_mediums.notes`/a small table — your call, keep additive).
  - Return `deriveSizeTiers(width_px, height_px, bounds)`.

3.2 **Extend variant creation.** Reuse `bulk-create` (it already prices each `size_label` via `getCachedPrice`, writes `width_in/height_in` via the now-decimal `sizeDimensions`, and computes the customer price). Add an endpoint `POST /api/admin/products/[id]/variants/generate-sizes` that:
  - body `{ medium }`;
  - computes tiers via 3.1, then calls the same insert path as `bulk-create` (factor the row-builder out of `bulk-create` into a shared function so both use identical logic), passing the derived `size_label`s **and** their exact `width_in/height_in` and `tier`;
  - writes `fulfillment_metadata.tier` and `fulfillment_metadata.size = size_label`;
  - is idempotent (dedupe on existing `(product_id, medium, size_label)` exactly like `bulk-create`).
  - **Do not** distort: if `deriveSizeTiers` returns `[]` (e.g. extreme aspect entirely outside bounds), return a clear message; never fall back to a standard grid that would crop the art.

3.3 **Admin UI hook (functional only, no restyle).** In `src/components/admin/VariantsTab.tsx`, add a **"Generate true-to-size prints (S/M/L)"** action next to the existing size picker that calls the new endpoint and refreshes the list. Show each created variant's `width_in × height_in` and price. (Wiring/markup only — no visual redesign.)

3.4 **Storefront display.** Where variants render (`src/components/shop/ProductDetail.tsx`), ensure the size selector shows the real `width_in × height_in` (and tier label) for custom variants, not a standard label. Verify nothing assumes an integer `size_label`.

3.5 **Phase Gate.** Commit `feat(admin): generate proportional true-to-size print variants`.

---

## PHASE 4 — Correct LumaPrints order submission + send custom dimensions (GO-LIVE BLOCKER)

> This is the part that's actually broken today. Even standard-size orders would fail: wrong endpoint, wrong field names, and **no dimensions**.

4.1 **Rewrite the order client** in `src/lib/integrations/lumaprints.ts` to the documented contract:
  ```ts
  export interface LumaOrderItem {
    externalItemId: string
    subcategoryId: number
    quantity: number
    width: number
    height: number
    file: { imageUrl: string }
    orderItemOptions: number[]
    solidColorHexCode?: string | null
  }
  export interface LumaOrderRequest {
    externalId: string
    storeId: number
    shippingMethod?: string      // default 'default'
    productionTime?: string      // default 'regular'
    specialInstructions?: string
    recipient: {
      firstName: string; lastName: string
      addressLine1: string; addressLine2?: string
      city: string; state: string; zipCode: string; country: string
      phone?: string; company?: string
    }
    orderItems: LumaOrderItem[]
  }

  export async function submitOrder(order: LumaOrderRequest): Promise<LumaPrintsOrderResponse> {
    return request(`/api/v1/orders`, { method: 'POST', body: JSON.stringify(order) }) as Promise<LumaPrintsOrderResponse>
  }
  export async function getOrder(orderNumber: string) {
    return request(`/api/v1/orders/${orderNumber}`) as Promise<LumaPrintsOrderResponse>
  }
  // getShipments: confirm the documented shipments path in Phase 6 and align.
  ```
  Keep `STORE_ID` usage but pass it in the **body** as `storeId: Number(STORE_ID)`.

4.2 **Thread dimensions through the router.** In `src/lib/fulfillment/router.ts`:
  - Add `width_in: number | null` and `height_in: number | null` to the `Variant` interface.
  - Add `width_in, height_in` to **both** variant SELECTs (the block at ~L356 and the single-item fetch at ~L561).
  - In `validateLumaprintsItem`, after the `size_label` check, require numeric dimensions: read `width_in/height_in` (fall back to `sizeDimensions(item.variant.size_label)` if the columns are null on legacy rows). Fail with `'variant width/height not set'` if neither yields positive numbers. Add `width`/`height` to `ValidationOk`.

4.3 **Build the correct order payload** in `submitToLumaprints`:
  ```ts
  const recipient = parseRecipient(shippingAddress) // firstName/lastName split, addressLine1/zipCode names
  const orderItems = validatedItems.map(({ item, validated }) => ({
    externalItemId: item.id,
    subcategoryId: validated.subcategoryId,
    quantity: item.quantity,
    width: validated.width,
    height: validated.height,
    file: { imageUrl: validated.imageUrl },
    orderItemOptions: validated.optionIds,
  }))
  const response = await lumaprintsSubmitOrder({
    externalId: orderId,
    storeId: Number(process.env.LUMAPRINTS_STORE_ID),
    shippingMethod: 'default',
    productionTime: 'regular',
    recipient,
    orderItems,
  })
  ```
  Add a **new** `parseRecipient(shippingAddress)` for the LumaPrints path that emits `firstName,lastName,addressLine1,addressLine2,city,state,zipCode,country,phone` (split `addr.name` → last token = lastName, rest = firstName, default `'Customer'`). **Do not** modify the existing `parseShippingAddress` — it is shared with `submitToPrintful` (the Printful provider at ~L250, `name/address1/zip` shape) and must keep working.

4.4 **Webhook + status sync.** Verify `src/app/api/webhooks/lumaprints/route.ts` and any order-status reader use `orderStatus`/`orderNumber` from the corrected `getOrder` shape. Map LumaPrints `orderStatus` → your `fulfillment_status` (keep existing mapping; just confirm field names).

4.5 **Avoid fulfillment-time cropping.** Because a custom print's aspect may differ from the master by ≤`STEP` rounding (Phase 1) — and because some pieces (per `docs/artwork-inventory.md`, e.g. *Pins and Needles*) "need a white border on custom-size prints" — ensure the master sent for a custom size **matches the ordered print aspect**: either (a) the print master is already the exact crop, or (b) pad the master to the ordered `width:height` with a white border before `file.imageUrl` (a small server util, env-guarded; document which). Do **not** let LumaPrints auto-crop the art. If unsure for a given piece, **skip + log** rather than risk a bad crop (per the no-hard-stop rule).

4.6 **Phase Gate.** Commit `fix(fulfillment): correct LumaPrints order endpoint/payload + send custom width/height [GO-LIVE]`.

---

## PHASE 5 — Publish & refresh prices for custom variants

5.1 **Refresh route.** Confirm `src/app/api/admin/pricing/refresh/route.ts` re-prices every variant through `refreshCachedPrice` / `customerPriceCents` (it now picks up live custom costs from Phase 2 automatically). Ensure it writes `lumaprints_cost_cents`, `shipping_cost_cents`, `price`, `last_priced_at`, and **does not** clobber `manual_price_override_cents`.

5.2 **Backfill existing products.** Add a dry-run-by-default script `scripts/generate-true-sizes.mjs` that, for each printable product with a `master_artwork_id`, calls the Phase 3 generator for the enabled mediums (`canvas`, `framed_canvas`), prices via the live API, and reports a table (product, tier, `W×H`, cost, shipping, customer price). `--apply` writes variants. Idempotent; logs skips (no master, aspect out of bounds). **Pricing sign-off is a human step** — output the table to `audit/diag/true-sizes-preview.csv` for Margaret/Skylar to approve before `--apply` in production.

5.3 **Dashboard stats.** Per `CLAUDE.md`, update the `Public Pages / API Routes` counts in `src/app/(admin)/admin/ProjectHubClient.tsx` if route counts changed (new endpoint added in Phase 3).

5.4 **Phase Gate.** Commit `feat(pricing): publish + backfill true-to-size variant prices`.

---

## PHASE 6 — Tests, gates, and sandbox dry-run

6.1 **Unit/golden tests** (no live keys needed):
  - `size-tiers`: aspect preservation, bounds clamping/dropping, dedupe, the inventory examples (Poolside, Dig, Dolphin Watch, square).
  - `sizeDimensions`: decimal parse + rejects.
  - **Order payload shape test:** feed a fake validated item through the order-item builder and assert the JSON exactly matches the documented contract (keys `externalId, storeId, recipient, orderItems[].{externalItemId,subcategoryId,quantity,width,height,file.imageUrl,orderItemOptions}`). This guards the go-live fix without hitting the network.
  - `customerPriceCents`: unchanged math still green.
6.2 **Live sandbox verification (human-gated, env-guarded).** With sandbox keys + `LUMAPRINTS_BASE_URL=https://us.api-sandbox.lumaprints.com`, extend `scripts/luma-probe.mjs` to (a) price a custom size and (b) **submit one sandbox order** with a nonstandard `width/height` and a signed master URL, then `GET /api/v1/orders/{orderNumber}` and confirm it echoes the dimensions. Save to `audit/diag/luma-sandbox-order.json`. **Never run against production** in this phase.
6.3 **Final Phase Gate** green. Update `audit/CUSTOM-SIZING-LOG.md` with a "Decisions & human action" summary.

---

## Definition of done

- A nonstandard artwork (e.g. Dig 9.25×11) yields **S/M/L variants that preserve its aspect ratio**, each priced from LumaPrints' **live** products-cost API and published to `product_variants.price`.
- `sizeDimensions` parses decimals; no custom variant silently prices at `$0`.
- Order submission posts to **`POST /api/v1/orders`** with the documented body **including `orderItems[].width/height`** and `file.imageUrl`; verified by the payload-shape test and one **sandbox** order that echoes the dimensions.
- `main` builds green; gates pass; logs + the `true-sizes-preview.csv` are written for human price sign-off.
- No `src/middleware.ts`; no production order placed; no secrets printed; Stripe stays in test mode.

## Human action list (out of scope for the run)

1. Add `LUMAPRINTS_API_KEY/SECRET/STORE_ID` (and optionally a sandbox set) in Vercel if not present.
2. Review `audit/diag/true-sizes-preview.csv` and **sign off the margins/prices** before `scripts/generate-true-sizes.mjs --apply` runs in production.
3. Approve one **sandbox** test order, then authorize the first **production** order.

---

### Appendix — exact change map (file : what)

- `src/lib/pricing/mediums.ts` : decimal `sizeDimensions` regex (1.1).
- `src/lib/pricing/size-tiers.ts` : **new** pure tier-derivation module (1.2).
- `src/lib/pricing/lumaprints-cache.ts` : live `getProductsCost` fallback in `fetchLivePrice` + bounds guard (2.1–2.2).
- `src/app/api/admin/variants/bulk-create/route.ts` : extract shared row-builder (3.2).
- `src/app/api/admin/products/[id]/variants/generate-sizes/route.ts` : **new** endpoint (3.2).
- `src/components/admin/VariantsTab.tsx` : "Generate true-to-size prints" action (3.3).
- `src/components/shop/ProductDetail.tsx` : show real `W×H` for custom variants (3.4).
- `src/lib/integrations/lumaprints.ts` : rewrite `submitOrder`/`getOrder` to documented `/api/v1/orders…` contract (4.1).
- `src/lib/fulfillment/router.ts` : `Variant` gains `width_in/height_in`; both SELECTs; `validateLumaprintsItem` carries dims; `submitToLumaprints` builds `orderItems[].width/height/file` + `recipient` (4.2–4.3).
- `src/app/api/admin/pricing/refresh/route.ts` : confirm custom re-pricing (5.1).
- `scripts/luma-probe.mjs`, `scripts/generate-true-sizes.mjs` : **new** sandbox/backfill scripts (0.3, 5.2, 6.2).
- Tests under `test/` : size-tiers, decimal parse, order-payload shape (6.1).
