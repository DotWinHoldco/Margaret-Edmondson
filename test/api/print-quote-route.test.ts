// Authored by DotWin
//
// Behavioural proof for the public print-quote route. Every assertion here is made by
// CALLING the handler and reading what it returned or what it passed downstream; none
// of it inspects the route's source.
//
// The contracts under test:
//   - the door is dark: with print_configurator_enabled off, the route is a 404 and the
//     engine is never reached,
//   - the public shape never carries wholesale numbers (costCents / shippingCents, and
//     no per-option price_delta_cents on the labels),
//   - an anonymous caller can only name a Live variant, never a size of its own,
//   - the engine's provider calls run under the public budget reserve,
//   - a rejected configuration is a 200 the configurator can render, while a broken
//     request (400), an unsellable product (404) and a stalled provider (503) are not,
//   - the engine is always handed the FULL catalog tree and the master's pixels, because
//     default filling has to beat the provider's geometry-hostile defaults (P15/F30).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuoteResult } from '@/lib/pricing/quote-types'

const PRODUCT_ID = '11111111-2222-4333-8444-555555555555'
const OTHER_PRODUCT_ID = '99999999-8888-4777-8666-555555555555'
const VARIANT_ID = '22222222-3333-4444-8555-666666666666'
const SUBCATEGORY_REF = '33333333-4444-4555-8666-777777777777'
const BUSY_COPY = 'Print pricing is briefly busy. Please try again in a moment.'

// --- Doubles -------------------------------------------------------------------

const rateLimitMock = vi.fn()
const quoteConfigurationMock = vi.fn()
const getFullCatalogCachedMock = vi.fn()
const readinessMock = vi.fn()
const withProviderReserveMock = vi.fn()

/** Sentinel object: identity proves the very tree the route loaded reached the engine. */
const FULL_TREE = { host: 'us.api.lumaprints.com', loaded_at: 'now', subcategories: [] }

class QuoteUnavailableError extends Error {}
class LumaprintsDisabledError extends Error {}

/** Per-table `{ data, error }` the fake service client hands back. */
const tableResults = new Map<string, { data: unknown; error: unknown }>()
const selectedColumns: Array<{ table: string; columns: string }> = []
let serviceClient: unknown

function fakeServiceClient() {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          selectedColumns.push({ table, columns })
          const builder = {
            eq: () => builder,
            maybeSingle: async () => tableResults.get(table) ?? { data: null, error: null },
          }
          return builder
        },
      }
    },
  }
}

vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  // Mirrors the real 429 (body + Retry-After) without the shared Postgres counter.
  rateLimitResponse: () =>
    Response.json({ error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' }, {
      status: 429,
      headers: { 'Retry-After': '60' },
    }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => serviceClient,
  createClient: async () => serviceClient,
}))

vi.mock('@/lib/products/print-readiness', () => ({
  loadPublicPrintReadiness: (...args: unknown[]) => readinessMock(...args),
}))

vi.mock('@/lib/catalog/load', () => ({
  getFullCatalogCached: (...args: unknown[]) => getFullCatalogCachedMock(...args),
}))

// The real wrapper sets a module-level reserve around the call; the double records the
// reserve it was asked for and still runs the work, so the route's behaviour is tested
// rather than the budget module's.
vi.mock('@/lib/integrations/lumaprints-budget', () => ({
  PUBLIC_QUOTE_RESERVE: 8,
  withProviderReserve: (reserve: number, fn: () => Promise<unknown>) => withProviderReserveMock(reserve, fn),
}))

vi.mock('@/lib/integrations/lumaprints', () => ({ LumaprintsDisabledError }))

vi.mock('@/lib/pricing/quote', () => ({
  quoteConfiguration: (...args: unknown[]) => quoteConfigurationMock(...args),
  quoteDefaultConfiguration: (...args: unknown[]) => quoteConfigurationMock(...args),
  QuoteUnavailableError,
}))

const { POST } = await import('@/app/api/products/[id]/print-quote/route')

// --- Fixtures ------------------------------------------------------------------

function quoteResult(overrides: Partial<QuoteResult> = {}): QuoteResult {
  return {
    available: true,
    violations: [],
    selection: {
      subcategoryRef: SUBCATEGORY_REF,
      subcategoryId: 105005,
      optionIds: [64, 74, 83, 94, 96, 146, 148],
      solidHex: null,
      priceKeyHash: 'price-key-hash',
      lineHash: 'line-hash',
      shippingClassIds: [146],
      shippingClassHash: 'shipping-class-hash',
      labels: [
        {
          group_key: 'mat_size',
          group_label: 'Mat',
          option_id: 64,
          option_label: 'No Mat',
          price_delta_cents: 2052,
        },
      ],
    },
    costCents: 2080,
    shippingCents: 1200,
    priceCents: 6560,
    breakdown: { baseCents: 2080, optionDeltas: [{ optionId: 83, cents: 165 }], pricingMode: 'whole_config' },
    fromCache: true,
    stale: false,
    outerWidthIn: 8,
    outerHeightIn: 10,
    ...overrides,
  }
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { subcategoryRef: SUBCATEGORY_REF, variantId: VARIANT_ID, optionIds: [64, 74], ...overrides }
}

function call(payload: unknown, productId = PRODUCT_ID): Promise<Response> {
  const request = new Request(`https://artbyme.studio/api/products/${productId}/print-quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
  return POST(request as never, { params: Promise.resolve({ id: productId }) })
}

beforeEach(() => {
  rateLimitMock.mockReset()
  quoteConfigurationMock.mockReset()
  getFullCatalogCachedMock.mockReset()
  readinessMock.mockReset()
  withProviderReserveMock.mockReset()
  withProviderReserveMock.mockImplementation((_reserve: number, fn: () => Promise<unknown>) => fn())
  tableResults.clear()
  selectedColumns.length = 0
  serviceClient = fakeServiceClient()

  rateLimitMock.mockResolvedValue({ ok: true, remaining: 59, resetAt: Date.now() + 60_000, degraded: false })
  tableResults.set('site_settings', { data: { print_configurator_enabled: true }, error: null })
  tableResults.set('products', { data: { id: PRODUCT_ID, status: 'active', prints_enabled: true }, error: null })
  tableResults.set('product_variants', {
    data: {
      id: VARIANT_ID,
      product_id: PRODUCT_ID,
      is_active: true,
      width_in: 18,
      height_in: 24,
      margin_override_pct: null,
      manual_price_override_cents: null,
    },
    error: null,
  })
  readinessMock.mockResolvedValue({
    data: new Map([[PRODUCT_ID, { productId: PRODUCT_ID, ready: true, widthPx: 4800, heightPx: 6000 }]]),
    error: null,
  })
  getFullCatalogCachedMock.mockResolvedValue(FULL_TREE)
  quoteConfigurationMock.mockResolvedValue(quoteResult())
})

// --- Tests ---------------------------------------------------------------------

describe('POST /api/products/[id]/print-quote', () => {
  it('answers 429 from the limiter without touching the pricing engine', async () => {
    rateLimitMock.mockResolvedValue({ ok: false, remaining: 0, resetAt: Date.now() + 30_000, degraded: false })

    const response = await call(body())

    expect(response.status).toBe(429)
    expect(rateLimitMock).toHaveBeenCalledWith(expect.anything(), {
      limit: 60,
      windowMs: 60_000,
      keyPrefix: 'print-quote',
    })
    expect(quoteConfigurationMock).not.toHaveBeenCalled()
    expect(readinessMock).not.toHaveBeenCalled()
  })

  it('is dark: with the configurator flag off it is a 404 and the engine is never reached', async () => {
    tableResults.set('site_settings', { data: { print_configurator_enabled: false }, error: null })

    const response = await call(body())

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ ok: false, code: 'not_found', error: 'Not found' })
    expect(quoteConfigurationMock).not.toHaveBeenCalled()
    expect(getFullCatalogCachedMock).not.toHaveBeenCalled()
    // Nothing behind the flag was read: no product row, no readiness, no variant.
    expect(selectedColumns.map((c) => c.table)).toEqual(['site_settings'])
    expect(readinessMock).not.toHaveBeenCalled()
  })

  it('is dark when the settings row is missing or the flag is null', async () => {
    tableResults.set('site_settings', { data: null, error: null })
    const missingRow = await call(body())

    tableResults.set('site_settings', { data: { print_configurator_enabled: null }, error: null })
    const nullFlag = await call(body())

    expect([missingRow.status, nullFlag.status]).toEqual([404, 404])
    expect(quoteConfigurationMock).not.toHaveBeenCalled()
  })

  it('reads the flag before it parses the body', async () => {
    tableResults.set('site_settings', { data: { print_configurator_enabled: false }, error: null })

    // A body that would be a 400 behind an open door is still a 404 in front of a dark one.
    const response = await call('{"subcategoryRef":')

    expect(response.status).toBe(404)
  })

  it('rejects an unknown body key with 400 invalid_request', async () => {
    const response = await call(body({ discountPct: 90 }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, code: 'invalid_request', error: expect.any(String) })
    expect(quoteConfigurationMock).not.toHaveBeenCalled()
  })

  it('refuses an explicit size from a public caller: variantId is the only way to name one', async () => {
    const withWidth = await call(body({ widthIn: 8 }))
    const withBoth = await call(body({ widthIn: 8, heightIn: 10 }))
    const sizeOnly = await call({ subcategoryRef: SUBCATEGORY_REF, widthIn: 8, heightIn: 10, optionIds: [] })

    expect([withWidth.status, withBoth.status, sizeOnly.status]).toEqual([400, 400, 400])
    expect((await withBoth.json()).code).toBe('invalid_request')
    expect(quoteConfigurationMock).not.toHaveBeenCalled()
  })

  it('requires a variantId', async () => {
    const response = await call({ subcategoryRef: SUBCATEGORY_REF, optionIds: [] })

    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('invalid_request')
  })

  it('rejects malformed JSON with 400 invalid_request', async () => {
    const response = await call('{"subcategoryRef":')

    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('invalid_request')
  })

  it('answers 404 for a product that is not a published print', async () => {
    tableResults.set('products', { data: null, error: null })
    const missing = await call(body())

    tableResults.set('products', { data: { id: PRODUCT_ID, status: 'draft', prints_enabled: true }, error: null })
    const draft = await call(body())

    tableResults.set('products', { data: { id: PRODUCT_ID, status: 'active', prints_enabled: false }, error: null })
    const printsOff = await call(body())

    expect([missing.status, draft.status, printsOff.status]).toEqual([404, 404, 404])
    expect(await missing.json()).toEqual({ ok: false, code: 'not_found', error: expect.any(String) })
    expect(quoteConfigurationMock).not.toHaveBeenCalled()
  })

  it('answers 404 when the print master is not ready', async () => {
    readinessMock.mockResolvedValue({
      data: new Map([[PRODUCT_ID, { productId: PRODUCT_ID, ready: false, widthPx: null, heightPx: null }]]),
      error: null,
    })

    const response = await call(body())

    expect(response.status).toBe(404)
    expect(quoteConfigurationMock).not.toHaveBeenCalled()
  })

  it('answers 404 for a variant that belongs to another product', async () => {
    tableResults.set('product_variants', {
      data: { id: VARIANT_ID, product_id: OTHER_PRODUCT_ID, is_active: true, width_in: 18, height_in: 24 },
      error: null,
    })

    const response = await call({ subcategoryRef: SUBCATEGORY_REF, variantId: VARIANT_ID, optionIds: [] })

    expect(response.status).toBe(404)
    expect(quoteConfigurationMock).not.toHaveBeenCalled()
  })

  it('answers 404 for a variant that is no longer active', async () => {
    tableResults.set('product_variants', {
      data: { id: VARIANT_ID, product_id: PRODUCT_ID, is_active: false, width_in: 18, height_in: 24 },
      error: null,
    })

    const response = await call({ subcategoryRef: SUBCATEGORY_REF, variantId: VARIANT_ID, optionIds: [] })

    expect(response.status).toBe(404)
  })

  it('prices a variant at the variant size', async () => {
    const response = await call({ subcategoryRef: SUBCATEGORY_REF, variantId: VARIANT_ID, optionIds: [64] })

    expect(response.status).toBe(200)
    expect(quoteConfigurationMock.mock.calls[0][1]).toMatchObject({
      productId: PRODUCT_ID,
      subcategoryRef: SUBCATEGORY_REF,
      widthIn: 18,
      heightIn: 24,
    })
  })

  it("passes the variant's own pricing overrides to the engine", async () => {
    tableResults.set('product_variants', {
      data: {
        id: VARIANT_ID,
        product_id: PRODUCT_ID,
        is_active: true,
        width_in: 18,
        height_in: 24,
        margin_override_pct: 140,
        manual_price_override_cents: 19900,
      },
      error: null,
    })

    await call(body())

    expect(quoteConfigurationMock.mock.calls[0][1].variantPricing).toEqual({
      margin_override_pct: 140,
      manual_price_override_cents: 19900,
    })
  })

  it('runs the engine inside the public provider reserve', async () => {
    await call(body())

    expect(withProviderReserveMock).toHaveBeenCalledTimes(1)
    expect(withProviderReserveMock.mock.calls[0][0]).toBe(8)
    // The engine ran inside the wrapper, not beside it.
    const order = withProviderReserveMock.mock.invocationCallOrder[0]
    expect(quoteConfigurationMock.mock.invocationCallOrder[0]).toBeGreaterThan(order)
  })

  it('passes the FULL cached catalog tree and the master pixels to the engine', async () => {
    await call(body({ solidHex: '#AABBCC', optionIds: [3] }))

    expect(getFullCatalogCachedMock).toHaveBeenCalledTimes(1)
    const [client, input, opts] = quoteConfigurationMock.mock.calls[0]
    expect(client).toBe(serviceClient)
    expect(input).toMatchObject({ optionIds: [3], solidHex: '#AABBCC' })
    expect(opts.catalog).toBe(FULL_TREE)
    expect(opts.master).toEqual({ printWidthPx: 4800, printHeightPx: 6000 })
  })

  it('reads only public-safe product columns', async () => {
    await call(body())

    const productSelect = selectedColumns.find((c) => c.table === 'products')
    expect(productSelect?.columns).toBe('id, status, prints_enabled')
    const settingsSelect = selectedColumns.find((c) => c.table === 'site_settings')
    expect(settingsSelect?.columns).toBe('print_configurator_enabled')
  })

  it('never returns wholesale cost, shipping or per-option deltas to a public caller', async () => {
    const response = await call(body())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(Object.keys(payload).sort()).toEqual([
      'available',
      'labels',
      'lineHash',
      'ok',
      'outerHeightIn',
      'outerWidthIn',
      'priceCents',
      'priceKeyHash',
      'stale',
      'violations',
    ])
    expect(payload.priceCents).toBe(6560)
    expect(payload.priceKeyHash).toBe('price-key-hash')
    expect(payload.lineHash).toBe('line-hash')
    expect(payload.labels).toEqual([
      { group_key: 'mat_size', group_label: 'Mat', option_id: 64, option_label: 'No Mat' },
    ])
    // The fixture's label carries a 2052-cent wholesale delta; none of it may survive.
    for (const label of payload.labels) {
      expect(Object.keys(label).sort()).toEqual(['group_key', 'group_label', 'option_id', 'option_label'])
      expect(label.price_delta_cents).toBeUndefined()
    }
    expect(JSON.stringify(payload)).not.toContain('2052')
    expect(JSON.stringify(payload)).not.toContain('2080')
    expect(JSON.stringify(payload)).not.toContain('1200')
  })

  it('returns constraint violations with 200 so the configurator can render them', async () => {
    quoteConfigurationMock.mockResolvedValue(
      quoteResult({
        available: false,
        priceCents: 0,
        violations: [
          { code: 'glass_ceiling', message: 'That mat makes the frame larger than we can glaze.', groupKey: 'mat_size', optionId: 73 },
        ],
      }),
    )

    const response = await call(body({ optionIds: [73] }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.available).toBe(false)
    expect(payload.violations).toEqual([
      { code: 'glass_ceiling', message: 'That mat makes the frame larger than we can glaze.', groupKey: 'mat_size', optionId: 73 },
    ])
  })

  it('reports a stale, cache-served quote to the caller', async () => {
    quoteConfigurationMock.mockResolvedValue(quoteResult({ stale: true }))

    const payload = await (await call(body())).json()

    expect(payload.stale).toBe(true)
  })

  it('answers 503 provider_busy when the provider cannot be reached', async () => {
    quoteConfigurationMock.mockRejectedValue(new QuoteUnavailableError('sandbox 429 after 3 retries'))

    const response = await call(body())
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload).toEqual({ ok: false, code: 'provider_busy', error: BUSY_COPY })
    expect(JSON.stringify(payload)).not.toContain('sandbox')
  })

  it('answers 503 provider_busy with the same copy when fulfillment is switched off', async () => {
    quoteConfigurationMock.mockRejectedValue(new LumaprintsDisabledError('kill switch on'))

    const response = await call(body())

    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe(BUSY_COPY)
  })

  it('never leaks an unexpected internal error', async () => {
    quoteConfigurationMock.mockRejectedValue(new Error('relation "lumaprints_pricing_cache" does not exist'))

    const response = await call(body())
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(JSON.stringify(payload)).not.toContain('lumaprints_pricing_cache')
  })
})
