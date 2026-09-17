// Authored by DotWin
// Snapshot v2 and v3 through the order-row builder (plan F22). A v3 line carries its
// line identity and colour onto order_items; a v2 line still produces exactly the row
// it always did, with the '' line hash that keeps the idempotency key unchanged.

import { describe, expect, it } from 'vitest'
import { hasPurchaseSnapshot, snapshotOrderItem, SNAPSHOT_VERSION_MIN } from '@/lib/checkout/snapshot'
import type { ValidatedCheckoutItem } from '@/lib/checkout/validation'

const ORDER_ID = '99999999-9999-4999-8999-999999999999'
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111'
const VARIANT_ID = '33333333-3333-4333-8333-333333333333'
const SUBCATEGORY_REF = '55555555-5555-4555-8555-555555555555'

function v2Line(): ValidatedCheckoutItem {
  return {
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    quantity: 1,
    title: 'Test Artwork — 18 × 24 Canvas',
    price: 125,
    variantType: 'canvas_print',
    fulfillmentType: 'lumaprints',
    snapshotVersion: 2,
    policyVersion: 1,
    shippingMode: 'included',
    shippingFeeCents: 0,
    shippingTotalCents: 0,
    printStoragePath: 'masters/test.png',
    purchaseSpec: {
      kind: 'print',
      title: 'Test Artwork',
      option_name: '18 × 24 Canvas',
      medium: 'canvas',
      size_label: '18x24',
      width_in: 18,
      height_in: 24,
      details: {},
      lead_days: 10,
      subcategory_id: 101002,
      option_ids: [2, 11],
      included_shipping_cents: 1500,
    },
  }
}

function v3Line(): ValidatedCheckoutItem {
  const line = v2Line()
  return {
    ...line,
    subcategoryRef: SUBCATEGORY_REF,
    optionIds: [3, 11],
    solidHex: '#aabbcc',
    snapshotVersion: 3,
    title: 'Test Artwork — 18 × 24 Canvas · Solid Color Wrap · Sawtooth',
    purchaseSpec: {
      ...line.purchaseSpec!,
      option_name: '18 × 24 Canvas · Solid Color Wrap · Sawtooth',
      option_ids: [3, 11],
      details: {
        print_options: [
          { group_key: 'canvas_border', group_label: 'Wrap', option_id: 3, option_label: 'Solid Color Wrap', price_delta_cents: 0 },
          { group_key: 'hanging_hardware', group_label: 'Hardware', option_id: 11, option_label: 'Sawtooth', price_delta_cents: 0 },
        ],
        solid_color_hex: '#aabbcc',
      },
      subcategory_ref: SUBCATEGORY_REF,
      line_hash: 'f'.repeat(64),
      solid_color_hex: '#aabbcc',
      configuration: 'Solid Color Wrap · Sawtooth',
    },
  }
}

describe('hasPurchaseSnapshot', () => {
  it('accepts every version from the minimum upwards and nothing below', () => {
    expect(SNAPSHOT_VERSION_MIN).toBe(2)
    expect(hasPurchaseSnapshot({ snapshotVersion: 2 })).toBe(true)
    expect(hasPurchaseSnapshot({ snapshotVersion: 3 })).toBe(true)
    expect(hasPurchaseSnapshot({ snapshotVersion: 4 })).toBe(true)
    expect(hasPurchaseSnapshot({ snapshotVersion: 1 })).toBe(false)
    expect(hasPurchaseSnapshot({ snapshotVersion: null })).toBe(false)
    expect(hasPurchaseSnapshot({})).toBe(false)
  })
})

describe('snapshotOrderItem', () => {
  it('builds the same v2 row as before, with an empty line hash and no colour', () => {
    const row = snapshotOrderItem(ORDER_ID, v2Line())
    expect(row).toMatchObject({
      order_id: ORDER_ID,
      product_id: PRODUCT_ID,
      variant_id: VARIANT_ID,
      quantity: 1,
      unit_price: 125,
      fulfillment_type: 'lumaprints',
      fulfillment_status: 'pending',
      medium: 'canvas',
      size_label: '18x24',
      print_width_in: 18,
      print_height_in: 24,
      lumaprints_subcategory_id: 101002,
      lumaprints_option_ids: [2, 11],
      print_storage_path: 'masters/test.png',
      line_hash: '',
      solid_color_hex: null,
    })
    expect(row.external_item_id).toBe(row.id)
  })

  it('carries the v3 line identity, options and colour onto the order row', () => {
    const row = snapshotOrderItem(ORDER_ID, v3Line())
    expect(row).toMatchObject({
      lumaprints_subcategory_id: 101002,
      lumaprints_option_ids: [3, 11],
      line_hash: 'f'.repeat(64),
      solid_color_hex: '#aabbcc',
    })
    expect((row.purchase_spec as { configuration?: string }).configuration).toBe('Solid Color Wrap · Sawtooth')
    expect((row.purchase_spec.details as { print_options: unknown[] }).print_options).toHaveLength(2)
  })

  it('refuses a line below the minimum snapshot version or without a spec', () => {
    expect(() => snapshotOrderItem(ORDER_ID, { ...v2Line(), snapshotVersion: 1 })).toThrow(/Incomplete purchase snapshot/)
    expect(() => snapshotOrderItem(ORDER_ID, { ...v2Line(), purchaseSpec: undefined })).toThrow(/Incomplete purchase snapshot/)
    expect(() => snapshotOrderItem(ORDER_ID, { ...v3Line(), price: 0 })).toThrow(/Incomplete purchase snapshot/)
  })
})
