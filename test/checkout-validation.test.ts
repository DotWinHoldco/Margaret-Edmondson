import { describe, expect, it } from 'vitest'
import {
  parseCheckoutRequest,
  validateCheckoutCatalog,
  type CheckoutMediumRecord,
  type CheckoutProductRecord,
  type CheckoutVariantRecord,
} from '@/lib/checkout/validation'

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_PRODUCT_ID = '22222222-2222-4222-8222-222222222222'
const VARIANT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_VARIANT_ID = '44444444-4444-4444-8444-444444444444'

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
  option_ids: [],
  enabled: true,
}

describe('parseCheckoutRequest', () => {
  it('keeps only bounded identifiers and quantities from client cart lines', () => {
    const result = parseCheckoutRequest({
      items: [{
        productId: PRODUCT_ID,
        variantId: VARIANT_ID,
        quantity: 2,
        price: 0.01,
        title: 'attacker-controlled',
      }],
      email: ' shopper@example.com ',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toEqual([{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 }])
    expect(result.data.email).toBe('shopper@example.com')
  })

  it.each([-2, 0, 1.5, 100])('rejects an unsafe quantity (%s)', (quantity) => {
    const result = parseCheckoutRequest({
      items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity }],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects duplicate variants so an original cannot be repeated as separate lines', () => {
    const result = parseCheckoutRequest({
      items: [
        { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 },
        { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('requires a real variant and a bounded cart shape', () => {
    expect(parseCheckoutRequest({
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    }).ok).toBe(false)
    expect(parseCheckoutRequest({ items: [] }).ok).toBe(false)
  })
})

describe('validateCheckoutCatalog', () => {
  it('prices a valid print entirely from authoritative catalog records', () => {
    const result = validateCheckoutCatalog(
      [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 }],
      [PRODUCT],
      [PRINT_VARIANT],
      [MEDIUM],
    )

    expect(result).toEqual({
      ok: true,
      data: [{
        productId: PRODUCT_ID,
        variantId: VARIANT_ID,
        quantity: 2,
        title: 'Test Artwork — 18 × 24 Canvas',
        price: 125,
        variantType: 'canvas_print',
        fulfillmentType: 'lumaprints',
      }],
    })
  })

  it('rejects a variant that belongs to a different product', () => {
    const result = validateCheckoutCatalog(
      [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      [PRODUCT],
      [{ ...PRINT_VARIANT, product_id: OTHER_PRODUCT_ID }],
      [MEDIUM],
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'variant_unavailable' } })
  })

  it('rejects archived products and inactive variants', () => {
    expect(validateCheckoutCatalog(
      [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      [{ ...PRODUCT, status: 'archived' }],
      [PRINT_VARIANT],
      [MEDIUM],
    )).toMatchObject({ ok: false, error: { code: 'product_unavailable' } })

    expect(validateCheckoutCatalog(
      [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      [PRODUCT],
      [{ ...PRINT_VARIANT, is_active: false }],
      [MEDIUM],
    )).toMatchObject({ ok: false, error: { code: 'variant_unavailable' } })
  })

  it('rejects a print that cannot be priced or fulfilled', () => {
    expect(validateCheckoutCatalog(
      [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      [PRODUCT],
      [{ ...PRINT_VARIANT, lumaprints_cost_cents: 0 }],
      [MEDIUM],
    )).toMatchObject({ ok: false, error: { code: 'variant_unfulfillable' } })

    expect(validateCheckoutCatalog(
      [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      [{ ...PRODUCT, master_artwork: null }],
      [PRINT_VARIANT],
      [MEDIUM],
    )).toMatchObject({ ok: false, error: { code: 'variant_unfulfillable' } })
  })

  it('allows one in-stock original and rejects duplicate quantity or sold inventory', () => {
    const original: CheckoutVariantRecord = {
      ...PRINT_VARIANT,
      id: OTHER_VARIANT_ID,
      name: 'Original',
      variant_type: 'original',
      inventory_count: 1,
      is_lumaprints_available: false,
      lumaprints_cost_cents: null,
      medium: null,
      width_in: null,
      height_in: null,
      price: 2200,
    }
    const item = { productId: PRODUCT_ID, variantId: OTHER_VARIANT_ID, quantity: 1 }

    expect(validateCheckoutCatalog([item], [PRODUCT], [original], [])).toMatchObject({
      ok: true,
      data: [{ fulfillmentType: 'self_ship', price: 2200 }],
    })
    expect(validateCheckoutCatalog([{ ...item, quantity: 2 }], [PRODUCT], [original], []))
      .toMatchObject({ ok: false, error: { code: 'original_quantity_invalid' } })
    expect(validateCheckoutCatalog([item], [PRODUCT], [{ ...original, inventory_count: 0 }], []))
      .toMatchObject({ ok: false, error: { code: 'sold_out' } })
  })
})
