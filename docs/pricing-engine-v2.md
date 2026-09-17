# Pricing engine v2

Authored by DotWin

What prices a print, from Phase 2 onwards. The legacy medium-level engine
(`lumaprints-cache.ts`) still exists and still works; it is the fallback for a family
the catalog has not been synced for, and it retires in P8.

## The shape of a price

```
QuoteInput {productId, subcategoryRef, widthIn, heightIn, optionIds[], solidHex?}
      |
      |  selection.ts   resolve the subcategory, run the rules, compute the identities
      v
NormalizedSelection {optionIds (defaults filled, sorted), priceKeyHash, lineHash,
                     shippingClassIds, shippingClassHash, labels}
      |
      |  quote.ts       cache -> provider -> shipping -> markup
      v
QuoteResult {available, violations[], costCents, shippingCents, priceCents,
             breakdown, fromCache, stale, outerWidthIn, outerHeightIn}
```

Nothing else computes money. `customerPriceCents` applies the markup chain (variant,
product, category, site) to the landed cost, exactly as it did before.

`QuoteInput.variantPricing` carries the priced variant's own overrides when the
selection is a Live variant:

- `margin_override_pct` replaces the effective product margin for this size.
- `manual_price_override_cents` fixes the price of the variant's DEFAULT configuration.
  Any other configuration of a manual-price variant is refused (`option_unavailable`,
  "This size has a set price and cannot be customised.") before a provider call, because
  a set price is a price for one product and a 5 inch mat is a different one.

## Modules

| File | What it owns |
|---|---|
| `src/lib/catalog/assemble.ts` | Rows to tree, ADR-5 cascade, ADR-4 blocked reasons. Pure. |
| `src/lib/catalog/rules.ts` | Every geometry and constraint rule. Pure, no runtime imports. |
| `src/lib/catalog/selection.ts` | Normalize a selection, compute the two hashes, freeze labels. |
| `src/lib/catalog/availability.ts` | What a screen may offer, and the reason when it may not. |
| `src/lib/pricing/quote-cache.ts` | The v2 cache rows: read, write (delete then insert), memo, evict. |
| `src/lib/pricing/quote.ts` | The engine: cache, provider batch, freight, markup, stale serve. |

## Two pricing modes

`lumaprints_subcategories.pricing_mode` decides how a configuration is priced.

**additive** (canvas, framed canvas, metal, paper, foam, peel and stick). One provider
call per (subcategory, size) miss carries the default configuration plus one item per
other enabled option, that option swapped in for its own group's default. Every enabled
option's delta for that size therefore lands in the cache in a single call. A
configuration nobody has priced yet is composed as:

```
cost(selection) = cost(default row)
                + Σ over each changed option X of [ cost(row with X swapped in) − cost(default row) ]
```

Deltas are differences of WHOLE rows, never a raw read of the echoed `options[]`. The
provider echoes options it resolved on our behalf (a framed canvas priced without its
hanging wire still comes back carrying the $1.60 wire), and it accepts some ids without
echoing them at all (Canvas Finish). A difference of two full configurations cancels
both problems; summing echoed lines charges for the wire twice and loses the finish.

**whole_config** (every 105xxx frame profile). The exact configuration is priced and
cached under its own hash, and nothing is ever summed across rows. Measured reason
(P14, 105005 at 16 by 20): a 3 inch mat is $20.52 and Somerset Velvet is $3.56, but
both together are $65.64 rather than the $62.84 those deltas predict, because the mat
price moves with the paper.

In both modes the provider's `price` field is the BASE alone; the unit cost is
`price + Σ options[].price`.

## Cache

Table `lumaprints_pricing_cache`, v2 columns added by
`20260917000200_pricing_cache_v2_and_configurator_flag.sql`.

- Identity: `(subcategory_ref, width_in, height_in, price_key_hash)`, a partial unique
  index. `price_key_hash` is the sha256 of the sorted option ids, empty for none.
- A refresh DELETES and re-INSERTS. One key never holds two rows.
- 24 hour life. Expired rows are kept, never swept: they are what a shopper sees when
  the provider is unreachable, and the quote comes back with `stale: true`.
- Legacy `(medium, size_label)` rows live on the same table. `medium` and `size_label`
  are nullable so a v2 row need not fake them, and the two engines cannot collide.

**Eviction is not optional.** Any change to a subcategory, its groups or its options
makes every price built on the old state a lie. Call
`evictQuoteCache(client, subcategoryRef)` from sync and from every admin toggle (F7).

## Shipping

Worst-case CONUS across the quote zips, memoized per
`(subcategory_ref, width_in, height_in, shipping_class_hash)`. The shipping class is the
sorted set of selected options carrying `geometry.shipping_class` (frames, acrylic
glazing, backboards, mounting posts). A mat or a mat colour shares the class of the
plain configuration and never re-quotes freight; a frame change does. A freight quote
that fails leaves zero, and a zero is never memoized.

## Rules the provider does not enforce

Pricing accepts all of these and refuses them later, after payment. `rules.ts` is the
only gate:

| Code | What it catches |
|---|---|
| `option_unknown` / `option_unavailable` / `option_blocked` | An id this subcategory does not carry, one switched off, one blocked by ADR-4 (needs file bleed, or an owed probe). |
| `group_duplicate` / `group_required` | Two choices in one group; a required group with none. |
| `group_dependency` | A mat colour chosen with No Mat (the provider prices the pair at zero). |
| `hex_required` / `hex_invalid` | A Solid Color wrap with no usable `#rrggbb`. |
| `size_out_of_bounds` | Outside the published bounds, orientation aware. |
| `size_resolution` / `size_aspect` | Beyond the master's pixels, or off its shape by more than 1%. |
| `glass_ceiling` | Print plus 2 × mat per axis past the frame's glass, orientation aware. |
| `size_whitelist` | The metal easel away from the sizes the provider actually sells. |

Defaults are filled for every group before anything is sent, so a provider call never
carries an empty options array while a group exists: an empty array resolves to Image
Wrap on canvas and a 0.25 inch bleed on paper, both of which reject an aspect exact
master. This is an invariant at two layers: `quoteConfiguration` returns
`subcategory_unavailable` when the normalized set is empty and the subcategory still
lists a group, and `buildPricingBatch` throws rather than composing such a request for
any other caller. A subcategory that genuinely has no option groups (peel and stick)
still prices.

The glass ceiling is checked whenever a frame declares one (`max_glass_w_in` /
`max_glass_h_in`), with or without a mat: those columns can sit below the published size
bounds, and the bounds gate alone would pass a 50 by 40 print into a 32 by 40 sheet.

**Customer copy is a fixed set.** `CUSTOMER_VIOLATION_MESSAGES` in `rules.ts` holds every
string a violation may carry, all of them constants with nothing interpolated. Operator
text (an owed probe naming a script, "turn at least one of its options on", the
provider's own wording) stays on the tree as `blocked_reason` and as the subcategory's
admin reason; a violation names the group and the option so the screen can point at the
control instead. `offerableOptions` follows the same split: `reason` is customer copy,
`adminReason` carries the measurements.

## Two hashes

- `price_key_hash = sha256(sorted option ids)` is the PRICING identity. The subcategory
  and the size are already columns on the cache row, and the colour does not change what
  LumaPrints charges.
- `line_hash = sha256(subcategoryRef ‖ sorted option ids ‖ hex)` is the LINE identity.
  The subcategory must be in it: sibling canvas depths share option ids, so options-only
  identity merges a 0.75 inch canvas into a 1.5 inch one across cart, dedupe and the
  order key (F23).

## Failure behaviour

| Situation | What happens |
|---|---|
| Rules refuse | `available: false`, violations, all money zero, no provider call. |
| Provider budget refused, disabled, 5xx, or a dead socket | The expired row is served with `stale: true`. With nothing cached, `QuoteUnavailableError` (which extends `LumaprintsUnavailableError`, so the builder's inline copy still works). |
| Provider refuses the size (4xx or `success: false`) | `SizeOutOfBoundsError`. Never a cached number for a size the provider will not sell. |
| Freight quote fails for another reason | Cost stands, shipping is zero for this quote, and nothing is memoized. |

The admin refresh route separates the two kinds of failure. A busy provider
(`QuoteUnavailableError`, `LumaprintsBudgetError`, `LumaprintsUnavailableError`) stops
the run where it stands and returns `{ busy, stopped_early: true }` with every row it
did not reach untouched; only a genuine refusal of a size marks that one variant
`is_lumaprints_available = false`. The old behaviour walked the whole product during an
outage and switched a working store off.

## Where it is wired

- `buildPricedVariantRow` prices a variant's default configuration through
  `quoteDefaultConfiguration`, and freezes the normalized default ids into
  `fulfillment_metadata.lumaprints_option_ids`.
- `POST /api/admin/variants/refresh` re-prices with `refresh: true`, which ignores the
  cache and rewrites it.
- `POST /api/admin/products/[id]/variants/price-preview` quotes the same way, and now
  refuses a size the geometry rules reject instead of pricing it.

Each keeps the legacy path for a family with no catalog row, and logs one warning line
when it uses it.

## Operator notes

- A price that looks stale after a toggle means the toggle did not evict. Check that the
  caller runs `evictQuoteCache` for the subcategory.
- `pricing_mode` is seeded from the provider category (105xxx is whole config) and is an
  admin-owned column: sync never rewrites it.
- The engine always reads the FULL catalog tree (`includeDisabled: true`). The storefront
  tree drops disabled groups, and a dropped group is exactly the one whose hostile
  provider default has to be overridden. Request paths should use
  `getFullCatalogCached()` (service client, catalog tag, 300s, React `cache()`) rather
  than loading it per request. It is server-only data and is never serialized to a
  browser: send prices and labels, not the tree.
