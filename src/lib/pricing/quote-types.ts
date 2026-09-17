// Authored by DotWin
// Contract for configuration pricing (plan §5 ADR-3, ADR-4) shared by the quote engine,
// the public print-quote route, checkout validation (P5) and the verification scripts.
// Pure types only; no I/O and no Next imports, so plain node scripts can import it.

import type { FrozenPrintOption, PricingMode } from '@/lib/catalog/types'

/** What the customer (or an admin pricing a default variant) asked to price. */
export interface QuoteInput {
  productId: string
  subcategoryRef: string
  widthIn: number
  heightIn: number
  /** Customer-chosen option ids; untouched groups are filled from the catalog defaults. */
  optionIds: number[]
  solidHex?: string
  quantity?: number
  /**
   * The priced variant's own overrides, when the selection is a Live variant. A manual price
   * fixes the DEFAULT configuration's price and makes every other configuration unavailable;
   * a margin override replaces the product/category/site margin for this size.
   */
  variantPricing?: {
    margin_override_pct: number | null
    manual_price_override_cents: number | null
  }
}

/** One reason a configuration cannot be sold; `code` is stable, `message` is customer copy. */
export interface ConstraintViolation {
  code:
    | 'subcategory_unavailable'
    | 'option_unknown'
    | 'option_unavailable'
    | 'option_blocked'
    | 'group_required'
    | 'group_duplicate'
    | 'group_dependency'
    | 'hex_required'
    | 'hex_invalid'
    | 'size_out_of_bounds'
    | 'size_resolution'
    | 'size_aspect'
    | 'glass_ceiling'
    | 'size_whitelist'
  message: string
  /** The group or option the violation is about, when it is about one. */
  groupKey?: string
  optionId?: number
}

/** The selection after defaults are filled and ids are normalized (sorted, unique). */
export interface NormalizedSelection {
  subcategoryRef: string
  subcategoryId: number
  /** Every group's chosen id (customer choice or default), sorted ascending. */
  optionIds: number[]
  solidHex: string | null
  /** sha256(sorted optionIds); '' when no option is sent. Pricing identity. */
  priceKeyHash: string
  /** sha256(subcategoryRef ‖ optionIds ‖ hex). Cart/order line identity. */
  lineHash: string
  /** Options that plausibly change weight/box, sorted; drives the shipping memo. */
  shippingClassIds: number[]
  shippingClassHash: string
  /** Labeled choices frozen into purchase_spec.details.print_options. */
  labels: FrozenPrintOption[]
}

export interface QuoteBreakdown {
  /** Provider base price for (subcategory, size) with no options, in cents. */
  baseCents: number
  /** Per selected option, the provider's additive price at this size, in cents. */
  optionDeltas: Array<{ optionId: number; cents: number }>
  /** How the total was derived: summed deltas or a whole-configuration price (105xxx). */
  pricingMode: PricingMode
}

export interface QuoteResult {
  available: boolean
  violations: ConstraintViolation[]
  selection: NormalizedSelection | null
  /** Provider unit cost for the configuration, cents (base + deltas, or whole-config). */
  costCents: number
  /** Worst-case CONUS shipping for the configuration's shipping class, cents. */
  shippingCents: number
  /** Customer price after the markup chain (variant → product → category → site), cents. */
  priceCents: number
  breakdown: QuoteBreakdown | null
  /** True when every number came from cache rows; false when the provider was called. */
  fromCache: boolean
  /** True when the provider was unreachable and an expired cache row was served (ADR-3, F29). */
  stale: boolean
  /** Glass/outer size after per_side_in options, inches; equals the print size otherwise. */
  outerWidthIn: number
  outerHeightIn: number
}

/** Row shape of lumaprints_pricing_cache after the v2 columns (plan §4.2). */
export interface PricingCacheRowV2 {
  id: string
  subcategory_ref: string
  width_in: number
  height_in: number
  price_key_hash: string
  shipping_class_hash: string
  cost_cents: number
  shipping_cents: number
  option_breakdown: Array<{ option_id: number; price_cents: number }>
  base_cents: number
  fetched_at: string
  expires_at: string
}

/** The public quote endpoint's request body (v3 selection shape, ADR-2). */
export interface PrintQuoteRequest {
  subcategoryRef: string
  /** Either a Live variant (its size is used) or an explicit size. */
  variantId?: string
  widthIn?: number
  heightIn?: number
  optionIds: number[]
  solidHex?: string
}

export type PrintQuoteResponse =
  | ({ ok: true } & Pick<QuoteResult, 'available' | 'violations' | 'priceCents' | 'costCents' | 'shippingCents' | 'stale' | 'outerWidthIn' | 'outerHeightIn'> & {
      priceKeyHash: string
      lineHash: string
      labels: FrozenPrintOption[]
    })
  | { ok: false; error: string; code: 'rate_limited' | 'provider_busy' | 'invalid_request' | 'not_found' }
