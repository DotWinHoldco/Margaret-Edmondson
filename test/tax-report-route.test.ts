import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), range: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: h.auth }))
import { GET } from '@/app/api/admin/tax-report/route'
const request = (period = '30d') => new Request(`https://example.test/api/admin/tax-report?period=${period}`)
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-14T18:00:00Z'))
  h.auth.mockResolvedValue({ ok: true, supabase: { from: h.from } })
  h.from.mockImplementation((table: string) => {
    const query = { select: () => query, gte: () => query, lt: () => query, order: () => query, eq: () => query, in: () => query,
      maybeSingle: async () => ({ data: { tax_nexus_states: ['TX'] }, error: null }),
      range: (from: number, to: number) => h.range(table, from, to),
    }
    return query
  })
  h.range.mockResolvedValue({ data: [], error: null })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
it('requires admin authentication before any database read', async () => {
  h.auth.mockResolvedValue({ ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) })
  expect((await GET(request())).status).toBe(403)
  expect(h.from).not.toHaveBeenCalled()
})
it('rejects unsupported date ranges', async () => {
  expect((await GET(request('anything'))).status).toBe(400)
  expect(h.from).not.toHaveBeenCalled()
})
it('uses the authenticated RLS client and returns private, uncached complete empty results', async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toMatchObject({ rows: [{ state: 'TX', currentlySelected: true, recordedTaxCents: 0 }], overview: { paidOrderCount: 0 } })
  expect(h.from).toHaveBeenCalledWith('orders')
  expect(h.from).toHaveBeenCalledWith('site_settings')
})
it('fails instead of presenting a partial or unreadable order total as zero', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.range.mockResolvedValue({ data: null, error: { message: 'denied' } })
  const response = await GET(request())
  expect(response.status).toBe(500)
  expect(await response.json()).toMatchObject({ code: 'REPORT_UNAVAILABLE' })
})
it('reads refund events for the report orders without assuming refunds fall inside the sale dates', async () => {
  h.range.mockImplementation(async (table: string) => ({ error: null, data: table === 'orders' ? [{ id: 'o1', order_number: 1, created_at: '2026-09-10T18:00:00Z', status: 'processing', total: 108.25, tax: 8.25, tax_included: true, shipping_address: { country: 'US', state: 'TX' }, stripe_mode: 'live', stripe_payment_intent_id: 'pi_test', stripe_checkout_session_id: null }] : [{ id: 'e1', order_id: 'o1', detail: { status: 'succeeded', refund_id: 're_1' } }] }))
  const response = await GET(request())
  expect(await response.json()).toMatchObject({ totals: { refundReviewOrderCount: 1, recordedTaxCents: 825, fullRefundTaxCents: 0 } })
  expect(h.from).toHaveBeenCalledWith('studio_order_events')
})
