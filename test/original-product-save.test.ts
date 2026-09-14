import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), service: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: h.auth }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: h.service }))
vi.mock('@/lib/api/audit-log', () => ({ logChanges: h.audit }))
vi.mock('@/lib/pricing/margin', () => ({ recomputeProductVariantPrices: vi.fn() }))
import { PATCH, DELETE } from '@/app/api/admin/products/[id]/route'

const productId = '11111111-1111-4111-8111-111111111111'
const originalId = '22222222-2222-4222-8222-222222222222'
const printId = '33333333-3333-4333-8333-333333333333'
const context = { params: Promise.resolve({ id: productId }) }
const request = (body: object) => new NextRequest('http://localhost/api/admin/products/' + productId, {
  method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
})

function query(result: object) {
  const q: Record<string, unknown> = {}
  for (const method of ['select', 'update', 'insert', 'delete', 'eq', 'in', 'single']) q[method] = vi.fn(() => q)
  q.then = (resolve: (value: object) => void) => resolve(result)
  return q as Record<string, ReturnType<typeof vi.fn>>
}

beforeEach(() => {
  vi.resetAllMocks()
  h.auth.mockResolvedValue({ ok: true, user: { id: 'admin' }, supabase: { from: h.from } })
  h.service.mockResolvedValue({ from: h.from })
})

describe('original option ownership during product saves', () => {
  it.each([{ variants: [] }, { variants: [{ id: originalId, name: 'Stale original', price: 1 }, { id: printId, name: 'Stale print', price: 1 }] }])(
    'preserves trigger-created originals and provider prints with legacy variants $variants', async ({ variants }) => {
      const before = query({ data: { id: productId, is_original: false, base_price: 450 }, error: null })
      const update = query({ error: null })
      const existing = query({ data: [
        { id: originalId, medium: null, variant_type: 'original' },
        { id: printId, medium: 'canvas', variant_type: 'canvas_print' },
      ], error: null })
      h.from.mockReturnValueOnce(before).mockReturnValueOnce(update).mockReturnValueOnce(existing)
        .mockReturnValueOnce(query({ data: { id: productId }, error: null }))
      const response = await PATCH(request({ is_original: true, base_price: 650, variants }), context)
      expect(response.status).toBe(200)
      expect(h.from.mock.calls.map(([table]) => table)).toEqual(['products', 'products', 'product_variants', 'products'])
      expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ is_original: true, base_price: 650 }))
      expect(existing.delete).not.toHaveBeenCalled()
      expect(existing.update).not.toHaveBeenCalled()
    },
  )

  it('returns the original price validation without reporting a successful save', async () => {
    h.from.mockReturnValueOnce(query({ data: { id: productId }, error: null }))
      .mockReturnValueOnce(query({ error: { code: '23514', message: 'Original artwork needs a positive Base price up to $1,000,000.' } }))
    const response = await PATCH(request({ is_original: true, base_price: 0 }), context)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'ORIGINAL_PRICE_REQUIRED' })
    expect(h.audit).not.toHaveBeenCalled()
  })
})

describe('archive lookup failures', () => {
  it.each([
    [{ code: 'PGRST116', message: 'Missing row' }, 404],
    [{ code: '08006', message: 'Connection failed' }, 500],
  ])('does not archive or audit after lookup error %j', async (error, status) => {
    const lookup = query({ data: null, error })
    h.from.mockReturnValue(lookup)
    const response = await DELETE(request({}), context)
    expect(response.status).toBe(status)
    expect(h.from).toHaveBeenCalledTimes(1)
    expect(lookup.update).not.toHaveBeenCalled()
    expect(h.audit).not.toHaveBeenCalled()
  })
})
