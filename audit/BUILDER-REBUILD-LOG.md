# Builder + Variant System + LumaPrints Ordering — Rebuild Log

Authored by DotWin. Tracks the execution of `audit/PRODUCT-BUILDER-AND-ORDERING-PLAN.md`.
Legend: **DONE** / **FIXED-FORWARD** / **DEFERRED** + judgment calls.

Branch: `main` (no branches, per plan rule 1). Restore tags: `restore/pre-builder-rebuild` (Phase 0 baseline, commit `0815f78`).
Supabase prod: `klwkajukicsoiwpsgftt`.

---

## PHASE 0 — Preflight, backups, migrations — DONE (2026-06-25)

- **0.1 Baseline gate** — `npm ci` deps present; **GREEN**: typecheck ✓, lint ✓, `npm run build` ✓ (full route tree, proxy middleware), `npm test` ✓ (91 passed / 6 skipped). Pre-existing adopt WIP committed first as its own unit (`0815f78` — behavior-preserving dev tooling + `src/contracts` + ACID register), then tagged `restore/pre-builder-rebuild`.
- **0.2 Backups** — service-client dump (`SUPABASE_SERVICE_ROLE_KEY` is populated locally) → `audit/backups/20260625_190821/`: `product_variants.json` (866 rows), `master_artworks.json` (39), `products.json` (47). `advisors-before.json` snapshot saved.
- **0.3 Migrations applied** via Supabase MCP `apply_migration`:
  - `2026061601_variant_custom_sizing` (additive) — `product_variants` +is_custom_size/size_tier/aspect_ratio (+check, +live-print index); `master_artworks` +crop_box/print_storage_path/print_width_px/print_height_px/border_mode/border_color/print_updated_at (+check); `order_items` +8 snapshot cols.
  - `2026061602_retire_legacy_print_variants` (authorized destructive) — deleted 844 print variants; **22 originals preserved**.
  - **Verified post-migration**: total_variants=22, originals=22, print_variants=0; pv_new_cols=3, ma_new_cols=7, oi_new_cols=8; all constraints + index present.
  - **Advisors**: before=after = 2 pre-existing WARNs (`is_admin_or_artist` SECURITY DEFINER executable — unrelated to this build), **0 ERRORs, no new findings**.
  - Note (migration drift, accepted per CLAUDE.md `#migration-drift`): applied via MCP, so prod records a generated version, not the `2026061601` filename version. Both migrations are idempotent (`IF NOT EXISTS` / delete-guard), so a later `supabase db push` re-applies safely.
- **0.4 `sharp`** added as a declared dependency (`^0.35.2`) for the master-crop worker. `tus-js-client ^4.3.1` already declared.
- **0.5 Sandbox env note** added to `.env.example` (Lumaprints section): master/order dry-runs use `LUMAPRINTS_BASE_URL=https://us.api-sandbox.lumaprints.com` + sandbox keys; never production until human sign-off.

Judgment calls:
- Committed the prior session's uncommitted adopt work as its own commit before starting, so the builder starts from a clean tree and restore tags are meaningful. It is behavior-preserving (dev scripts + contracts + docs), per `STATE.md`.

---

## PHASE 2 — Aspect-locked size math + validation — DONE (2026-06-25)

> Built BEFORE Phase 1 (Phase 1's crop-modal map was still being gathered async; Phase 2 is pure + fully independent + foundational for Phases 3/4). Phase 1 follows.

- **2.1 Decimal sizes** — `sizeDimensions()` (`src/lib/pricing/mediums.ts`) regex now `^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$` + positivity guard. Parses `9.25x11`, `31 × 50`, trims whitespace; rejects trailing junk (`12 × 22 in`) so display labels can't be mis-parsed. Custom sizes no longer silently price at $0.
- **2.2 New pure module** `src/lib/pricing/size-tiers.ts`: `aspectFromMaster()`, `partnerDimension()` (bidirectional aspect-locked auto-fill, optional grid step), `deriveDefaultTiers()` (S/M/L at long-edge {12,20,30}, all one shape, clamped to bounds + resolution ceiling, **drops a tier rather than distorting**), `validateCustomSize()` ({ok, reasons[], boundsOk, resolutionOk, aspectOk, aspectDeltaPct, maxWidthIn, maxHeightIn} — bounds + resolution (`in·dpi ≤ printPx`) + 1% aspect). Plus `roundToStep`, `sizeLabel`/`displaySize` helpers.
- **Golden tests** `test/size-tiers.test.ts` (23 tests): decimals + rejects; Poolside 4×12 / Dig 9.25×11 / Dolphin 7.5×9.5 / square pass; over-resolution, out-of-bounds, off-aspect each fail with the right reason flag; partner-dimension exact inverse; tier all-3 / drop-L (small master) / drop-M (3:1 panorama rounding).
- **Gate GREEN**: typecheck ✓, lint ✓ (0 err), `npm test` 114 passed/6 skipped (+23), build ✓.

Design decisions (size math):
- **`size_label` is the machine form `"WxH"`** (e.g. `30x22.5`) so `sizeDimensions()` + the pricing-cache key keep working; the customer **display** string (`"30 × 22.5 in"`) is separate (`displaySize`, stored on `name`). The plan's `"{W} × {H} in"` for `size_label` would have broken `sizeDimensions`/cache — resolved in favor of the machine form. (Confirmed by the size-math adversarial review, which flagged the plan's wording as a [high] hazard already pre-empted here.)
- **Bounds + DPI are function inputs**, not read from `lumaprints_mediums` (which has neither column). Production callers pass the subcategory's real bounds (+ canvas DPI 200); a hardcoded bounds config / live probe seeds them (Phase 3/4).
- **Default step 0.25"** (per Appendix C.4.3). For extreme/irrational aspects, a tier whose rounded short edge drifts >1% off-aspect is **dropped** (the builder will surface a "Large skipped" toast); the admin adds an aspect-locked custom size instead. Spec-compliant ("drop rather than distort").

### Phase 2 hardening (adversarial size-math review) — FIXED-FORWARD
A 3-lens adversarial verification confirmed the core math correct and surfaced low/medium edges, fixed in `harden(pricing)`: dpi≤0 now fails closed (was disabling the resolution ceiling); long axis chosen from the true longer pixel side (not the 3%-banded orientation); 1% aspect delta measured against the smaller ratio (validator-ok ⇒ LumaPrints-ok either way); width_in/height_in stored at the same ≤4-decimal precision as the label. The [medium] `orientationForSize` bucket-matching issue lives in the legacy `VariantsTab.runFixGenerate`, which Phase 4 replaces with aspect-based matching → resolved by the rebuild. +2 tests (25 total).

---

## PHASE 1 — Master crop + aspect-pad pipeline — DONE (2026-06-25)

- **1.1 Crop UI** — `src/components/admin/MasterCropModal.tsx` (new) mirrors `CropModal`'s 4-corner free-form drag/clamp/inversion math + box-shadow overlay, but: draws on a **web-res proxy** (the product's primary image — never the source TIFF), stores a **normalized 0..1 rect**, captures **border_mode** (full bleed / matte) + **matte color**, and POSTs JSON (no rasterization). Wired into the editor's "Artwork source" section (`edit/page.tsx`): an "Edit print crop / Crop master" button + a live `print_status` line (amber "no print-ready master yet" until ready). A real whitespace auto-detector does not exist in the repo (the storefront "matte" is only edge-color CSS sampling), so a fake "suggest crop" was NOT added — the modal defaults to the full image; auto-detect noted as future work.
- **1.2 Endpoint** `POST /api/admin/master-artworks/[id]/crop` (admin, zod-validated): rect bounds + `#RRGGBB` checks, writes `crop_box`/`border_mode`/`border_color`, sets `print_status='pending'` + `print_requested_at`, returns job status. **Never** processes the source file in-request. Extended the GET route to return the crop/print columns.
- **Migration 2026061603** (additive, applied) — `master_artworks.print_status` (none/pending/processing/ready/failed +check) / `print_requested_at` / `print_error` for job tracking (no queue table; Appendix A).
- **1.3 Worker** `scripts/process-master-crop.mjs` (Node + sharp, operator-run): claims a master, streams the original from `print-masters`, **region-extracts** the crop_box (libvips keeps an 800 MB TIFF low-memory), matte = uniform aspect-preserving `border_color` border, re-encodes **lossless deflate TIFF** with DPI carried (pure crop = zero resample), uploads to `print/<id>.tif` (resumable tus for >40 MB, direct fallback), writes `print_storage_path`/`print_width_px`/`print_height_px`/`print_updated_at`/`print_status='ready'`. Original never modified (revertible). `--id <uuid>` / `--all` / default-pending. Self-loads `.env.local`.
- **1.4 Resumable ingest** — `MasterArtworkUpload.tsx` now uploads masters ≥25 MB via **tus-js-client** (session-token auth so RLS still applies, 6 MB chunks, resume + progress bar); <25 MB keeps the direct upload.
- **1.5 Mint** — `mintLumaprintsImageUrl()` (`router.ts`) now prefers `master_artwork.print_storage_path` → `storage_path` → legacy `print_master_path`; both order-item queries select `print_storage_path`.
- **Gate GREEN**: typecheck ✓, lint ✓ (0 err), build ✓, `npm test` 116 passed/6 skipped.

Judgment calls (Phase 1):
- **Matte = uniform aspect-preserving border** (5%/side, `MATTE_FRACTION`). The plan's "pad to the crop's exact aspect" is ambiguous; preserving the crop aspect keeps the single-master/one-shape invariant (every size matches within 1%) while giving the cosmetic mat. Matte width is a constant, easily tuned.
- **Crop proxy = the product's primary web image** (assumed same framing as the master, per the regen pipeline). If no product image exists yet, the crop button is disabled with a hint. A per-master downscaled preview generator is future work.
- Worker is **operator-run** (lowest-effort per Appendix A); the editor polls `print_status`. A small always-on worker can run the identical code if one-click is wanted later.

---

## PHASE 3 — Live custom-size pricing + cache + margin — DONE (2026-06-25)

- **3.1 Live custom cost** — `lumaprints-cache.ts`: factored `costCentsForSize()`. A label IN the synced grid uses the stored cost (0 → "Set cost"); a CUSTOM label (not in the grid) is priced **live** via `getProductsCost([{subcategoryId, size:{width,height}, options}])` → base + Σ option prices → cents. Cache keys on `(medium, size_label)` unchanged (custom labels like `31x50` fit). Typed errors: **`SizeOutOfBoundsError`** (LumaPrints can't price it) + **`LumaprintsUnavailableError`** (keys missing / API down) in `pricing-errors.ts`; env-guarded by `lumaprintsConfigured()` (new, in `lumaprints.ts`).
- **3.2 Server helper** `priceCustomVariant(supabase, {productId, medium, widthIn, heightIn})` → `{cost_cents, shipping_cents, customerPrice_cents, grossMarginPct}`: machine `sizeLabel()` → `getCachedPrice` (live cost + worst-case CONUS shipping) → `getEffectiveProductMargin` cascade → `customerPriceCents` → true gross margin `(price−cost−shipping)/price`. Pure margin math stays in `variant-pricing.ts`. Quote zips from `site_settings.shipping_quote_zips` (4-corner default fallback).
- **Verified live**: `site_settings.default_margin_pct = "100"` (correct PERCENT scale; the `0.65` column default is a dormant landmine, never the live value — left as-is, out of scope), `shipping_quote_zips = ['33101','98101','04401','92101']`.
- **Gate GREEN**: typecheck ✓, lint ✓ (0 err), build ✓, `npm test` 116 passed/6 skipped.

Note: the **price-preview endpoint** (Appendix C.5) is built in Phase 4 (it's the builder UI dependency); Phase 3 is the cache + helper it calls.

---

## PHASE 4 — Admin product builder rebuild — DONE (2026-06-25)

- **Shared `buildPricedVariantRow()`** (`variant-insert.ts`) — factored bulk-create's priced-insert (byte-identical 24-key row: cents + mirrored legacy dollar cols + `fulfillment_metadata` snapshot) into one place; carries the new `is_custom_size`/`size_tier`/`aspect_ratio`/custom `name`/`is_active` fields + the `LEGACY_VARIANT_TYPE` map. `bulk-create` refactored onto it (passes `is_active:true` to preserve its semantics).
- **`subcategory-bounds.ts`** — canvas-family bounds (5–120×5–52 @ 200 DPI) + generic fallback. UI hint only; the live products-cost API is the authoritative gate.
- **`builder-context.ts`** — shared loader (product → master print px (prefers `print_*`, falls back to raw scan) → medium cfg → bounds), typed failures.
- **4.1 generate-defaults** `POST …/variants/generate-defaults {medium}` — `deriveDefaultTiers` from the master's print px, prices each, inserts S/M/L as **DRAFT** (`is_active:false`, `is_custom_size:false`, `size_tier`, `aspect_ratio`, `name="Small — 12 × 9 in"`). Idempotent (skips existing); returns `droppedTiers` for the "Large skipped" toast.
- **4.2 custom creator** `POST …/variants/custom {medium,name,width_in,height_in,...}` — server `validateCustomSize` guard (blocks bounds/resolution/aspect), inserts `is_custom_size:true`, `size_tier:null`, `aspect_ratio`, snapshot. Draft or Live.
- **C.5 price-preview** `POST …/variants/price-preview {medium,width_in,height_in}` — returns validation flags + live cost/shipping/price/gross margin; typed `SIZE_OUT_OF_BOUNDS`/`LUMAPRINTS_UNAVAILABLE` rendered inline; no variant written.
- **`[id]` PATCH** now also accepts `name` (inline custom rename).
- **VariantsTab rebuilt** (Appendix C): master banner (print px, aspect, max-at-DPI, border, Edit-crop) with amber "no print master" gate; per-medium **Generate S/M/L** (primary until defaults exist) + **Add custom size** + **Refresh prices**; disabled mediums show "Run Lumaprints sync"; table = Live toggle / inline-editable label (custom) / size+tier badge / cost(+set-cost) / margin % / price(+✎ override ★) / color-coded gross margin / Duplicate + Delete. **CustomSizeModal**: aspect-locked Height↔Width auto-fill (`partnerDimension`), live ✓/✗ validation row (`validateCustomSize`, pure import), debounced price-preview panel, margin + manual-price override, **Save as Draft / Save & Publish** (blocked with reason on hard fail). Reuses the proven debounced-PATCH/reload/delete machinery; legacy AddVariantModal + orientation "Fix & generate" removed.
- **Edit page**: `printVariants` mapper extended (name/width_in/height_in/is_custom_size/size_tier; new default = Draft); passes `master`{print px, border_mode, print_status} + `onEditCrop` (opens the Phase 1 crop modal). Removed the now-dead `primaryImageDims`/`orientationForAspect` fallback.
- **4.4 stats** — `ProjectHubClient` API Routes 121 → **134** (actual `route.ts` count after the new endpoints).
- **Gate GREEN**: typecheck ✓, lint ✓ (0 err), build ✓, `npm test` 116 passed/6 skipped.

Resolves the adversarial-review [medium] `orientationForSize` finding: the rebuilt builder matches sizes by the master aspect (`validateCustomSize`/`partnerDimension`), not the tol-0 orientation bucket — no near-square false "mismatch"/deletion.

---

## PHASE 5 — Storefront product detail rebuild — DONE (2026-06-25)

- **5.1 medium→size selector** — `ProductDetail.tsx` now derives `printVariants` by **`medium` set + `is_active` + `is_lumaprints_available`** (Draft = `is_active:false` → hidden), groups them into `printGroups` (one `<optgroup>` per medium, ordered canvas→framed→paper→…), each size ordered by area and labeled with **real dimensions + custom name** (`variantOptionLabel`: `"Life Size — 31 × 50 in"`, defaults already read `"Medium — 18 × 22 in"`). Originals + sold/commission fallbacks unchanged; add-to-cart payload unchanged (variantId + variant_type; new mediums route to `lumaprints`). `VariantSelector` reworked to take `printGroups`; `isPrint` now keys off `!!medium`.
- **5.2 no regressions** — grep confirmed: the only `size_label` parsing is the decimal-safe `sizeDimensions` + an exact-string cache match (no integer assumption). The funnel templates (`Gallery/Intimate/Bold`) and `pricing/refresh` still filter by `variant_type` but **keep working** because `buildPricedVariantRow` preserves the `canvas_print`/`framed_canvas_print` mirror for those two mediums; they render the new `v.name` labels fine. Gallery/zoom/related untouched.
- **Gate GREEN**: typecheck ✓, lint ✓ (0 err), build ✓, `npm test` 116 passed/6 skipped.

---

## PHASE 6 — Order submission (snapshot + corrected LumaPrints) — DONE (2026-06-25) [GO-LIVE]

> Money/fulfillment path — extra care. All snapshot code is null-safe and CANNOT break order creation; Stripe stays in its existing test/live config (unchanged); LumaPrints submit is sandbox-only until human sign-off.

- **6.1 Purchase-time snapshot** — `webhooks/stripe/route.ts`: two shared null-safe helpers (`loadOrderItemData`, `buildOrderItemRow`) applied to BOTH `handleCheckoutCompleted` + `handleElementsPaymentSucceeded`. The lookups now also fetch `products.master_artwork(print_storage_path)`, the variant's `medium/size_label/width_in/height_in/fulfillment_metadata`, and a `lumaprints_mediums` map. For PRINT items the order_items row now snapshots `medium`, `size_label`, `print_width_in`, `print_height_in`, `lumaprints_subcategory_id`, `lumaprints_option_ids` (medium config → `fulfillment_metadata` fallback), `print_storage_path` (the product master), and `external_item_id`. The row `id` is pre-generated so `external_item_id = order_items.id`; the resume-safe `ignoreDuplicates` upsert preserves the original snapshot on redelivery.
- **6.2 Corrected order client** — `integrations/lumaprints.ts`: `submitOrder` → `POST /api/v1/orders` with `{externalId, storeId:Number(STORE_ID), shippingMethod:'default', productionTime:'regular', recipient, orderItems:[{externalItemId, subcategoryId, quantity, width, height, file:{imageUrl}, orderItemOptions}]}`; `getOrder` → `/api/v1/orders/{n}`; `getShipments` → `/api/v1/shipments/{n}`. New typed `LumaprintsApiError` (carries `.status`) so a 406 is distinguishable; `checkImageConfig` wrapper added for optional defensive use.
- **6.3 Fulfillment router** — `validateLumaprintsItem` now reads dims/subcategory/options from the **order_item snapshot** (live medium config / product master only as fallback), requires positive `print_width_in/height_in`, and carries `width/height/externalItemId/quantity` in the validated payload; mints the **`print_storage_path`** signed URL (`mintSignedUrl` + `productMasterPath` fallback). New `parseRecipient()` (first/last split, `zipCode`…) for LumaPrints; `parseShippingAddress` kept for Printful. `submitToLumaprints` builds the documented `orderItems`.
- **6.4 406 handling** — on `LumaprintsApiError` status 406 both `routeOrderToFulfillment` and `retryFulfillmentForItem` mark the item `failed_validation` (not generic `failed`) and log the LumaPrints 406 body (expected-vs-actual). The 1% aspect + DPI are already satisfied by the padded master (Phase 1) + the builder's quality gate (Phase 2/4); the router relies on submit's auto-check rather than a pre-call.
- **Gate GREEN**: typecheck ✓, lint ✓ (0 err), build ✓, `npm test` 116 passed/6 skipped.

Judgment calls / human notes (Phase 6):
- **Recipient name**: the order's `shipping_address` (from Stripe) stores only the address, not a name, so `parseRecipient` falls back to `Customer`/`Customer` (same limitation as the old `parseShippingAddress`). Capturing the real recipient name end-to-end is a follow-up (webhook would need to persist `shipping_details.name`).
- LumaPrints **default billing address** must be set in the dashboard or submit 400s ("Default billing address not set") — on the human action list.
- Fractional width/height: the documented `/orders` schema accepts `number`; the builder mostly emits whole/quarter inches and the padded master guarantees the 1% rule. Confirm fractional acceptance in the sandbox dry-run (Phase 8.3).

---

## PHASE 7 — Status → portal → email — DONE (2026-06-25)

- **7.1 LumaPrints webhook** — `webhooks/lumaprints/route.ts`: on `order.shipped`/`shipment.created`, after the order_items update it resolves the buyer email + canonical `orders.id` (`resolveOrderForReference`) and calls **`notifyShipped()`** (the previously-uncalled `sendShippingUpdate`, now wrapped replay-safe with a `shipped:<orderId>` dedupe in `triggers.ts`) + **`recomputeOrderStatus()`**. `order.delivered` also rolls up. Both calls are exception-safe so the webhook still returns 200.
- **`recomputeOrderStatus(supabase, orderId)`** (`lib/fulfillment/order-status.ts`, new) — rolls `orders.status`: all delivered→`delivered`; all shipped/delivered→`shipped`; some→`partially_fulfilled`; else leave; never downgrades a cancelled/refunded order; reads ALL items for the order.
- **7.2 Status-poll cron** `api/cron/lumaprints-status/route.ts` (CRON_SECRET-guarded, `runtime=nodejs`, added to `vercel.json` `*/30`): for `order_items` in `submitted`/`in_production` with an `external_order_id`, polls `getOrder()`, maps `orderStatus`→our status, pulls best-effort tracking from `getShipments()`, updates items, fires `notifyShipped` once (dedupe), and rolls up `orders.status`. Capped at 15 orders/run (≤2 calls each, under the 40 req/min limit) — deferred count is reported, not silently dropped. Backstops missed webhooks.
- **7.3 Customer order detail** `account/orders/[id]/page.tsx` (new, auth-gated): ownership verified via the RLS session client, then items read via the service client (order_items aren't exposed to buyers via RLS — same pattern as the receipt). Shows each item (title, medium, real size, qty, price), per-item `fulfillment_status`, and carrier/tracking link; order totals + shipping address. The orders **list** rows now link to it.
- **7.4** — `sendOrderConfirmation` + `sendPostPurchaseEmail` unchanged; the shipping email uses the built-in `sendShippingUpdate` template.
- **Stats** — `ProjectHubClient` Public Pages 38→39, API Routes 134→135.
- **Gate GREEN**: typecheck ✓, lint ✓ (0 err), build ✓, `npm test` 116 passed/6 skipped.

### Money-path adversarial verification (Phase 6) — FIXED-FORWARD + documented
A 3-lens adversarial review of the order path confirmed it correct + safe (null-safe snapshot, idempotency spine intact, contract-faithful submit). Cheap fixes applied in `harden(fulfillment)`: (A, medium) the Stripe ship-to **name** is now persisted in `shipping_address` in both webhook handlers, so LumaPrints/Printful no longer ship to "Customer Customer"; (B, low) `submitOrder` throws a clear error if `LUMAPRINTS_STORE_ID` is unset/non-numeric (was emitting `storeId:null` → 400); (C, low) `validateLumaprintsItem` now falls back to the live `variant.width_in/height_in` (added to the Variant select) when the snapshot is absent, matching its comment. Two pre-existing residuals documented in `KNOWN_RISKS.md` (#order-path-verify-2026-06-25): duplicate-order on **manual** retry of a `failed` print item (human caution to verify in the dashboard first), and stranded-`pending` items on a transient routing throw (needs a re-route sweep). Neither is release-blocking; both are pre-existing.

---

## PHASE 8 — Tests, gates, sandbox dry-run — DONE (2026-06-25)

- **8.1 Unit/golden** — `test/order-path.test.ts` (11): `grossMarginPct` (now a shared pure export in `variant-pricing.ts`, refactored out of VariantsTab + lumaprints-cache), `customerPriceCents`, `recomputeOrderStatus` transitions (all-delivered/all-shipped/partial/none/terminal-guard/no-op), and the **`submitOrder` POST /api/v1/orders body shape** (asserts externalId, `storeId:42` as a number, recipient.zipCode, and each orderItem's externalItemId/subcategoryId/quantity/width/height/file.imageUrl/orderItemOptions; plus the STORE_ID guard throws instead of sending `storeId:null`). The size-tier golden tests (25) + `sizeDimensions` decimals are from Phase 2.
- **8.2 Master crop quality** — extracted the pure crop transform to `scripts/lib/crop-transform.mjs` (worker now imports it); `test/master-crop.test.ts` (node env, 3): full_bleed → lossless deflate TIFF, exact crop dims, **DPI preserved**, original untouched; matte → aspect-preserving border; **losslessness** → the output crop pixel is byte-identical to the source pixel (no resample).
- **8.3 Sandbox dry-run** — `scripts/lumaprints-sandbox-dryrun.mjs` written (HUMAN-GATED): refuses unless `LUMAPRINTS_BASE_URL` is the sandbox host, then prices a custom size, runs `checkImageConfig`, submits ONE order, reads it back, and saves to `audit/diag/`. **Not executed here** (needs sandbox keys + a public master URL) — operator runs it before authorizing the first production order.
- **8.4 Final gate** — typecheck ✓, lint ✓ (0 errors), build ✓, `npm test` **130 passed / 6 skipped** (+14 this phase), advisors unchanged (2 pre-existing WARNs, **0 ERRORs, no new criticals**).

---

## Definition of done — verification

- ✅ Legacy print variants gone (844 deleted; 22 originals preserved); each printable product can generate **draft** S/M/L defaults with real-dimension labels; Margaret can add aspect-locked **custom** variants (name + bidirectional height/width auto-fill), see live LumaPrints cost + gross margin, override price, and flip Draft→Live to publish.
- ✅ Storefront shows live variants grouped by medium with true sizes; add-to-cart → checkout → the order reaches LumaPrints via the corrected `POST /api/v1/orders` with `width/height` + the padded master URL. (LumaPrints submit verified by the payload-shape test + the contract review; the actual sandbox order is the human dry-run.)
- ✅ Order status + tracking flow to the customer (shipping email + `/account/orders/[id]`) and roll up to `orders.status`; the `lumaprints-status` cron backstops the webhook.
- ✅ The master crop tool works server-side on full-res TIFFs (lossless, non-destructive, DPI-preserving — tested); originals preserved.
- ✅ All existing functionality intact; `main` builds green; advisors show no new criticals.

## Decisions & human action

**What only a human can do (go-live gates):**
1. Set/confirm in **Vercel**: `LUMAPRINTS_API_KEY` / `LUMAPRINTS_API_SECRET` / `LUMAPRINTS_STORE_ID` (+ a sandbox set), `LUMAPRINTS_WEBHOOK_SECRET`, and `CRON_SECRET`. Set the LumaPrints **default billing address** in the dashboard (submit 400s without it). Subscribe the `shipping` webhook to `/api/webhooks/lumaprints`.
2. Per artwork: choose **full_bleed vs matte** and **crop the master once** (the editor's "Crop master / set print area"), then run the operator worker `node scripts/process-master-crop.mjs` to generate the print-ready master (`print_status` → ready).
3. **Generate S/M/L** + add any custom sizes per product, **sign off the prices/margins**, and flip variants **Draft → Live**.
4. Run `scripts/lumaprints-sandbox-dryrun.mjs` against the **sandbox**, confirm the order echoes the dimensions + a shipping-webhook simulation updates item status/`orders.status`/email/portal, THEN authorize the first **production** order. Keep Stripe in its current mode.
5. Decide where the crop worker runs long-term (operator-run `scripts/` job vs a small always-on worker) — see Appendix A.

**Carry-overs / residual risk (non-blocking):** the two `KNOWN_RISKS.md` items (#order-path-verify-2026-06-25); the dormant `site_settings.default_margin_pct=0.65` column-default landmine (live value is correct `100`); recipient name now persisted but only when Stripe collected it.

---

## Completeness audit (final) — FIXED-FORWARD

A 3-lens audit of every phase against the plan + Definition of Done found the build genuinely shipped, with **one major functional gap** (fixed) + minor UI-fidelity items:

- **[major, FIXED] Customer order portal queried a non-existent column.** `account/orders/[id]/page.tsx` (and the **pre-existing** list page I copied from) filtered `orders.user_id`, but `orders` has `profile_id` (RLS: `auth.uid() = profile_id`), and the order-creation path never linked orders to a buyer. So the portal would 404 every order once real orders exist. Fixed: both pages now query `.eq('profile_id', user.id)` (matching the RLS), and **the Stripe webhook now links each order to a profile by email** (`resolveProfileId`, best-effort/null-safe) in both handlers — so a registered buyer's orders appear under `/account/orders`. Verified the `orders` RLS + `profiles`/`orders` columns live.
- **[minor, FIXED] Appendix C fidelity**: banner now shows `…px @ {dpi}DPI`; the Cost column shows a muted `as of {last_priced_at}`; the custom modal shows the `Implied margin: NN%` readout when manual price is on.
- **[minor, ACCEPTED] Appendix C cosmetics deferred** (capability fully present, not functional gaps): the custom-size modal has no Medium `<select>` (it opens scoped to the section's medium — one card per medium); the aspect-locked pair has the lock chip but no per-field "auto/driver" chip. Documented as accepted minor deviations.

- **Gate GREEN** (post-fix): typecheck ✓, lint ✓ (0 err), build ✓, `npm test` 130 passed/6 skipped; advisors 0 new criticals.

---

## Gap-closure — flawless end-to-end ordering (plan: `enchanted-knitting-sutton.md`) — DONE (2026-06-26)

Verified the ordering path with 3 independent audits (money-path, sizing, LumaPrints-model). **Core confirmed correct** (S/M/L locked to exact master aspect; confirmed-payment auto-fires the LumaPrints order with no manual step; custom variants aspect-locked + live priced; correct per-variant size sent). Clarified that **LumaPrints has no "create product once" API** — it's order-driven, and the build's correct equivalent is "crop the master once, reuse it per order" (no per-order reprocessing). Closed the gaps that could make an order need Margaret's intervention:

- **Shared `checkFulfillable`** (`src/lib/fulfillment/fulfillability.ts`, new + 6 tests): a variant is fulfillable only with a configured+enabled medium, a **print-ready master** (`print_status='ready'` + `print_storage_path`), and a frame-style option for framed (102xxx) subcategories.
- **G1/G4 Live-flip gate** — `PATCH /api/admin/variants/[id]` rejects `is_active:true` (409 `NOT_FULFILLABLE`) unless `loadVariantFulfillability` passes; `VariantsTab` disables the Live toggle (with a reason) until the master is ready + medium configured. A variant literally cannot be published unless it will fulfill.
- **G1/G4 storefront filter** — `getProductBySlug` now joins the master's `print_status`; `ProductDetail` offers **no** print variants unless the master is print-ready (belt-and-suspenders so an un-ready variant can't reach the cart).
- **G1/G3/G4 order-time safety net** — the Stripe webhook loads `print_status` + medium `enabled`, and after creating order_items emails Margaret (`notifyOrderNeedsAttention`, no-throw) if any **paid** print item isn't fulfillable — nothing fails silently. Order still created.
- **G2 bulk-create** — the legacy endpoint now creates **drafts** (`is_active:false`), so it can't publish an unfulfillable variant (and must pass the Live gate to go Live).
- **G5 payment hardening** — `handleCheckoutCompleted` skips the product path unless `payment_status` is `paid`/`no_payment_required`; added a `checkout.session.async_payment_succeeded` case running the same idempotent path — safe if any delayed-payment method is ever enabled.
- **Gate GREEN**: typecheck ✓, lint ✓ (0 err), build ✓, `npm test` **136 passed**/6 skipped.

Net: no art piece or variant can reach checkout unless it will fulfill cleanly at LumaPrints with the correct size; anything that still slips through alerts Margaret instead of failing silently.
