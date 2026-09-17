# Sizes say which depths they are sold in; headers say the family — Blueprint

Authored by DotWin

Format: v2
Status: executing
Radius: R2
Budget: agents ≤ 2 · forks ≤ 0 · rounds ≤ 1 · ultracode: off
Examine: default
Runner: `npm run build-check` (the authority on green)

## Mission

Owner report (2026-09-17): switching on "1.50in Framed Canvas" in Print Catalog put The Dual's
one framed-canvas size on sale in 1.50in on the storefront with nothing to create or control
on the product page, and the size chip showed the 1.25in price. The family headers ("Canvas
(1.25" stretched)", "1.25in Framed Canvas") still carry the single depth the store sold in June.

Done = (1) every header names the family only and the depths are listed beneath; (2) each
size on the product page shows the depths it is sold in and the owner can untick one, and
every consumer honours it (storefront finish/size list, the public quote route, checkout,
the pricing warmer, the coverage report); (3) a size chip shows a price only when that
price is true for the selected depth: the stored price for the size's own depth, the live
quote for the selected size, nothing otherwise.

## Radius

R2 + S: `product_variants` gains a column (migration, applied); the public quote route and
checkout validation gain a refusal; admin variant route accepts the new field.

## Units

1. **Labels**: `MEDIUM_LABELS` family-only; editor section header uses the family label, not
   the legacy medium row's name.
2. **Column** `product_variants.excluded_subcategory_ids integer[] default '{}'`
   (20260917150000, live). Types regenerated.
3. **Storefront**: `PrintVariant` carries `excluded_subcategory_ids` and the stored
   `fulfillment_metadata.lumaprints_subcategory_id`; `sizesFor` drops a size for a finish it
   is excluded from; `SizePicker` shows the stored price only for the size's own depth, the
   live quote for the selected size, otherwise "priced when selected".
4. **Public quote route**: resolves the body's subcategory; refuses (404) when it is not of
   the variant's medium or the size is excluded from it.
5. **Checkout**: `quoteConfiguredLines` skips a line whose subcategory is not of the
   variant's medium or is excluded → the validator's existing `configuration_unavailable`.
6. **Warmer + coverage**: excluded (subcategory, size) pairs are neither warmed nor counted.
7. **Admin**: PATCH `/api/admin/variants/[id]` accepts `excluded_subcategory_ids`; the
   editor's Fits column becomes "Sold in": one chip per switched-on depth, click to include
   or exclude; grey when the depth cannot take the size.

## Contracts

- `PrintVariant.excluded_subcategory_ids?: number[] | null`,
  `PrintVariant.fulfillment_metadata?: { lumaprints_subcategory_id?: number | null } | null`.
- `variantStoredSubcategoryId(v): number | null`, `variantSoldIn(v, subcategoryId): boolean`.
- PATCH body: `excluded_subcategory_ids: int[] (≤ 50, positive)`.

## Security contract

- No new table, policy or grant; the column rides on `product_variants` (public SELECT of
  variants already exists; admin UPDATE via the admin route behind `requireAdmin`).
- The public quote route and checkout REFUSE a configuration the product does not sell
  (medium mismatch or exclusion) before any provider call — a shopper cannot price or buy a
  depth the owner turned off for that size.
- Egress unchanged.

## Verify

- `npm run typecheck` 0 errors · `npx vitest run test/shop test/api/print-quote-route.test.ts
  test/checkout-validation-v3.test.ts test/pricing test/admin/variants-tab-v2.test.tsx
  test/admin/offer-coverage.test.tsx` all pass · `npm run build-check` GREEN.

## Walks

1. Production product editor: The Dual → Framed Canvas section reads "Framed Canvas" with the
   depths listed; the 16 × 32.05 row shows chips 1.25in (on) and 1.50in (on); untick 1.50in.
2. Storefront The Dual → Framed Canvas: the 1.50in finish disappears (no size sold in it).
3. Print Catalog family headers read "Canvas" / "Framed Canvas".

## Red-team

- Missing states: a variant whose every fitting depth is excluded → the storefront hides the
  size; the editor shows "Not sold in any depth". A stale client sending an excluded depth
  → quote 404 / checkout 409 with the existing copy.
- Colliding units: the warmer's surface and the storefront's offer must agree → both derive
  from `variantSoldIn`.
- VERIFY passing while broken: the route tests mock the catalog; the checkout test drives a
  real validator with a fake client → both assert the refusal.
- Symptom vs cause: the owner's ask is per-size control; the family header is the cosmetic
  half and is fixed too, not instead.

## Examine

- **Runner:** `npm run build-check` GREEN (the run after the last fixture fix; the run before it
  failed one route test whose fixture pre-dated the new no-medium refusal).
- **Security pass:** the governor refused the `security-reviewer` (session usage ceiling reached),
  so the architect examined the seams inline against the reviewer's own checklist:
  (a) no path prices or sells a size under an excluded print type — the public route refuses
  before the engine (route test: family mismatch 404, unticked 404, unknown-to-tree → engine);
  checkout does not quote such a line, and the validator's existing `configuration_unavailable`
  409 fires when a configured line has no quote; a legacy (non-configured) line prices from the
  size's own stored depth and is unaffected; (b) an unknown subcategory ref is left to the
  engine, which answers `subcategory_unavailable` (200, available:false) — nothing is priced;
  (c) a row with no medium is now refused outright by the route (new test), so the medium
  check cannot be skipped; (d) the admin PATCH writes only a de-duplicated sorted int array;
  ids of another family are inert; (e) the column is a list of provider ids the owner does
  NOT sell in — public by nature, like the catalog switches; (f) no `select('*')` added —
  every read names the column; (g) every comparison coerces with `Number()`
  (`variantSoldIn`, `printTypeSellable`, `coverageCell`); the editor's chips receive JSON
  integers from PostgREST; (h) `fulfillment_metadata` already reached the browser through
  the product page's variant select and carries only size, option ids and the priced
  subcategory id.
- **Correctness:** the storefront, the warmer and the coverage report all derive from the same
  predicate (`variantSoldIn`) and the route/checkout from `printTypeSellable` with identical
  semantics, each with its own test.

## Proof

(walks at close)
