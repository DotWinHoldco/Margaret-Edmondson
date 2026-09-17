// Authored by DotWin
// Checkout request schema v3 and the configured-line path of the pure validator
// (plan ADR-2, ADR-3, F1, F9, F23, F28). The quote is supplied to the pure function
// exactly as the async wrapper supplies it, keyed per LINE, so two configurations of
// one variant are two lines with two prices and two identities.

import { describe, expect, it } from 'vitest'
import {
  checkoutLineKey,
  parseCheckoutRequest,
  printTypeSellable,
  validateCheckoutCatalog,
  type CheckoutMediumRecord,
  type CheckoutProductRecord,
  type CheckoutVariantRecord,
  type ConfiguredLineQuotes,
} from '@/lib/checkout/validation'
import type { FulfillmentPolicy } from '@/lib/fulfillment/policy'
import type { QuoteResult } from '@/lib/pricing/quote-types'

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111'
const VARIANT_ID = '33333333-3333-4333-8333-333333333333'
const SUBCATEGORY_REF = '55555555-5555-4555-8555-555555555555'
const OTHER_SUBCATEGORY_REF = '66666666-6666-4666-8666-666666666666'

const PRODUCT: CheckoutProductRecord = {
  id: PRODUCT_ID,
  title: 'Test Artwork',
  status: 'active',
  base_price: 100,
  fulfillment_type: 'lumaprints',
  prints_enabled: true,
  master_artwork: {
    print_status: 'ready',
    print_storage_path: 'masters/test.png',
    print_width_px: 1800,
    print_height_px: 2400,
  },
}

const PRINT_VARIANT: CheckoutVariantRecord = {
  id: VARIANT_ID,
  product_id: PRODUCT_ID,
  name: '18 × 24 Canvas',
  price: 125,
  variant_type: 'canvas_print',
  inventory_count: null,
  is_active: true,
  is_lumaprints_available: true,
  lumaprints_cost_cents: 4200,
  medium: 'canvas',
  width_in: 18,
  height_in: 24,
}

const MEDIUM: CheckoutMediumRecord = {
  medium: 'canvas',
  subcategory_id: 101002,
  option_ids: [2, 11],
  enabled: true,
}

const POLICY: FulfillmentPolicy = {
  lumaprints_enabled: true,
  version: 7,
  shipping_mode: 'included',
  shipping_fee_cents: 0,
  lead_days: 10,
  ship_akhi: true,
} as FulfillmentPolicy

function quote(overrides: Partial<QuoteResult> & { subcategoryRef?: string; optionIds?: number[]; solidHex?: string | null } = {}): QuoteResult {
  const optionIds = overrides.optionIds ?? [2, 11]
  const subcategoryRef = overrides.subcategoryRef ?? SUBCATEGORY_REF
  return {
    available: true,
    violations: [],
    selection: {
      subcategoryRef,
      subcategoryId: 101002,
      optionIds,
      solidHex: overrides.solidHex ?? null,
      priceKeyHash: 'p'.repeat(64),
      lineHash: `${subcategoryRef}-${optionIds.join('-')}-${overrides.solidHex ?? ''}`,
      shippingClassIds: [],
      shippingClassHash: '',
      labels: [
        { group_key: 'canvas_border', group_label: 'Wrap', option_id: optionIds[0], option_label: optionIds[0] === 3 ? 'Solid Color Wrap' : 'Mirror Wrap', price_delta_cents: 0 },
        { group_key: 'hanging_hardware', group_label: 'Hardware', option_id: 11, option_label: 'Sawtooth', price_delta_cents: 160 },
      ],
    },
    costCents: 4200,
    shippingCents: 1500,
    priceCents: 13850,
    breakdown: null,
    fromCache: true,
    stale: false,
    outerWidthIn: 18,
    outerHeightIn: 24,
    ...overrides,
  }
}

function quotesFor(lines: Array<{ item: Parameters<typeof checkoutLineKey>[0]; result: QuoteResult }>): ConfiguredLineQuotes {
  return new Map(lines.map(({ item, result }) => [checkoutLineKey(item), result]))
}

describe('parseCheckoutRequest v3', () => {
  it('keeps the configuration fields and bounds them', () => {
    const result = parseCheckoutRequest({
      items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: SUBCATEGORY_REF, optionIds: [3, 11], solidHex: '#AABBCC', expectedPriceCents: 13850, extra: 'dropped' }],
      email: null, cartToken: null, promoCode: null, shippingSurchargeLabel: null,
    })
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.data.items[0]).toEqual({ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: SUBCATEGORY_REF, optionIds: [3, 11], solidHex: '#AABBCC', expectedPriceCents: 13850 })
    }
    expect(parseCheckoutRequest({ items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, solidHex: 'red' }], email: null, cartToken: null, promoCode: null, shippingSurchargeLabel: null })).toMatchObject({ ok: false })
    expect(parseCheckoutRequest({ items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, optionIds: [0] }], email: null, cartToken: null, promoCode: null, shippingSurchargeLabel: null })).toMatchObject({ ok: false })
  })

  it('allows the same variant twice with different configurations and refuses a duplicate line', () => {
    const base = { email: null, cartToken: null, promoCode: null, shippingSurchargeLabel: null }
    const twoDepths = parseCheckoutRequest({ ...base, items: [
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: SUBCATEGORY_REF, optionIds: [2, 11], expectedPriceCents: 12000 },
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: OTHER_SUBCATEGORY_REF, optionIds: [2, 11], expectedPriceCents: 15500 },
    ] })
    expect(twoDepths).toMatchObject({ ok: true })

    const legacyPlusConfigured = parseCheckoutRequest({ ...base, items: [
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 },
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: SUBCATEGORY_REF, optionIds: [2, 11], expectedPriceCents: 12000 },
    ] })
    expect(legacyPlusConfigured).toMatchObject({ ok: true })

    // A configuration is all or nothing (options without a print type), and a configured
    // line always carries the price the shopper saw (F9 is not opt-in).
    expect(parseCheckoutRequest({ ...base, items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, optionIds: [2, 11] }] })).toMatchObject({ ok: false })
    expect(parseCheckoutRequest({ ...base, items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, solidHex: '#aabbcc' }] })).toMatchObject({ ok: false })
    expect(parseCheckoutRequest({ ...base, items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: SUBCATEGORY_REF, optionIds: [2, 11] }] })).toMatchObject({ ok: false })

    const duplicateConfig = parseCheckoutRequest({ ...base, items: [
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: SUBCATEGORY_REF, optionIds: [11, 2], expectedPriceCents: 12000 },
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2, subcategoryRef: SUBCATEGORY_REF, optionIds: [2, 11], expectedPriceCents: 12000 },
    ] })
    expect(duplicateConfig).toMatchObject({ ok: false, error: { code: 'invalid_checkout_request' } })

    const duplicateLegacy = parseCheckoutRequest({ ...base, items: [
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 },
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 },
    ] })
    expect(duplicateLegacy).toMatchObject({ ok: false })
  })
})

describe('validateCheckoutCatalog with configured lines', () => {
  const configured = { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: SUBCATEGORY_REF, optionIds: [3, 11], solidHex: '#aabbcc', expectedPriceCents: 13850 }

  it('prices a configured line from its quote and freezes a v3 spec with the line identity', () => {
    const q = quote({ optionIds: [3, 11], solidHex: '#aabbcc' })
    const result = validateCheckoutCatalog([configured], [PRODUCT], [PRINT_VARIANT], [MEDIUM], POLICY, quotesFor([{ item: configured, result: q }]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const line = result.data[0]
    expect(line.price).toBe(138.5)
    expect(line.title).toBe('Test Artwork — 18 × 24 Canvas · Solid Color Wrap · Sawtooth')
    expect(line.snapshotVersion).toBe(3)
    expect(line.purchaseSpec).toMatchObject({
      kind: 'print',
      option_name: '18 × 24 Canvas · Solid Color Wrap · Sawtooth',
      subcategory_id: 101002,
      option_ids: [3, 11],
      included_shipping_cents: 1500,
      subcategory_ref: SUBCATEGORY_REF,
      line_hash: q.selection!.lineHash,
      solid_color_hex: '#aabbcc',
      configuration: 'Solid Color Wrap · Sawtooth',
    })
    expect(line.purchaseSpec!.details).toMatchObject({ solid_color_hex: '#aabbcc' })
    expect((line.purchaseSpec!.details as { print_options: unknown[] }).print_options).toHaveLength(2)
  })

  it('keeps a legacy line at snapshot v2 with no configuration fields', () => {
    const legacy = { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }
    const result = validateCheckoutCatalog([legacy], [PRODUCT], [PRINT_VARIANT], [MEDIUM], POLICY)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0].snapshotVersion).toBe(2)
    expect(result.data[0].price).toBe(125)
    expect(result.data[0].purchaseSpec).not.toHaveProperty('line_hash')
    expect(result.data[0].purchaseSpec!.option_ids).toEqual([2, 11])
  })

  it('prices two same-variant lines that differ only by depth as two distinct lines (F23)', () => {
    const shallow = { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: SUBCATEGORY_REF, optionIds: [2, 11], expectedPriceCents: 12000 }
    const deep = { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2, subcategoryRef: OTHER_SUBCATEGORY_REF, optionIds: [2, 11], expectedPriceCents: 15500 }
    const quotes = quotesFor([
      { item: shallow, result: quote({ subcategoryRef: SUBCATEGORY_REF, priceCents: 12000 }) },
      { item: deep, result: quote({ subcategoryRef: OTHER_SUBCATEGORY_REF, priceCents: 15500 }) },
    ])
    const result = validateCheckoutCatalog([shallow, deep], [PRODUCT], [PRINT_VARIANT], [MEDIUM], POLICY, quotes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.map((line) => line.price)).toEqual([120, 155])
    expect(result.data[0].purchaseSpec!.line_hash).not.toBe(result.data[1].purchaseSpec!.line_hash)
    expect(result.data[0].purchaseSpec!.subcategory_ref).toBe(SUBCATEGORY_REF)
    expect(result.data[1].purchaseSpec!.subcategory_ref).toBe(OTHER_SUBCATEGORY_REF)
  })

  it('refuses a configured line with no quote, an unavailable quote, or no policy', () => {
    expect(validateCheckoutCatalog([configured], [PRODUCT], [PRINT_VARIANT], [MEDIUM], POLICY, new Map()))
      .toMatchObject({ ok: false, error: { status: 409, code: 'configuration_unavailable' } })

    const unavailable = quote({ available: false, selection: null, violations: [{ code: 'glass_ceiling', message: 'That mat is too wide for this size.' }] })
    const refused = validateCheckoutCatalog([configured], [PRODUCT], [PRINT_VARIANT], [MEDIUM], POLICY, quotesFor([{ item: configured, result: unavailable }]))
    expect(refused).toMatchObject({ ok: false, error: { status: 409, code: 'configuration_unavailable' } })
    if (!refused.ok) expect(refused.error.message).toBe('"Test Artwork": That mat is too wide for this size.')

    expect(validateCheckoutCatalog([configured], [PRODUCT], [PRINT_VARIANT], [MEDIUM], undefined, quotesFor([{ item: configured, result: quote() }])))
      .toMatchObject({ ok: false, error: { code: 'configuration_unavailable' } })
  })

  it('refuses a price drift between what was shown and what would be charged (F9)', () => {
    const line = { ...configured, expectedPriceCents: 13000 }
    const result = validateCheckoutCatalog([line], [PRODUCT], [PRINT_VARIANT], [MEDIUM], POLICY, quotesFor([{ item: line, result: quote({ priceCents: 13850 }) }]))
    expect(result).toMatchObject({ ok: false, error: { status: 409, code: 'price_changed' } })
    if (!result.ok) expect(result.error.message).toContain('$138.50')

    const matching = validateCheckoutCatalog([{ ...line, expectedPriceCents: 13850 }], [PRODUCT], [PRINT_VARIANT], [MEDIUM], POLICY, quotesFor([{ item: line, result: quote({ priceCents: 13850 }) }]))
    expect(matching.ok).toBe(true)
  })

  it('refuses two lines whose raw options normalize to the same server line hash (P1: dedupe by the hash the order row keys on)', () => {
    // The shopper sent [3] on one line and [3, 11] on the other; 11 is the hardware group's
    // default, which the server fills for both, so both normalize to ONE line hash.
    const sparse = { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: SUBCATEGORY_REF, optionIds: [3], solidHex: '#aabbcc', expectedPriceCents: 13850 }
    const full = { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, subcategoryRef: SUBCATEGORY_REF, optionIds: [3, 11], solidHex: '#aabbcc', expectedPriceCents: 13850 }
    const sameHash = quote({ optionIds: [3, 11], solidHex: '#aabbcc' })
    const result = validateCheckoutCatalog([sparse, full], [PRODUCT], [PRINT_VARIANT], [MEDIUM], POLICY, quotesFor([
      { item: sparse, result: sameHash },
      { item: full, result: { ...sameHash } },
    ]))
    expect(result).toMatchObject({ ok: false, error: { status: 409, code: 'duplicate_line' } })

    // Two legacy lines for one variant are the same refusal at this layer too.
    const legacy = { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }
    expect(validateCheckoutCatalog([legacy, { ...legacy, quantity: 2 }], [PRODUCT], [PRINT_VARIANT], [MEDIUM], POLICY))
      .toMatchObject({ ok: false, error: { code: 'duplicate_line' } })
  })

  it('never lets an original be configured', () => {
    const original: CheckoutVariantRecord = { ...PRINT_VARIANT, variant_type: 'original', medium: null, inventory_count: 1 }
    const result = validateCheckoutCatalog([configured], [PRODUCT], [original], [], POLICY, quotesFor([{ item: configured, result: quote() }]))
    expect(result).toMatchObject({ ok: false, error: { code: 'variant_unavailable' } })
  })

  it('still requires a ready print master for a configured line', () => {
    const noMaster: CheckoutProductRecord = { ...PRODUCT, master_artwork: { print_status: 'pending', print_storage_path: null, print_width_px: null, print_height_px: null } }
    const result = validateCheckoutCatalog([configured], [noMaster], [PRINT_VARIANT], [MEDIUM], POLICY, quotesFor([{ item: configured, result: quote() }]))
    expect(result).toMatchObject({ ok: false, error: { code: 'variant_unfulfillable' } })
  })
})

// ---------------------------------------------------------------------------
// A size is sold only in the print types of its family the owner has not unticked
// (2026-09-17): the rule checkout applies before quoting a configured line.
// ---------------------------------------------------------------------------

describe('printTypeSellable', () => {
  const canvas125 = { medium: 'canvas', subcategory_id: 101002 }
  const canvas150 = { medium: 'canvas', subcategory_id: 101003 }
  const framed125 = { medium: 'framed_canvas', subcategory_id: 102002 }

  it('sells a size in every print type of its family until the owner unticks one', () => {
    expect(printTypeSellable(PRINT_VARIANT, canvas125)).toBe(true)
    expect(printTypeSellable(PRINT_VARIANT, canvas150)).toBe(true)
    expect(printTypeSellable({ ...PRINT_VARIANT, excluded_subcategory_ids: [101003] }, canvas150)).toBe(false)
    expect(printTypeSellable({ ...PRINT_VARIANT, excluded_subcategory_ids: [101003] }, canvas125)).toBe(true)
  })

  it('never sells a size in another family, and leaves an unknown print type to the engine', () => {
    expect(printTypeSellable(PRINT_VARIANT, framed125)).toBe(false)
    expect(printTypeSellable({ ...PRINT_VARIANT, medium: null }, framed125)).toBe(true)
    expect(printTypeSellable(PRINT_VARIANT, null)).toBe(true)
  })
})
