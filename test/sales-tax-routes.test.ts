import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const h = vi.hoisted(() => ({ auth: vi.fn(), config: vi.fn(), readiness: vi.fn(), quote: vi.fn(), settings: vi.fn(), from: vi.fn(), upsert: vi.fn(), write: vi.fn(), retrieve: vi.fn(), update: vi.fn(), create: vi.fn(), parsedCheckout: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: h.auth }))
vi.mock('@/lib/tax/server', () => ({ getCheckoutTaxConfig: h.config, getTaxReadiness: h.readiness, calculateCheckoutTax: h.quote }))
vi.mock('@/lib/settings/accessor', () => ({ getSiteSettings: h.settings, clearSettingsCache: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: h.from }), createServiceClient: async () => ({ from: h.from }) }))
vi.mock('@/lib/stripe', () => ({ getStripe: async () => ({ paymentIntents: { retrieve: h.retrieve, update: h.update, create: h.create } }), getStripeMode: async () => 'test', isStripeKeyConfigured: () => true }))
vi.mock('@/lib/fulfillment/policy', () => ({ getFulfillmentPolicy: async () => ({ version: 1, ship_akhi: true }) }))
vi.mock('@/lib/checkout/shipping', () => ({ calculateCheckoutShipping: async () => 0 }))
vi.mock('@/lib/checkout/snapshot', () => ({ captureProductionSources: vi.fn() }))
vi.mock('@/lib/checkout/validation', () => ({ parseCheckoutRequest: h.parsedCheckout, validateAndPriceCheckoutItems: async (_db: unknown, items: unknown) => ({ ok: true, data: items }) }))
vi.mock('@/lib/api/rate-limit', () => ({ rateLimit: async () => ({ ok: true }), rateLimitResponse: vi.fn() }))
vi.mock('@/lib/meta/capi', () => ({ sendServerEvent: vi.fn(), hashSHA256: vi.fn() }))
vi.mock('@/lib/discounts/validate', () => ({ validateDiscountCode: vi.fn() }))
vi.mock('@/lib/checkout/holds', () => ({ holdOriginals: vi.fn(), originalVariantIds: () => [], releaseOriginalHolds: vi.fn(), resolveFunnelId: vi.fn() }))
vi.mock('@/lib/cart/token', () => ({ resolveCartToken: vi.fn() }))
import { PATCH } from '@/app/api/admin/settings/route'
import { POST as verify } from '@/app/api/checkout/verify/route'
import { POST as intent } from '@/app/api/checkout/intent/route'
const secret = 'pi_fixture_secret_1234567890'
const item = { productId: 'product', variantId: 'variant', price: 100, quantity: 1, fulfillmentType: 'self_ship' }
const destination = { country: 'US', zip: '78701', state: 'TX', city: 'Austin', line1: '1100 Congress Ave', line2: '' }
const request = (path: string, body: unknown, method = 'POST') => new NextRequest(`https://example.test${path}`, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
beforeEach(() => {
  vi.clearAllMocks()
  const snapshot = { items: [item], policy_version: 1, subtotal_cents: 10000, discount_cents: 0, surcharge_cents: 0 }
  h.from.mockImplementation(() => {
    const q = { select: () => q, eq: () => q, single: async () => ({ data: snapshot, error: null }), update: (value: unknown) => { h.write(value); return { eq: async () => ({ error: null }) } }, upsert: h.upsert }
    return q
  })
  h.auth.mockResolvedValue({ ok: true, supabase: { from: h.from } })
  h.config.mockResolvedValue({ tax_enabled: true, tax_included: false, tax_nexus_states: ['TX'] })
  h.settings.mockResolvedValue({ tax_enabled: true, tax_included: false, tax_nexus_states: ['TX'] })
  h.readiness.mockResolvedValue({ ready: true, registeredStates: ['TX'], missingStates: [], message: 'Ready', mode: 'test' })
  h.upsert.mockResolvedValue({ error: null })
  h.retrieve.mockResolvedValue({ client_secret: secret, status: 'requires_payment_method', amount: 10000, metadata: { tax_cents: '0', tax_included: '0' } })
  h.update.mockResolvedValue({})
  h.quote.mockResolvedValue({ subtotal: 10000, discount: 0, surcharge: 0, tax: 825, total: 10825, taxIncluded: false, calculationId: 'taxcalc_new', taxState: 'TX' })
  h.parsedCheckout.mockResolvedValue(undefined)
  h.parsedCheckout.mockReturnValue({ ok: true, data: { items: [item], destination: { country: 'US', zip: '78701' }, email: null, cartToken: null, promoCode: null, funnelId: null } })
})
describe('tax settings route', () => {
  it('rejects string booleans and invalid state values before any write', async () => {
    expect((await PATCH(request('/api/admin/settings', { tax_enabled: 'false' }, 'PATCH'))).status).toBe(400)
    expect((await PATCH(request('/api/admin/settings', { tax_nexus_states: ['Texas'] }, 'PATCH'))).status).toBe(400)
    expect(h.upsert).not.toHaveBeenCalled()
  })
  it('cannot activate collection without matching active registrations', async () => {
    h.readiness.mockResolvedValue({ ready: false, message: 'Add your existing registration in Stripe.' })
    const result = await PATCH(request('/api/admin/settings', { tax_enabled: true, tax_nexus_states: ['TX'] }, 'PATCH'))
    expect(result.status).toBe(400)
    expect((await result.json()).code).toBe('TAX_SETUP_REQUIRED')
    expect(h.upsert).not.toHaveBeenCalled()
  })
  it('saves normalized state codes and the included election after validation', async () => {
    expect((await PATCH(request('/api/admin/settings', { tax_enabled: true, tax_included: true, tax_nexus_states: ['tx', 'TX'] }, 'PATCH'))).status).toBe(200)
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ tax_enabled: true, tax_included: true, tax_nexus_states: ['TX'] }), expect.anything())
  })
  it('lets an owner turn tax off even if Stripe setup is unavailable', async () => {
    h.readiness.mockResolvedValue({ ready: false, message: 'Unavailable' })
    expect((await PATCH(request('/api/admin/settings', { tax_enabled: false }, 'PATCH'))).status).toBe(200)
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ tax_enabled: false }), expect.anything())
  })
})
describe('tax payment routes', () => {
  it('requires a full shipping address before exposing a taxable PaymentIntent', async () => {
    const result = await intent(request('/api/checkout/intent', {}))
    expect(result.status).toBe(400)
    expect((await result.json()).code).toBe('tax_address_required')
    expect(h.create).not.toHaveBeenCalled()
  })
  it('updates the PaymentIntent and snapshot, requiring review of a changed tax total', async () => {
    const result = await verify(request('/api/checkout/verify', { clientSecret: secret, destination }))
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ changed: true, summary: { total: 10825, tax: 825 } })
    expect(h.update).toHaveBeenCalledWith('pi_fixture', expect.objectContaining({ amount: 10825, hooks: { inputs: { tax: { calculation: 'taxcalc_new' } } }, metadata: expect.objectContaining({ tax_cents: '825' }) }))
    expect(h.write).toHaveBeenCalledWith(expect.objectContaining({ tax_cents: 825, shipping_destination: expect.objectContaining({ line1: destination.line1, tax_enabled: true }) }))
  })
  it('preserves tax-disabled totals and omits tax hooks for an ordinary untaxed payment', async () => {
    h.config.mockResolvedValue({ tax_enabled: false, tax_included: false, tax_nexus_states: [] })
    h.quote.mockResolvedValue({ subtotal: 10000, discount: 0, surcharge: 0, tax: 0, total: 10000, taxIncluded: false, calculationId: null, taxState: null })
    const result = await verify(request('/api/checkout/verify', { clientSecret: secret, destination }))
    expect(await result.json()).toMatchObject({ changed: false, summary: { total: 10000, tax: 0 } })
    expect(h.update.mock.calls[0][1]).not.toHaveProperty('hooks')
  })
  it('rejects a different payment capability without touching tax or payment amounts', async () => {
    expect((await verify(request('/api/checkout/verify', { clientSecret: 'pi_fixture_secret_wrong12345', destination }))).status).toBe(403)
    expect(h.quote).not.toHaveBeenCalled()
    expect(h.update).not.toHaveBeenCalled()
  })
})
