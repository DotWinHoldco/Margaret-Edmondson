# BUILD LOG — Margaret-Edmondson

Authored by DotWin

Append-only, greppable history. Newest first. `STATE.md` references entries by tag.

---

<!-- dotwin:log-entries -->

### [2026-10-21T19:19:29.633Z] #build-check
Status: green
Verified: 14/14 required gates
Failing: none


### [2026-10-21T19:18:19.161Z] #build-check
Status: failed
Verified: 13/14 required gates
Failing: test


### [2026-10-21T19:04:39.958Z] #build-check
Status: green
Verified: 14/14 required gates
Failing: none


### [2026-10-21T19:03:25.041Z] #build-check
Status: green
Verified: 14/14 required gates
Failing: none


### [2026-10-21T19:00:46.945Z] #build-check
Status: green
Verified: 14/14 required gates
Failing: none


### [2026-10-21T18:51:17.886Z] #build-check
Status: failed
Verified: 12/14 required gates
Failing: lint, test


## #full-catalog #size-labels — A size chip never shows raw decimals: whole-inch fallback under the standing tolerance

- **Date:** 2026-09-17
- **Module:** src/lib/pricing/print-size-label.ts (`printSizeLabel`: standard size first, else the nearest whole inch under the same half-inch / 2.5% rule, else the exact size; the actual cropped size stays in the note whenever the label rounded)
- **Category:** storefront display (R1; pricing, fulfillment and variant identity untouched)
- **Summary:** Owner: "why is the size not 16×32 with the actual size below?" The familiar-size label only snapped to a fixed list of standard sizes; 16×32 is not on it, so a 16 × 32.05 chip showed the decimals (and the canvas Large read 14.95 × 30). The tolerance the owner confirmed does not change; the candidate set gains the nearest whole inch as a fallback, and a standard size still wins when both fit (29.25 × 40 stays 30 × 40).
- **Verify:** test/print-size-label (+1 case, 2 expectations updated to the whole-inch fallback) · shop, cart, editor suites green (7 files / 61 tests) · build-check GREEN.

### [2026-09-17T19:56:08.508Z] #build-check
Status: green
Verified: 14/14 required gates
Failing: none


### [2026-09-17T19:54:32.288Z] #build-check
Status: failed
Verified: 13/14 required gates
Failing: test


## #full-catalog #size-depths — Sizes say which print types they are sold in; headers name the family

- **Date:** 2026-09-17
- **Module:** supabase/migrations/20260917150000_variant_excluded_subcategories.sql (`product_variants.excluded_subcategory_ids int[] default '{}'`, live) · src/components/shop/PrintConfigurator/catalog-view.ts (`variantSoldIn`, `variantStoredSubcategoryId`; `sizesFor` honours the veto) · SizePicker + PrintConfigurator (a chip shows the stored price only under the depth it was priced for, else "priced when selected") · src/app/api/products/[id]/print-quote/route.ts (404 for another family, an unticked print type, or a row with no medium) · src/lib/checkout/validation.ts (`printTypeSellable`; an unsellable configured line is not quoted → `configuration_unavailable`) · src/lib/pricing/warm.ts + offer-coverage.ts + coverage route (excluded pairs neither warmed nor counted) · src/app/api/admin/variants/[id]/route.ts (PATCH `excluded_subcategory_ids`) · src/components/admin/VariantsTab.tsx ("Sold in" switches per size; section title = the family) · src/lib/pricing/mediums.ts (family labels: Canvas, Framed Canvas, Fine Art Paper, …)
- **Category:** storefront contract + money path + admin control (R2/S)
- **Summary:** Owner: switching on 1.50in Framed Canvas in Print Catalog put The Dual's one framed-canvas size on sale in 1.50in with nothing to control on the product page, the chip showed the 1.25in price, and the family headers still carried June's single depth ("Canvas (1.25" stretched)", "1.25in Framed Canvas"). A size belongs to a family and every switched-on print type that fits offers it; now each size on the product page shows the print types it is sold in and the owner can untick one, and every consumer honours it. Headers name the family with the print types listed beneath. 1.50in means the canvas edge depth (stretcher bars), matched by the floater frame; frame colours are the options under each depth.
- **Verify:** `npm run build-check` → GREEN · `npx vitest run test/shop test/api/print-quote-route.test.ts test/checkout-validation-v3.test.ts test/pricing test/admin/variants-tab-v2.test.tsx test/admin/offer-coverage.test.tsx` → 13 files / 177 tests · new: route 404s (family, unticked, no medium), `printTypeSellable`, storefront hide + chip price, warmer + coverage exclusion, editor switch → exact PATCH body.

