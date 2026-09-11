import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  resolveProvider,
  resolveShipping,
  getFulfillmentPolicy,
  type FulfillmentPolicy,
} from '@/lib/fulfillment/policy'
import {
  validateCheckoutCatalog,
  type CheckoutProductRecord,
  type CheckoutVariantRecord,
} from '@/lib/checkout/validation'
import { calculateCheckoutShipping } from '@/lib/checkout/shipping'
import { snapshotOrderItem } from '@/lib/checkout/snapshot'
import { paidShippingProblem } from '@/lib/checkout/paid-shipping'
import { cheapestPrintPrice } from '@/lib/product-utils'
import { missingPrepSteps } from '@/lib/launch/steps'
import type { SupabaseClient } from '@supabase/supabase-js'

const quote = vi.hoisted(() => vi.fn())
vi.mock('@/lib/pricing/shipping-quote', () => ({ quoteLiveShipping: quote }))
const policy: FulfillmentPolicy = {
  lumaprints_enabled: false,
  version: 4,
  shipping_mode: 'included',
  shipping_fee_cents: 0,
  lead_days: 10,
  ship_akhi: true,
}
const product: CheckoutProductRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Morning light',
  status: 'active',
  base_price: 800,
  fulfillment_type: 'lumaprints',
  prints_enabled: true,
  master_artwork: null,
}
const variant: CheckoutVariantRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  product_id: product.id,
  name: '8 × 10 framed print',
  price: 129,
  variant_type: 'framed_canvas_print',
  inventory_count: null,
  is_active: false,
  is_lumaprints_available: false,
  lumaprints_cost_cents: null,
  medium: 'framed_canvas',
  width_in: 8,
  height_in: 10,
  studio_price_cents: 8500,
  studio_is_active: true,
  studio_source_approved: true,
  studio_specs: { frame: 'Maple', source: 'Approved sample with printer' },
}
function validate(v = variant, p = product, mode = policy, quantity = 1) {
  return validateCheckoutCatalog(
    [{ productId: p.id, variantId: v.id, quantity }],
    [p],
    [v],
    [],
    mode,
  )
}
function studioItem() {
  const r = validate()
  if (!r.ok) throw new Error(r.error.message)
  return r.data[0]
}

beforeEach(() => quote.mockReset())
describe('studio switching and pricing', () => {
  it('sells approved studio prints without provider pricing, mapping, credentials, or a processed library master', () => {
    expect(validate()).toMatchObject({
      ok: true,
      data: [
        {
          price: 85,
          fulfillmentType: 'self_ship',
          snapshotVersion: 2,
          policyVersion: 4,
          purchaseSpec: {
            title: 'Morning light',
            option_name: '8 × 10 framed print',
          },
        },
      ],
    })
  })
  it('does not activate unapproved sources or blank studio prices', () => {
    expect(validate({ ...variant, studio_source_approved: false }).ok).toBe(
      false,
    )
    expect(validate({ ...variant, studio_price_cents: null }).ok).toBe(false)
  })
  it('restores automatic routing while retaining studio-only options and originals', () => {
    const on = { ...policy, lumaprints_enabled: true }
    expect(resolveProvider(on, 'lumaprints', variant)).toBe('lumaprints')
    expect(
      resolveProvider(on, 'lumaprints', { ...variant, studio_only: true }),
    ).toBe('self_ship')
    expect(
      resolveProvider(on, 'lumaprints', { variant_type: 'original' }),
    ).toBe('self_ship')
    expect(resolveProvider(policy, 'printful', variant)).toBe('printful')
    expect(validate({ ...variant, studio_only: true }, product, on).ok).toBe(
      true,
    )
    expect(variant.price).toBe(129)
  })
  it('keeps original inventory validation when the provider is off', () => {
    const original = {
      ...variant,
      variant_type: 'original',
      inventory_count: 1,
      is_active: true,
      price: 800,
    }
    expect(validate(original).ok).toBe(true)
    expect(validate(original, product, policy, 2).ok).toBe(false)
    expect(validate({ ...original, inventory_count: 0 }).ok).toBe(false)
  })
  it('fails closed if the authoritative switch cannot be read', async () => {
    const db = {
      rpc: async () => ({ data: null, error: { message: 'offline' } }),
    } as unknown as SupabaseClient
    await expect(getFulfillmentPolicy(db)).rejects.toThrow('unavailable')
  })
  it('advertises the active lowest price instead of a fixed global price', () => {
    expect(
      cheapestPrintPrice({
        prints_enabled: true,
        master_artwork: null,
        product_variants: [
          {
            variant_type: 'canvas_print',
            inventory_count: null,
            medium: 'canvas',
            fulfillment_type: 'self_ship',
            is_active: true,
            price: 85,
          },
          {
            variant_type: 'canvas_print',
            inventory_count: null,
            medium: 'canvas',
            fulfillment_type: 'self_ship',
            is_active: false,
            price: 20,
          },
        ],
      }),
    ).toBe(85)
  })
  it('does not require a Lumaprints login or billing card to launch studio mode', () => {
    const completed = {
      crops: { done: true },
      prices: { done: true },
      margins: { done: true },
    }
    expect(missingPrepSteps(completed, false)).toEqual([])
    expect(missingPrepSteps(completed, true)).toEqual([
      'luma_login',
      'luma_billing',
    ])
  })
})
describe('shipping and frozen purchases', () => {
  it('resolves store → product → option and separates automatic shipping settings', () => {
    const defaults = {
      ...policy,
      shipping_mode: 'flat' as const,
      shipping_fee_cents: 1200,
    }
    expect(resolveShipping(defaults, {}, {}, 'self_ship')).toEqual({
      mode: 'flat',
      feeCents: 1200,
    })
    expect(
      resolveShipping(
        defaults,
        { studio_shipping_mode: 'included' },
        {},
        'self_ship',
      ),
    ).toEqual({ mode: 'included', feeCents: 0 })
    expect(
      resolveShipping(
        defaults,
        { studio_shipping_mode: 'included' },
        { studio_shipping_mode: 'flat', studio_shipping_fee_cents: 500 },
        'self_ship',
      ),
    ).toEqual({ mode: 'flat', feeCents: 500 })
    expect(
      resolveShipping(
        defaults,
        { provider_shipping_mode: 'flat', provider_shipping_fee_cents: 800 },
        {},
        'lumaprints',
      ),
    ).toEqual({ mode: 'flat', feeCents: 800 })
    expect(() =>
      resolveShipping(
        policy,
        {},
        { studio_shipping_mode: 'flat' },
        'self_ship',
      ),
    ).toThrow()
  })
  it('charges included plus per-item flat shipping correctly without contacting a provider', async () => {
    const included = studioItem(),
      flat = {
        ...studioItem(),
        quantity: 3,
        shippingMode: 'flat' as const,
        shippingFeeCents: 1850,
      }
    expect(
      await calculateCheckoutShipping(
        [included, flat],
        { country: 'US', zip: '60601' },
        policy,
      ),
    ).toBe(5550)
    expect(flat.shippingTotalCents).toBe(5550)
    expect(quote).not.toHaveBeenCalled()
  })
  it('enforces regional coverage before payment', async () => {
    await expect(
      calculateCheckoutShipping(
        [studioItem()],
        { country: 'US', zip: '99501' },
        { ...policy, ship_akhi: false },
      ),
    ).rejects.toThrow('contiguous')
    await expect(
      calculateCheckoutShipping(
        [studioItem()],
        { country: 'CA', zip: '12345' },
        policy,
      ),
    ).rejects.toThrow('United States')
  })
  it('freezes names, price, provider, specifications and source for delayed webhooks', () => {
    const item = studioItem()
    item.printStoragePath = 'print/version-one.png'
    item.shippingTotalCents = 1500
    const row = snapshotOrderItem('order', item)
    expect(row).toMatchObject({
      unit_price: 85,
      fulfillment_type: 'self_ship',
      shipping_fee_cents: 1500,
      print_storage_path: 'print/version-one.png',
      purchase_spec: { details: { frame: 'Maple' } },
    })
    expect(row.external_item_id).toBe(row.id)
  })
  it('rechecks the paid address if the browser skips pre-confirm verification', () => {
    const item = studioItem()
    expect(
      paidShippingProblem(
        [item],
        { country: 'US', zip: '60601', ship_akhi: false },
        { country: 'US', postal_code: '99501', state: 'AK' },
      ),
    ).toContain('outside')
    expect(
      paidShippingProblem(
        [{ ...item, shippingMode: 'integration' }],
        { country: 'US', zip: '60601' },
        { country: 'US', postal_code: '96701', state: 'HI' },
      ),
    ).toContain('differs')
    expect(
      paidShippingProblem(
        [item],
        { country: 'US', zip: '60601', ship_akhi: true },
        { country: 'US', postal_code: '96701', state: 'HI' },
      ),
    ).toBeNull()
  })
})

import { discountedHostedLines } from '@/lib/checkout/hosted-prices'
describe('both checkout totals', () => {
  it.each([0, 1, 333, 1975, 8500])(
    'allocates a %i cent discount exactly across quantities without discounting shipping or tax',
    (discount) => {
      const items = [
        { price: 85, quantity: 3 },
        { price: 300, quantity: 1 },
      ]
      const lines = discountedHostedLines(items, discount)
      const chargedMerchandise = lines.reduce(
        (sum, line) => sum + line.unitAmount * line.quantity,
        0,
      )
      const subtotal = 55500,
        shipping = 2400,
        tax = Math.round((subtotal - discount) * 0.0825)
      expect(chargedMerchandise).toBe(subtotal - discount)
      expect(chargedMerchandise + shipping + tax).toBe(
        subtotal - discount + shipping + tax,
      )
      expect(lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(4)
    },
  )
})

import {applyQuotedPrices} from '@/lib/cart/quoted-prices'
it('a late quote cannot restore removed cart items or undo newer quantities',()=>{
 const base={fulfillmentType:'self_ship',productId:'p',variantId:'v',title:'Artwork',quantity:2,price:85,image:'',slug:'art'}
 const quote={fulfillmentType:'self_ship',variantId:'v',quantity:1,price:90}
 expect(applyQuotedPrices([], [quote])).toEqual([])
 expect(applyQuotedPrices([base], [quote])[0]).toMatchObject({quantity:2,price:85})
 expect(applyQuotedPrices([base], [{...quote,quantity:2}])[0]).toMatchObject({quantity:2,price:90})
})
