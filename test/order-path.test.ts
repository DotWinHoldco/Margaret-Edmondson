import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { grossMarginPct, customerPriceCents } from '@/lib/pricing/variant-pricing'
import { recomputeOrderStatus } from '@/lib/fulfillment/order-status'

// ---------------------------------------------------------------------------
// gross margin
// ---------------------------------------------------------------------------
describe('grossMarginPct', () => {
  it('is (price − cost − shipping) / price', () => {
    // landed 3895¢, 100% markup → price 7790¢; gross = 3895/7790 = 50%
    const price = customerPriceCents(
      { lumaprints_cost_cents: 2595, shipping_cost_cents: 1300, margin_override_pct: null, manual_price_override_cents: null },
      100,
    )
    expect(price).toBe(7790)
    expect(grossMarginPct(price, 2595, 1300)).toBeCloseTo(50, 6)
  })
  it('is 0 for a non-positive price', () => {
    expect(grossMarginPct(0, 100, 50)).toBe(0)
  })
  it('goes negative when price is below landed cost', () => {
    expect(grossMarginPct(1000, 900, 300)).toBeLessThan(0)
  })
})

// ---------------------------------------------------------------------------
// recomputeOrderStatus
// ---------------------------------------------------------------------------
function mockSupabase(order: { status: string } | null, itemStatuses: string[]) {
  const updates: Array<Record<string, unknown>> = []
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              if (table === 'orders') {
                return { maybeSingle: async () => ({ data: order ? { id: 'o1', status: order.status } : null }) }
              }
              // order_items: awaited directly
              return Promise.resolve({ data: itemStatuses.map((s) => ({ fulfillment_status: s })) })
            },
          }
        },
        update(patch: Record<string, unknown>) {
          return { eq: async () => { updates.push(patch); return { data: null } } }
        },
      }
    },
  }
  return { client, updates }
}

describe('recomputeOrderStatus transitions', () => {
  it('all delivered → delivered', async () => {
    const { client, updates } = mockSupabase({ status: 'processing' }, ['delivered', 'delivered'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recomputeOrderStatus(client as any, 'o1')
    expect(updates).toEqual([{ status: 'delivered' }])
  })
  it('all shipped/delivered → shipped', async () => {
    const { client, updates } = mockSupabase({ status: 'processing' }, ['shipped', 'delivered'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recomputeOrderStatus(client as any, 'o1')
    expect(updates).toEqual([{ status: 'shipped' }])
  })
  it('some shipped → partially_fulfilled', async () => {
    const { client, updates } = mockSupabase({ status: 'processing' }, ['shipped', 'pending'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recomputeOrderStatus(client as any, 'o1')
    expect(updates).toEqual([{ status: 'partially_fulfilled' }])
  })
  it('none shipped → no update', async () => {
    const { client, updates } = mockSupabase({ status: 'processing' }, ['pending', 'submitted'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recomputeOrderStatus(client as any, 'o1')
    expect(updates).toEqual([])
  })
  it('never downgrades a refunded/cancelled order', async () => {
    const { client, updates } = mockSupabase({ status: 'refunded' }, ['shipped', 'delivered'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recomputeOrderStatus(client as any, 'o1')
    expect(updates).toEqual([])
  })
  it('no-op when the rolled status equals the current status', async () => {
    const { client, updates } = mockSupabase({ status: 'shipped' }, ['shipped', 'shipped'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recomputeOrderStatus(client as any, 'o1')
    expect(updates).toEqual([])
  })

  // P2-6: an in-flight or stranded item must NOT let the order roll up to shipped.
  it('P2-6: a stranded submitting item caps the order at partially_fulfilled', async () => {
    const { client, updates } = mockSupabase({ status: 'processing' }, ['shipped', 'submitting'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recomputeOrderStatus(client as any, 'o1')
    expect(updates).toEqual([{ status: 'partially_fulfilled' }])
  })
  it('P2-6: a failed item prevents a shipped rollup', async () => {
    const { client, updates } = mockSupabase({ status: 'processing' }, ['shipped', 'failed'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recomputeOrderStatus(client as any, 'o1')
    expect(updates).toEqual([{ status: 'partially_fulfilled' }])
  })
  it('P2-6: all delivered but one still in_production → not delivered', async () => {
    const { client, updates } = mockSupabase({ status: 'processing' }, ['delivered', 'in_production'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recomputeOrderStatus(client as any, 'o1')
    expect(updates).toEqual([{ status: 'partially_fulfilled' }])
  })
})

// ---------------------------------------------------------------------------
// submitOrder — POST /api/v1/orders body shape (the documented contract)
// ---------------------------------------------------------------------------
describe('submitOrder payload shape', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('LUMAPRINTS_API_KEY', 'k')
    vi.stubEnv('LUMAPRINTS_API_SECRET', 's')
    vi.stubEnv('LUMAPRINTS_STORE_ID', '42')
    vi.stubEnv('LUMAPRINTS_BASE_URL', 'https://us.api-sandbox.lumaprints.com')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('builds the documented order body with width/height/file.imageUrl/externalItemId', async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null
    const fetchMock = vi.fn(async (url: string, opts: { body: string }) => {
      captured = { url, body: JSON.parse(opts.body) }
      return { ok: true, status: 201, json: async () => ({ orderNumber: 123 }), text: async () => '' } as unknown as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const { submitOrder } = await import('@/lib/integrations/lumaprints')
    const res = await submitOrder({
      externalId: 'order-1',
      recipient: { firstName: 'Ada', lastName: 'Lovelace', addressLine1: '1 Main St', city: 'Austin', state: 'TX', zipCode: '78701', country: 'US' },
      orderItems: [
        { externalItemId: 'item-1', subcategoryId: 101002, quantity: 1, width: 18, height: 24, file: { imageUrl: 'https://x/print/1.tif' }, orderItemOptions: [] },
      ],
    })

    expect(captured).not.toBeNull()
    const c = captured!
    expect(c.url).toContain('/api/v1/orders')
    expect(c.body.externalId).toBe('order-1')
    expect(c.body.storeId).toBe(42) // number, not "42"
    expect(c.body.shippingMethod).toBe('default')
    expect(c.body.productionTime).toBe('regular')
    expect((c.body.recipient as Record<string, unknown>).zipCode).toBe('78701')
    const oi = (c.body.orderItems as Array<Record<string, unknown>>)[0]
    expect(oi).toMatchObject({ externalItemId: 'item-1', subcategoryId: 101002, quantity: 1, width: 18, height: 24, orderItemOptions: [] })
    expect((oi.file as Record<string, unknown>).imageUrl).toBe('https://x/print/1.tif')
    expect(res.orderNumber).toBe(123)
  })

  it('throws (does not send storeId:null) when LUMAPRINTS_STORE_ID is unset', async () => {
    vi.stubEnv('LUMAPRINTS_STORE_ID', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { submitOrder } = await import('@/lib/integrations/lumaprints')
    await expect(
      submitOrder({
        externalId: 'o',
        recipient: { firstName: 'A', lastName: 'B', addressLine1: '1', city: 'C', state: 'TX', zipCode: '78701', country: 'US' },
        orderItems: [{ externalItemId: 'i', subcategoryId: 1, quantity: 1, width: 1, height: 1, file: { imageUrl: 'https://x/y' }, orderItemOptions: [] }],
      }),
    ).rejects.toThrow(/STORE_ID/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
