import { describe, expect, it } from 'vitest'
import { availableOriginalPrice, getProductBadge, hasPurchasablePrints } from '@/lib/product-utils'

const READY_MASTER = { print_status: 'ready', print_storage_path: 'masters/art.png' }
const PRINT = {
  variant_type: 'canvas_print',
  inventory_count: null,
  medium: 'canvas',
  is_active: true,
  is_lumaprints_available: true,
}

describe('storefront product availability', () => {
  it('requires both a ready master and a live print variant', () => {
    expect(hasPurchasablePrints({
      prints_enabled: true, master_artwork: READY_MASTER, product_variants: [PRINT],
    })).toBe(true)
    expect(hasPurchasablePrints({
      prints_enabled: true, master_artwork: null, product_variants: [PRINT],
    })).toBe(false)
    expect(hasPurchasablePrints({
      prints_enabled: true, master_artwork: READY_MASTER, product_variants: [{ ...PRINT, is_active: false }],
    })).toBe(false)
  })

  it('does not advertise unavailable prints in the product badge', () => {
    expect(getProductBadge({
      status: 'active',
      is_original: false,
      prints_enabled: true,
      master_artwork: null,
      product_variants: [PRINT],
    })).toBeNull()
  })

  it('uses only an in-stock original as the original price fallback', () => {
    const original = { variant_type: 'original', inventory_count: 1, price: 450 }
    expect(availableOriginalPrice({
      prints_enabled: true,
      product_variants: [original],
    })).toBe(450)
    expect(availableOriginalPrice({
      prints_enabled: true,
      product_variants: [{ ...original, inventory_count: 0 }],
    })).toBeNull()
  })
})
