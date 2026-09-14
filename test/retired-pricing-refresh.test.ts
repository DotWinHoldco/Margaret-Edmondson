import { beforeEach, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), rpc: vi.fn(), compute: vi.fn(), quote: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: h.auth }))
vi.mock('@/lib/pricing/compute', () => ({ computeCustomerPrice: h.compute, resolveMargin: vi.fn() }))
vi.mock('@/lib/pricing/shipping-quote', () => ({ quoteWorstCaseCONUS: h.quote }))
import { POST } from '@/app/api/admin/pricing/refresh/route'

beforeEach(() => vi.resetAllMocks())
it('preserves the authorization response before revealing the retired pricing path', async () => {
  const denied = Response.json({ error: 'Forbidden' }, { status: 403 })
  h.auth.mockResolvedValue({ ok: false, response: denied })
  expect(await POST()).toBe(denied)
  expect(h.from).not.toHaveBeenCalled()
})
it('returns a helpful410 for an admin without querying, quoting, or changing prices', async () => {
  h.auth.mockResolvedValue({ ok: true, supabase: { from: h.from, rpc: h.rpc } })
  const response = await POST()
  expect(response.status).toBe(410)
  expect(await response.json()).toMatchObject({
    code: 'RETIRED_PRICING_PATH',
    error: expect.stringContaining('Refresh all prices'),
    details: { productsPath: '/admin/products', refreshPath: '/api/admin/variants/refresh' },
  })
  expect(h.from).not.toHaveBeenCalled()
  expect(h.rpc).not.toHaveBeenCalled()
  expect(h.compute).not.toHaveBeenCalled()
  expect(h.quote).not.toHaveBeenCalled()
})
