# Claude Code Prompt — Product Builder + Variant System + LumaPrints Ordering (Rebuild)

**Run from repo root `~/Margaret-Edmondson`** (Next.js 16 App Router + Supabase + Stripe + Resend; package `margaret-edmonson`; Supabase ref `klwkajukicsoiwpsgftt`). Read **`docs/lumaprints-api-reference.md`** (exact API contract) before touching any LumaPrints code.

You are rebuilding the **print variant system, the admin product builder, the storefront product detail page, and the LumaPrints ordering pipeline** so Margaret can sell her originals at **true-to-aspect custom print sizes**. The schema migrations are already written (`supabase/migrations/2026061601_*`, `2026061602_*`). Build the code that uses them.

> **Two earlier docs feed this one:** `docs/lumaprints-api-reference.md` (the exact API) and `claude-code-prompt__custom-sizing-lumaprints.md` (the original order-fix spec). **This prompt supersedes that one** and is the authoritative build; reuse its order-payload details via the API reference.

---

## 0. OPERATING RULES

> **Prime directive: DO NOT STOP. Fix forward.** Failed gate → fix and re-run. Missing key → write complete env-guarded code and log it.

1. Work on **`main`** (no branches). Before starting: `git tag -a restore/pre-builder-rebuild -m "pre builder+ordering rebuild"` and push. Tag `restore/pre-phaseN` before each phase that mutates the DB.
2. Commit per task; push to `main`. Maintain `audit/BUILDER-REBUILD-LOG.md` (DONE / FIXED-FORWARD / DEFERRED + judgment calls).
3. **Phase Gate after every phase:** `npm run typecheck` → `npm run lint` → `npm run build` → `npm test`. Fix forward until green.
4. **No regressions.** Do **NOT** remove or break existing functionality. The ONLY things being replaced are (a) the legacy print-variant catalog system and (b) the 844 existing print variants. Specifically **keep**: the originals-for-sale flow (22 `variant_type='original'` variants), the existing **web-image** crop tool (`CropModal` + `/api/admin/product-images/[id]/crop`), orders/checkout/Stripe, email automations, CRM, media library, admin orders pages.
5. **No `src/middleware.ts`** (middleware is `src/proxy.ts`). Branding: **ArtByME**.
6. **Money/fulfillment path = extra care.** Don't flip Stripe to live. Test LumaPrints against **sandbox** (`https://us.api-sandbox.lumaprints.com`) only; never place a production order until human sign-off. Make any new DB triggers/webhook code exception-safe so they can never break order creation.
7. DB changes are **additive + idempotent** (the two migrations already are). Take a `product_variants` backup before applying `2026061602` (Phase 0).

---

## 1. Verified context (confirmed against repo + production 2026-06-16)

**Catalog:** 47 products · 866 variants = **22 originals (keep) + 844 print variants (retire & regenerate)** · **0 orders / 0 order_items** (safe to reshape the order path). 8 standard mediums exist; only `canvas` (subcat 101002) and `framed_canvas` (102002, requires frame-style option) are enabled today.

**Margin model (keep — do not reinvent):** `price = (lumaprints_cost_cents + shipping_cost_cents) × (1 + margin_pct/100)`, manual override wins. Cascade: `variant.margin_override_pct → product.default_margin_pct → category.default_margin_pct → site_settings.default_margin_pct → 100`. Canonical setters: `customerPriceCents()` (`src/lib/pricing/variant-pricing.ts`) and the `reprice_variants()` RPC. The editor should also **display the true gross margin %** = `(price − cost − shipping) / price`.

**New columns (from migration 2026061601):**
- `product_variants`: `is_custom_size bool`, `size_tier text('S'|'M'|'L'|null)`, `aspect_ratio numeric`. `is_active` = **live/draft** flag (true = live).
- `master_artworks`: `crop_box jsonb`, `print_storage_path`, `print_width_px`, `print_height_px`, `border_mode('full_bleed'|'matte')`, `border_color`, `print_updated_at`. Original scan stays in `storage_path/width_px/height_px` (crop is non-destructive).
- `order_items`: `medium`, `size_label`, `print_width_in`, `print_height_in`, `lumaprints_subcategory_id`, `lumaprints_option_ids int[]`, `print_storage_path`, `external_item_id` (purchase-time snapshot).

**Key files (confirmed):**
- Storefront: `src/components/shop/ProductDetail.tsx` (filters variants by `variant_type` + `is_active` + `is_lumaprints_available`).
- Admin builder: `src/components/admin/VariantsTab.tsx`, `AddVariantModal`, `src/app/(admin)/admin/products/[id]/edit/page.tsx` (passes `artworkOrientation` from master px).
- Variant APIs: `src/app/api/admin/variants/{bulk-create,refresh,[id],bulk-delete}/route.ts`.
- Pricing: `src/lib/pricing/{margin.ts,variant-pricing.ts,mediums.ts,medium-config.ts,lumaprints-cache.ts}`; `sizeDimensions()` is **integer-only — must accept decimals** (see Phase 2).
- Crop (web images): `src/components/admin/CropModal.tsx` (client canvas → WebP), `src/app/api/admin/product-images/[id]/crop/route.ts` (+ `revert`). **Pattern to mirror for masters, but masters need server-side processing.**
- Master mint: `mintLumaprintsImageUrl()` in `src/lib/fulfillment/router.ts` (prefers `master_artwork.storage_path`; must prefer `print_storage_path` after this build).
- Order path: `src/app/api/checkout/{route,intent}/route.ts` → `src/app/api/webhooks/stripe/route.ts` (`handleCheckoutCompleted`, `handleElementsPaymentSucceeded` create `orders`+`order_items`) → `routeOrderToFulfillment()` in `src/lib/fulfillment/router.ts` → `submitOrder()` in `src/lib/integrations/lumaprints.ts`.
- LumaPrints webhook: `src/app/api/webhooks/lumaprints/route.ts`. Emails: `src/lib/email/{send.ts,triggers.ts}` (`sendOrderConfirmation`, `sendShippingUpdate` **defined but never called**, `sendPostPurchaseEmail`). Portal: `src/app/(marketing)/account/orders/page.tsx` (list only — **no detail/tracking page**). Admin orders: `src/app/(admin)/admin/orders/**`.
- `sharp` (libvips) is in `node_modules` (used by `scripts/`) but **not** a declared app dependency. `tus-js-client` is a dependency but **not yet used** in `src/`.

**LumaPrints contract (see `docs/lumaprints-api-reference.md`):** pricing (`POST /api/v1/pricing/products`) already takes custom `{width,height}`. The order client is **wrong** and must be fixed: submit is `POST /api/v1/orders` (not `/stores/{id}/orders`) with `{externalId, storeId, recipient, orderItems:[{externalItemId, subcategoryId, quantity, width, height, file:{imageUrl}, orderItemOptions}]}`; get is `/api/v1/orders/{n}`; shipments `/api/v1/shipments/{n}`. **Submit auto-validates image aspect within 1% of ordered W:H (else 406)** and enforces `requiredDPI` (canvas 200).

---

## Locked design decisions (from Skylar)

1. **Defaults = S/M/L** per medium, sized from each master's aspect ratio + resolution, **label shows the real size** (e.g. `Medium — 18 × 22 in`).
2. Margaret can add **custom-size variants** per medium with a **custom name** (e.g. "Life Size"). Enter **height → width auto-fills** from the locked aspect; enter **width → height auto-fills** (bidirectional, aspect-locked).
3. Aspect ratio + max size come from the **print-ready master** (`master_artworks`, cropped via Phase 1).
4. **Build the print file once per master** (cropped + padded to its aspect), not at order time. All sizes of a piece share one shape, so one master serves every size and always passes the 1% check.
5. **Variant lifecycle:** created as **Draft** (`is_active=false`); flip to **Live** to show on the storefront.

## Gap analysis — blanks this build fills (beyond Skylar's outline)

- **Order can't reach LumaPrints today** (wrong endpoint/shape, no width/height) → Phase 6.
- **No purchase-time snapshot** → a later variant edit would corrupt fulfillment → snapshot on `order_items` (Phase 6).
- **`orders.status` never reflects item progress**; **shipping/tracking email never sends**; **no status-poll fallback** (webhook-only); **customer portal has no per-order detail or tracking** → Phase 7.
- **1% aspect + DPI** enforcement → handled by the padded master (Phase 1) + a builder-time quality gate (Phase 2).
- **800 MB TIFF crop** can't run in-browser or in a serverless route → server-side libvips worker + resumable upload (Phase 1; architecture in the Appendix).
- **`sizeDimensions` drops decimals** → custom sizes silently price at $0 → fix (Phase 2).
- **Master mint ignores the cropped print file** → prefer `print_storage_path` (Phase 1/6).

---

## PHASE 0 — Preflight, backups, migrations

0.1 `npm ci`; Phase Gate; record baseline. Tag `restore/pre-builder-rebuild`.
0.2 **Backup before destructive data migration:** `select *` of `product_variants` → `audit/backups/<ts>/product_variants.json` (service client script). Snapshot `master_artworks`, `products` too.
0.3 **Apply migrations** `2026061601_variant_custom_sizing.sql` then `2026061602_retire_legacy_print_variants.sql` via Supabase MCP `apply_migration` (or `supabase db push`). Re-query: confirm new columns exist; `select count(*) from product_variants where coalesce(variant_type,'')<>'original'` = 0; originals still = 22. Run advisors before/after → `audit/`.
0.4 **Add `sharp` as a declared dependency** (`npm i sharp`) so the master-crop worker has libvips at runtime. Confirm `package.json`.
0.5 Add a sandbox env note: master/order tests use `LUMAPRINTS_BASE_URL=https://us.api-sandbox.lumaprints.com`.

---

## PHASE 1 — Master crop + aspect-pad pipeline (server-side, non-destructive)

> Produces the **print-ready master** (`master_artworks.print_storage_path`) that every variant of a piece prints from. See the Appendix for why this is a worker, not a browser/serverless task.

1.1 **Crop-rectangle UI (reuse `CropModal` shape).** Add a "Crop master / set print area" action in the product editor's Artwork Source section (`edit/page.tsx`). It loads a **web-resolution proxy** of the master (the existing web image or an on-demand downscaled preview — never the TIFF) and lets the admin drag a crop box (reuse `CropModal`'s handles/overlay). On save it sends a **normalized rectangle** `{x,y,w,h}` in 0..1 plus the chosen `border_mode` (`full_bleed`|`matte`) and `border_color` — **not** a rasterized image. Also expose the existing auto-crop logic as a "suggest crop" default (the matte/whitespace detector you already built for web photos can seed the rectangle).

1.2 **New endpoint `POST /api/admin/master-artworks/[id]/crop`** (admin-only): validates the rect, writes `crop_box`, `border_mode`, `border_color` to `master_artworks`, and **enqueues a crop job** (see 1.3). Returns job status. Do not process the TIFF in the request.

1.3 **Crop worker `scripts/process-master-crop.mjs`** (Node + `sharp`, runs outside the serverless runtime — a manually/queue-triggered job; low volume makes a script acceptable):
   - Download the original master from `print-masters` (`storage_path`) to `/tmp` (stream; `sharp({ limitInputPixels: false })`, `sharp.cache(false)`).
   - Apply `crop_box` (extract region — libvips reads regions without loading the whole image, so an 800 MB TIFF stays low-memory).
   - **Pad to the crop's exact aspect** if `border_mode='matte'` (extend with `border_color`); for `full_bleed`, the extract already defines the shape. The result's pixel aspect **is** the print aspect, guaranteeing the 1% rule.
   - Re-encode **lossless TIFF** (LZW/ZIP, preserve DPI). A pure crop = no resampling = **zero quality loss**.
   - **Resumable upload** the result to `print-masters` at `print/<id>.tif` via `tus-js-client` (already a dep). Update `master_artworks`: `print_storage_path`, `print_width_px`, `print_height_px`, `print_updated_at`. **Never overwrite the original** (`storage_path` stays — revertible).
   - Idempotent + logged.

1.4 **Resumable upload for big master ingest.** Replace the current direct browser upload of masters with a `tus-js-client` resumable upload to Supabase Storage (supports multi-GB; the plain client upload caps out). Keep small-file direct upload as a fallback.

1.5 **Mint the cropped file.** In `mintLumaprintsImageUrl()` (`src/lib/fulfillment/router.ts`), prefer `master_artwork.print_storage_path` → else `storage_path` → else legacy `print_master_path`.

1.6 Phase Gate. Commit `feat(masters): non-destructive server-side crop + aspect-pad + resumable upload`.

---

## PHASE 2 — Aspect-locked size math + quality/aspect/bounds checks (pure, tested)

2.1 **Decimal sizes:** fix `sizeDimensions()` in `src/lib/pricing/mediums.ts` to parse decimals (`/^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i`). Unit-test decimals + rejects.

2.2 **New pure module `src/lib/pricing/size-tiers.ts`:**
   - `aspectFromMaster(printWidthPx, printHeightPx)` → ratio + orientation.
   - `partnerDimension(known, axis, ratio)` → the locked complementary inches (this powers the builder's bidirectional auto-fill: height→width and width→height).
   - `deriveDefaultTiers(printWidthPx, printHeightPx, bounds, dpi)` → S/M/L preserving the exact aspect, **all the same shape**, clamped to subcategory min/max and to the resolution ceiling. Long-edge targets `{S:12, M:20, L:30}` (constant, site-setting overridable). Drop a tier rather than distort if it can't fit.
   - `validateCustomSize({widthIn, heightIn}, {ratio, bounds, printPx, dpi})` → `{ ok, reasons[] }` checking: within `[minW,maxW]×[minH,maxH]`; **resolution** `widthIn*dpi ≤ printWidthPx` and `heightIn*dpi ≤ printHeightPx` (canvas dpi 200); **aspect within 1%** of `ratio`.
   - Golden tests: Poolside 4×12, Dig 9.25×11, Dolphin 7.5×9.5, a square, an over-resolution request (must fail), an out-of-bounds request (must fail).

2.3 Phase Gate. Commit `feat(pricing): aspect-locked size tiers + quality/aspect/bounds validation`.

---

## PHASE 3 — Live custom-size pricing + cache + margin

3.1 In `src/lib/pricing/lumaprints-cache.ts` `fetchLivePrice`: when a `size_label` isn't in the medium's standard grid, fetch base cost **live** via `getProductsCost([{subcategoryId, size:{width,height}, options}])` (sum base + option prices → cents). Cache by `(medium, size_label)` (custom labels like `"31x50"` fit). Shipping already quotes live by W×H. Add a typed `SIZE_OUT_OF_BOUNDS` error surfaced to the builder. Env-guard missing keys.

3.2 **Server helper** `priceCustomVariant(supabase, {productId, medium, widthIn, heightIn})` → `{ cost_cents, shipping_cents, customerPrice_cents, grossMarginPct }` reusing `getCachedPrice` + `customerPriceCents` + the effective margin cascade. Pure margin math stays in `variant-pricing.ts`.

3.3 Phase Gate. Commit `feat(pricing): live custom-size pricing + gross-margin calc`.

---

## PHASE 4 — Admin product builder rebuild (variants)

4.1 **Regenerate default S/M/L.** New endpoint `POST /api/admin/products/[id]/variants/generate-defaults` `{ medium }`: derive tiers (Phase 2) from the master's **print** px, price each (Phase 3), insert variants with `is_custom_size=false`, `size_tier`, `aspect_ratio`, `width_in/height_in`, `medium`, `size_label = "{W} × {H} in"`, `name = "{Small|Medium|Large} — {W} × {H} in"`, `is_active=false` (draft). Idempotent. Factor a shared `insertPricedVariant()` helper out of `bulk-create` so both paths are identical.

4.2 **Custom variant creator** (in `VariantsTab.tsx`, replacing the catalog-only `AddVariantModal`):
   - Fields: **Name/label** (free text), **Medium**, and **Height** / **Width** inputs that are **aspect-locked**: editing one recomputes the other via `partnerDimension()` (IMPORTANT — never let them drift; round to the medium's allowed precision).
   - Live: run `validateCustomSize()` → show ✅/⚠️ for **resolution (master big enough?)**, **bounds**, **aspect (≤1%)**. Block save on hard failures with a plain-English reason.
   - Live: call a price-preview endpoint → show LumaPrints cost, shipping, computed price, and **gross margin %**. Allow a **manual price override** (writes `manual_price_override_cents`; back-computes/display the resulting margin).
   - Save → `POST /api/admin/products/[id]/variants/custom` inserts with `is_custom_size=true`, `size_tier=null`, the dims, `aspect_ratio`, snapshot of `lumaprints_subcategory_id`/`option_ids` in `fulfillment_metadata`, `is_active=false`.
   - **Draft/Live toggle** per variant (writes `is_active`); reuse the existing debounced PATCH `/api/admin/variants/[id]`.
4.3 Keep "Refresh prices" (`/api/admin/variants/refresh`) working for custom variants (Phase 3 makes it re-price live). Keep bulk-delete.
4.4 Update the dashboard stats strip in `src/app/(admin)/admin/ProjectHubClient.tsx` (route counts changed).
4.5 Phase Gate. Commit `feat(admin): rebuilt variant builder — S/M/L defaults + aspect-locked custom sizes + draft/live`.

---

## PHASE 5 — Storefront product detail rebuild

5.1 Rebuild the print-purchase section of `src/components/shop/ProductDetail.tsx` to be **medium → size** driven (not the legacy `variant_type` split): group live print variants (`is_active && is_lumaprints_available`) by `medium`; within a medium list sizes (defaults + custom) ordered by area, each labeled with **real dimensions** + custom name when present (e.g. `Life Size — 31 × 50 in`). Show the selected variant's price; keep the original-artwork purchase path and "commission/sold" fallbacks unchanged. Add-to-cart payload unchanged (variantId-based).
5.2 Confirm nothing else assumes integer `size_label` or the old `canvas_print/framed_canvas_print` `variant_type` (grep). Keep gallery/zoom/related as-is.
5.3 Phase Gate. Commit `feat(shop): medium→size variant selector with true dimensions`.

---

## PHASE 6 — Order submission (snapshot + corrected LumaPrints)

6.1 **Snapshot the print spec at purchase** in the Stripe webhook (`handleCheckoutCompleted` + `handleElementsPaymentSucceeded`, `src/app/api/webhooks/stripe/route.ts`): when inserting each `order_items` row for a print variant, copy `medium`, `size_label`, `print_width_in=variant.width_in`, `print_height_in=variant.height_in`, `lumaprints_subcategory_id` + `lumaprints_option_ids` (from the medium config / variant metadata), and `print_storage_path` (the master's `print_storage_path`). `external_item_id = order_items.id`.
6.2 **Rewrite the order client** `src/lib/integrations/lumaprints.ts` to the documented contract (see `docs/lumaprints-api-reference.md`): `submitOrder` → `POST /api/v1/orders` with `{externalId, storeId:Number(STORE_ID), shippingMethod:'default', productionTime:'regular', recipient, orderItems:[{externalItemId, subcategoryId, quantity, width, height, file:{imageUrl}, orderItemOptions}]}`; `getOrder` → `/api/v1/orders/{n}`; `getShipments` → `/api/v1/shipments/{n}`.
6.3 **Fulfillment router** (`src/lib/fulfillment/router.ts`): in `validateLumaprintsItem` read dims/subcategory/options from the **order_item snapshot** (not the live variant), require positive `print_width_in/print_height_in`, and add `width/height` to the validated payload; add a `parseRecipient()` (firstName/lastName/addressLine1/zipCode…) for LumaPrints and **leave `parseShippingAddress` for Printful**. Build `orderItems` per 6.2. Mint the **`print_storage_path`** signed URL.
6.4 The 1% aspect + DPI are already satisfied because the print master was cropped/padded to the variant's shape (Phase 1) and the builder blocked over-resolution sizes (Phase 2). Add a defensive `checkImageConfig` call (or rely on submit's auto-check) and, on `406`, mark `failed_validation` with the expected-vs-actual dims logged.
6.5 Phase Gate. Commit `fix(fulfillment): purchase-time snapshot + corrected LumaPrints order submit [GO-LIVE]`.

---

## PHASE 7 — Status → portal → email (fill the gaps)

7.1 **LumaPrints webhook** (`src/app/api/webhooks/lumaprints/route.ts`): on shipment events, after updating `order_items` (status + `tracking_number/tracking_url/carrier/shipped_at`), **call `sendShippingUpdate()`** (currently never called) to the buyer with the tracking link, and **roll up `orders.status`** via a helper `recomputeOrderStatus(orderId)` (all items delivered → `delivered`; all shipped/delivered → `shipped`; some → `partially_fulfilled`; else leave `processing`). Make the rollup exception-safe.
7.2 **Status-poll cron** `src/app/api/cron/lumaprints-status/route.ts` (CRON_SECRET-guarded; add to `vercel.json`): for `order_items` with `fulfillment_status IN ('submitted','in_production')` and an `external_order_id`, call `getOrder()`, map `orderStatus` → our status, update tracking, fire the shipping email once (dedupe), roll up order status. This backstops missed webhooks.
7.3 **Customer order detail page** `src/app/(marketing)/account/orders/[id]/page.tsx` (auth-gated, user owns the order): show each item (title, medium, size, qty, price), per-item `fulfillment_status`, and tracking carrier/number/link. Link rows from `account/orders/page.tsx`. Keep the existing list page.
7.4 Keep `sendOrderConfirmation` + `sendPostPurchaseEmail` as-is. Add the shipping email to the admin-managed automation set if trivial; otherwise built-in template is fine.
7.5 Phase Gate. Commit `feat(orders): shipping email + status rollup + status-poll cron + customer order detail/tracking`.

---

## PHASE 8 — Tests, gates, sandbox dry-run

8.1 Unit/golden: `size-tiers` (aspect lock, bounds, resolution ceiling, 1% aspect, partner-dimension auto-fill), `sizeDimensions` decimals, **order-payload shape** test (assert the built `POST /api/v1/orders` body matches `docs/lumaprints-api-reference.md` exactly, with width/height/file.imageUrl/externalItemId), `recomputeOrderStatus` transitions, `customerPriceCents` + gross-margin.
8.2 **Master crop quality test:** crop a sample TIFF with the worker; assert output is lossless TIFF, correct aspect (±0 for full_bleed, exact for matte), DPI preserved, original untouched.
8.3 **Sandbox dry-run (human-gated):** with sandbox keys, price a custom size, submit one sandbox order with nonstandard W×H + the padded master URL, `GET /api/v1/orders/{n}` and confirm it echoes the dimensions; simulate a shipping webhook → confirm item status, `orders.status`, the shipping email, and the portal page all update. Save to `audit/diag/`. **Never production.**
8.4 Final Phase Gate green; write the "Decisions & human action" summary in `audit/BUILDER-REBUILD-LOG.md`.

---

## Definition of done

- Legacy print variants gone; each printable product has **draft** S/M/L defaults with real-dimension labels; Margaret can add aspect-locked **custom** variants (name + height/width auto-fill), see live LumaPrints cost + gross margin, override price, and flip Draft→Live to publish.
- The storefront shows live variants by medium with true sizes; add-to-cart → checkout → **order reaches LumaPrints** via the corrected `/api/v1/orders` call with `width/height` and the padded master; the order appears in the LumaPrints account.
- Order status + tracking flow to the customer (email + `/account/orders/[id]`) and roll up to `orders.status`; a cron backstops the webhook.
- The master crop tool works server-side on full-res TIFFs (lossless, non-destructive); originals preserved.
- All existing functionality intact; `main` builds green; advisors show no new criticals.

## Human action list

1. Add/confirm `LUMAPRINTS_API_KEY/SECRET/STORE_ID` (+ sandbox set) and `CRON_SECRET` in Vercel; set the LumaPrints **default billing address** (submit 400s without it).
2. Per artwork, choose **full_bleed vs matte** and crop the master once.
3. **Sign off the generated prices/margins**, approve the sandbox order, then authorize the first production order.
4. Decide where the crop worker runs (a small always-on worker/container or an operator-run `scripts/` job) — see Appendix.

---

## Appendix A — Can we crop an 800 MB master TIFF online, reliably, at quality?

**Short answer: yes for quality, but not in the browser and not in a normal serverless function. Do the selection on a small preview and the actual cut on the full-res file with libvips (sharp) in a worker.**

- **Browser is out.** Browsers don't decode TIFF natively; a JS decoder would pull an 800 MB / hundreds-of-megapixel image into tab memory (gigabytes) and exceed `<canvas>` size limits → crashes. So the **crop rectangle is chosen on a downsampled web proxy**, and we keep only normalized coordinates.
- **Serverless route is out.** Vercel functions cap memory/time and request-body size; streaming 800 MB through one is unreliable. So a **worker/script** (Phase 1.3) reads the file directly from Supabase Storage.
- **libvips/sharp is built for this.** It reads only the needed region (tile/region access), so memory stays low (tens–low-hundreds of MB) regardless of file size. A **pure crop is lossless** — selecting pixels + re-encoding to LZW/ZIP TIFF resamples nothing, so there is **zero quality loss**; DPI metadata is carried through. Matte mode just extends the canvas with a solid border (still lossless).
- **Big files move by resumable upload.** 800 MB ingest and the cropped output use `tus-js-client` (already a dependency) → Supabase resumable uploads, which handle multi-GB reliably where the plain client upload would fail.
- **Where it runs:** lowest-effort is an **operator-triggered `scripts/` job** (the repo already runs `sharp` in `scripts/`), with the admin UI showing job status and polling `print_updated_at`. If you want one-click in-app, run the same code in a **small always-on worker/queue** (not serverless) with ≥2 GB RAM. Either way the **original is never modified** — the cut writes a new `print/<id>.tif` and sets `print_storage_path`, so it's fully revertible.

## Appendix B — File change map

- Migrations: `supabase/migrations/2026061601_variant_custom_sizing.sql`, `2026061602_retire_legacy_print_variants.sql` (written; apply in Phase 0).
- New: `src/lib/pricing/size-tiers.ts`; `scripts/process-master-crop.mjs`; endpoints `…/master-artworks/[id]/crop`, `…/products/[id]/variants/generate-defaults`, `…/products/[id]/variants/custom`, price-preview; `src/app/api/cron/lumaprints-status/route.ts`; `src/app/(marketing)/account/orders/[id]/page.tsx`.
- Edit: `src/lib/pricing/mediums.ts` (decimals), `lumaprints-cache.ts` (live custom cost), `src/lib/integrations/lumaprints.ts` (order endpoints/shape), `src/lib/fulfillment/router.ts` (snapshot read + recipient + width/height + print master mint), `src/app/api/webhooks/stripe/route.ts` (snapshot write), `src/app/api/webhooks/lumaprints/route.ts` (shipping email + status rollup), `src/components/admin/VariantsTab.tsx` (incl. its inline `AddVariantModal` → custom builder), `src/components/shop/ProductDetail.tsx` (medium→size), `src/app/(admin)/admin/products/[id]/edit/page.tsx` (master crop entry), `ProjectHubClient.tsx` (stats).
- Keep untouched: `CropModal.tsx` + `/api/admin/product-images/[id]/crop` (web images), originals flow, checkout, CRM, email automations, media library, admin orders.

---

## Appendix C — Variant Builder UI spec (exact)

Lives in `src/components/admin/VariantsTab.tsx` (rendered inside `src/app/(admin)/admin/products/[id]/edit/page.tsx`). This is the authoritative UI spec for Phase 4 — build to it.

### C.0 Context the tab loads once (props/fetch)

From the edit page, pass into `VariantsTab`:
- `master`: `{ print_width_px, print_height_px, dpi, border_mode }` — fall back to `width_px/height_px` if no crop yet. Derive `ratio = print_width_px / print_height_px` and `orientation`.
- `mediums`: per enabled medium `{ medium, label, subcategory_id, option_ids, bounds:{minW,maxW,minH,maxH}, requiredDPI }` (from `lumaprints_mediums` + Phase 0 bounds probe; canvas `requiredDPI` 200).
- `productDefaultMargin` (effective cascade), `variants` (existing), `targetGrossMarginPct` (from site_settings, for the color threshold).
- `maxPrintIn = { w: floor(print_width_px / requiredDPI), h: floor(print_height_px / requiredDPI) }`.

### C.1 Master banner (top of tab)

One row: thumbnail + `Print master: {print_width_px}×{print_height_px}px @ {dpi}DPI · aspect {ratio:.3f} ({orientation}) · max at {requiredDPI}DPI: {maxPrintIn.w}×{maxPrintIn.h} in · Border: {Full bleed|Matte} [Edit crop]`.
- If **no print master / not cropped** → amber banner: "No print-ready master yet — [Crop master] before generating print sizes." Disable all size actions until resolved. ([Crop master] opens the Phase 1 tool.)
- `[Edit crop]` / `[Crop master]` → master crop UI (Phase 1).

### C.2 Per-medium section

One collapsible card per enabled medium (disabled mediums show greyed with "Run LumaPrints sync to enable"). Card header buttons:
- **Generate S/M/L** (primary when the medium has no defaults yet) → `POST /api/admin/products/[id]/variants/generate-defaults { medium }`. Inserts 3 **draft** variants. On partial success show a toast, e.g. "Large (30 in) skipped — exceeds master resolution. Small & Medium created." Idempotent (re-run fills gaps only).
- **Add custom size** → opens the creator (C.4).
- **Refresh prices** → `POST /api/admin/variants/refresh { product_id }` (re-prices live; preserves manual overrides).

### C.3 Variant table (per medium)

Columns, left→right:
1. **Live toggle** — switch. On = `is_active:true` (shown on storefront), Off = Draft. New variants default **Draft**. Writes `PATCH /api/admin/variants/[id] { is_active }` (debounced). Tooltip on Draft: "Not visible on the site."
2. **Label** — `name`. Editable inline for custom variants (e.g. "Life Size"); defaults render read-only as `Small — 12 × 14 in`.
3. **Size** — `{width_in} × {height_in} in` (read-only) + tier badge `S/M/L` or `Custom`.
4. **Cost** — `${(cost+shipping)/100}` with a muted `as of {last_priced_at}`; tooltip splits base vs options vs shipping. `Set cost` chip if 0.
5. **Margin %** — number input (markup). Writes `PATCH …/variants/[id] { margin_override_pct }` (debounced); blank = inherit product default (show the inherited value as placeholder).
6. **Price** — `${price}`. Pencil opens manual override (C.4.6). A `★` marks a manual override.
7. **Gross margin** — computed `(price−cost−shipping)/price` as `NN%`, color-coded: green ≥ `targetGrossMarginPct`, amber below, red if ≤ 0.
8. **Actions** — Duplicate (prefills creator), Delete (`DELETE …/variants/[id]`, confirm).

Sort: tier order S<M<L, then custom by area. Group label row shows the medium.

### C.4 "Add / edit custom size" creator (modal)

Fields, in order:

1. **Variant name** (text, required). Placeholder "e.g. Life Size". Help: "Shown to customers next to the size."
2. **Medium** (select; defaults to the section's medium; enabled only).
3. **Dimensions — aspect-locked pair.** Two number inputs, **Height (in)** and **Width (in)**, with a lock chip between them showing the locked ratio (e.g. `🔒 0.857`). Step = `0.25` in (or `1` in if the Phase 0 sandbox probe shows LumaPrints rejects fractional — then note that the ≤0.5″ delta is absorbed by the padded master).
   - **Auto-fill (the important behavior):** `ratio R = print_width_px / print_height_px`.
     - Edit **Height** → it's the driver; `Width = round(Height × R, step)`.
     - Edit **Width** → it's the driver; `Height = round(Width ÷ R, step)`.
     - **Either field can drive** — typing in one makes it the driver and recomputes the other. Never lock a field uneditable.
     - The **derived** field shows a subtle `auto` chip and muted text; the **driver** shows what was typed.
     - Recompute the partner immediately on input; debounce ~300 ms before re-validation + repricing.
   - There is **no unlock** — the master defines the shape (a different shape would need a different master crop, out of scope here).
4. **Validation row** (live, after debounce) — three checks, each ✓/✗ + plain text; ✗ on resolution/bounds **blocks Save**:
   - Resolution: ✓ "Master supports up to {maxPrintIn.w}×{maxPrintIn.h} in" / ✗ "Too large — your master only supports up to {maxW}×{maxH} in at {requiredDPI} DPI. Use a smaller size or a higher-res master."
   - Bounds: ✓ "Within LumaPrints limits ({minW}–{maxW} × {minH}–{maxH} in)" / ✗ "{value} in {width|height} exceeds this product's {limit} in max."
   - Aspect: ✓ "Matches the artwork ({delta:.1f}% off)" / ✗ "{delta:.1f}% off the artwork's shape — adjust a dimension." (With auto-fill this stays under rounding error; the check guards manual edits of both fields.)
5. **Pricing panel** (auto once size is valid; calls `POST /api/admin/products/[id]/variants/price-preview { medium, width_in, height_in }` → `{ cost_cents, shipping_cents, price_cents, gross_margin_pct, bounds_ok, resolution_ok, aspect_ok, max_w, max_h, ratio }`):
   - While loading: "Fetching LumaPrints price…" (skeleton). On API error: inline error + Retry; allow Save-as-Draft with cost 0 flagged "price not set."
   - Rows: `LumaPrints cost  $base (+$options)`, `Shipping (worst-case)  $ship`, `Landed cost  $landed`.
   - **Margin %** input (markup; defaults to effective product margin). Editing recomputes **Customer price** = `round(landed × (1+margin/100))`.
   - **Customer price** — large/prominent.
   - **Gross margin** — `NN%`, color-coded as in C.3.7.
6. **Manual price override** — toggle. On → a price input replaces the computed price; margin fields switch to read-only "implied margin: NN% · gross NN%". Writes `manual_price_override_cents`; persists across refreshes.
7. **Footer:** **Save as Draft** (primary) with helper "Drafts aren't shown on the site until you flip them Live." · **Save & Publish** (secondary; sets `is_active:true`) · **Cancel**. Save disabled while a hard check fails or price is loading — show the blocking reason next to the button. Save → `POST /api/admin/products/[id]/variants/custom { medium, name, width_in, height_in, margin_override_pct?, manual_price_override_cents?, is_active }` (writes `is_custom_size:true`, `size_tier:null`, `aspect_ratio:R`, and the subcategory/option snapshot in `fulfillment_metadata`).

Editing an existing custom variant opens the same modal prefilled; changing dimensions re-runs validation + price-preview.

### C.5 New endpoint to add (UI dependency)

`POST /api/admin/products/[id]/variants/price-preview` — admin-only; body `{ medium, width_in, height_in }`; returns the pricing + check object in C.4.5 by calling `validateCustomSize()` (Phase 2) and `priceCustomVariant()` (Phase 3.2). No DB write. Env-guarded; returns typed errors (`SIZE_OUT_OF_BOUNDS`, `LUMAPRINTS_UNAVAILABLE`) the modal renders inline.

### C.6 States to handle

No master/crop → actions disabled + crop CTA. Medium unconfigured → section disabled + sync CTA. Price fetch fails → retry + draft-with-flag. Over-resolution / out-of-bounds → block Save with the specific reason. All toggles/inputs optimistic with debounced PATCH and revert-on-error.
