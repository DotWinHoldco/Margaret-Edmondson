import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { collectsTax, normalizeNexusStates, taxSummary, paidTotalMatches, type TaxConfig } from '@/lib/tax/config'
import { paidShippingProblem } from '@/lib/checkout/paid-shipping'

const mocks = vi.hoisted(() => ({ settings: vi.fn(), registrations: vi.fn(), calculate: vi.fn() }))
const stripe = {
  tax: {
    settings: { retrieve: mocks.settings },
    registrations: { list: () => ({ autoPagingToArray: mocks.registrations }) },
    calculations: { create: mocks.calculate },
  },
} as unknown as Stripe
vi.mock('@/lib/stripe', () => ({ getStripe: async () => stripe, getStripeMode: async () => 'test' }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))
import { calculateCheckoutTax, getTaxReadiness } from '@/lib/tax/server'
const config: TaxConfig = { tax_enabled: true, tax_included: false, tax_nexus_states: ['TX'] }
const destination = { country: 'US', state: 'TX', zip: '78701', city: 'Austin', line1: '1100 Congress Ave', line2: '' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.settings.mockResolvedValue({ status: 'active', defaults: { tax_code: 'configured_by_owner' } })
  mocks.registrations.mockResolvedValue([{ country: 'US', country_options: { us: { type: 'state_sales_tax', state: 'TX' } } }])
})

describe('sales tax scope and configuration', () => {
  it('collects only in selected US destination states, and respects disabled mode', () => {
    expect(collectsTax(config, 'US', ' tx ')).toBe(true)
    expect(collectsTax(config, 'US', 'CA')).toBe(false)
    expect(collectsTax(config, 'CA', 'TX')).toBe(false)
    expect(collectsTax({ ...config, tax_enabled: false }, 'US', 'TX')).toBe(false)
  })
  it('normalizes duplicate state choices and rejects unsupported state input', () => {
    expect(normalizeNexusStates(['tx', 'TX', ' ca '])).toEqual(['CA', 'TX'])
    expect(() => normalizeNexusStates(['Texas'])).toThrow()
    expect(() => normalizeNexusStates('TX')).toThrow()
    expect(() => normalizeNexusStates([42])).toThrow()
  })
  it('does not add included tax a second time', () => {
    expect(taxSummary(10825, 0, 0, 825, true).total).toBe(10825)
    expect(taxSummary(10000, 0, 0, 825, false).total).toBe(10825)
  })
  it('checks paid amounts against included or separate tax without accepting double tax', () => {
    expect(paidTotalMatches(10825, 0, 0, 825, true, 10825)).toBe(true)
    expect(paidTotalMatches(10825, 0, 0, 825, true, 11650)).toBe(false)
    expect(paidTotalMatches(10000, 1000, 1000, 825, false, 10825)).toBe(true)
    expect(paidTotalMatches(10000, 0, 0, 825, false, 10000)).toBe(false)
    expect(paidTotalMatches(NaN, 0, 0, 0, false, 10000)).toBe(false)
  })
  it('requires actual state sales tax registrations for every selected state', async () => {
    const result = await getTaxReadiness(['TX', 'CA'])
    expect(result.ready).toBe(false)
    expect(result.missingStates).toEqual(['CA'])
    mocks.registrations.mockResolvedValue([{ country: 'US', country_options: { us: { type: 'local_lease_tax', state: 'TX' } } }])
    expect((await getTaxReadiness(['TX'])).ready).toBe(false)
  })
  it('fails closed when the tax service or business setup is unavailable', async () => {
    mocks.settings.mockRejectedValue(new Error('unavailable'))
    expect((await getTaxReadiness(['TX'])).ready).toBe(false)
    await expect(calculateCheckoutTax(stripe, config, destination, 10000, 0, 0)).rejects.toThrow('cannot be verified')
  })
})

describe('Stripe address-based amounts', () => {
  it('adds separate tax after the discount, passing shipping to the tax engine', async () => {
    mocks.calculate.mockResolvedValue({ id: 'taxcalc_separate', amount_total: 10825, tax_amount_exclusive: 825, tax_amount_inclusive: 0, tax_breakdown: [{ taxability_reason: 'standard_rated' }] })
    const result = await calculateCheckoutTax(stripe, config, destination, 10000, 1000, 1000)
    expect(result).toMatchObject({ total: 10825, tax: 825, taxIncluded: false, calculationId: 'taxcalc_separate' })
    expect(mocks.calculate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ amount: 9000, reference: 'artwork', tax_behavior: 'exclusive' }],
      shipping_cost: { amount: 1000, tax_behavior: 'exclusive' },
      customer_details: expect.objectContaining({ address_source: 'shipping', address: expect.objectContaining({ line1: destination.line1, state: 'TX', postal_code: '78701' }) }),
    }))
  })
  it('extracts the provider inclusive amount while preserving the advertised total', async () => {
    mocks.calculate.mockResolvedValue({ id: 'taxcalc_included', amount_total: 10825, tax_amount_exclusive: 0, tax_amount_inclusive: 825, tax_breakdown: [] })
    const result = await calculateCheckoutTax(stripe, { ...config, tax_included: true }, destination, 10825, 0, 0)
    expect(result).toMatchObject({ total: 10825, tax: 825, taxIncluded: true })
    expect(mocks.calculate.mock.calls[0][0].line_items[0].tax_behavior).toBe('inclusive')
  })
  it('does not calculate or charge seller tax outside selected nexus states', async () => {
    const result = await calculateCheckoutTax(stripe, config, { ...destination, state: 'CA', zip: '90210' }, 10000, 1000, 500)
    expect(result).toMatchObject({ total: 9500, tax: 0, calculationId: null })
    expect(mocks.calculate).not.toHaveBeenCalled()
  })
  it('does not label a nonnexus order as tax included', async () => {
    const result = await calculateCheckoutTax(stripe, { ...config, tax_included: true }, { ...destination, state: 'CA' }, 10000, 0, 0)
    expect(result.taxIncluded).toBe(false)
    expect(result.taxState).toBeNull()
  })
  it('handles a free order without creating a zero-value tax line', async () => {
    const result = await calculateCheckoutTax(stripe, config, destination, 10000, 10000, 0)
    expect(result.total).toBe(0)
    expect(mocks.calculate).not.toHaveBeenCalled()
  })
  it('sends shipping-only discount orders for manual help rather than guessing their tax', async () => {
    await expect(calculateCheckoutTax(stripe, config, destination, 10000, 10000, 500)).rejects.toThrow('only shipping')
    expect(mocks.calculate).not.toHaveBeenCalled()
  })
  it('requires a full address before creating a taxable payment', async () => {
    await expect(calculateCheckoutTax(stripe, config, { country: 'US', zip: '78701' }, 10000, 0, 0)).rejects.toThrow('full shipping address')
  })
  it('rejects missing collection instead of silently charging zero', async () => {
    mocks.calculate.mockResolvedValue({ id: 'taxcalc_bad', amount_total: 10000, tax_amount_exclusive: 0, tax_amount_inclusive: 0, tax_breakdown: [{ taxability_reason: 'not_collecting' }] })
    await expect(calculateCheckoutTax(stripe, config, destination, 10000, 0, 0)).rejects.toThrow('setup needs review')
  })
  it('rejects inconsistent tax totals', async () => {
    mocks.calculate.mockResolvedValue({ id: 'taxcalc_bad', amount_total: 9999, tax_amount_exclusive: 825, tax_amount_inclusive: 0, tax_breakdown: [] })
    await expect(calculateCheckoutTax(stripe, config, destination, 10000, 0, 0)).rejects.toThrow('total could not be verified')
  })
})

describe('paid address independent verification', () => {
  const items = [{ snapshotVersion: 2, fulfillmentType: 'self_ship', shippingMode: 'included' as const }]
  const quote = { ...destination, tax_enabled: true, ship_akhi: true }
  const address = { country: 'US', state: 'TX', postal_code: '78701', city: 'Austin', line1: destination.line1, line2: '' }
  it('accepts the address used for the paid tax calculation', () => expect(paidShippingProblem(items, quote, address)).toBeNull())
  it('holds production if a browser skipped verification and changed even the street', () => {
    expect(paidShippingProblem(items, quote, { ...address, line1: '999 Different Street' })).toContain('verified sales tax address')
    expect(paidShippingProblem(items, quote, { ...address, state: 'CA' })).toContain('verified sales tax address')
  })
})
