// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/classes/festive/registration/route'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), reconcile: vi.fn(), rate: vi.fn() }))
vi.mock('@/lib/classes/festive/server', async importOriginal => ({ ...await importOriginal<object>(), artRpc: mocks.rpc }))
vi.mock('@/lib/classes/festive/reconcile', () => ({ reconcileArtPayment: mocks.reconcile }))
vi.mock('@/lib/api/rate-limit', () => ({ rateLimit: mocks.rate, rateLimitResponse: () => new Response(null, { status: 429 }) }))
const body = { id: '2391680e-8b4f-461c-a049-33f737796d33', token: 'a'.repeat(64), classSlug: 'festive-paint-marion-il' }
const pending = { id: body.id, class_slug: body.classSlug, status: 'pending' }
const request = (changes = {}, origin = 'https://www.artbyme.studio') => new Request('https://www.artbyme.studio/api/classes/festive/registration', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...changes }),
})
beforeEach(() => { vi.clearAllMocks(); mocks.rate.mockResolvedValue({ ok: true }); mocks.reconcile.mockResolvedValue(undefined) })
describe('private class confirmation boundary', () => {
  it('returns the newly persisted paid state after provider reconciliation', async () => {
    mocks.rpc.mockResolvedValueOnce(pending).mockResolvedValueOnce({ ...pending, status: 'paid' })
    const response = await POST(request())
    expect((await response.json()).order.status).toBe('paid')
    expect(mocks.reconcile).toHaveBeenCalledWith(pending)
  })
  it.each([null, { ...pending, class_slug: 'festive-paint-at-the-market' }])('does not contact Stripe for an invalid capability or different class', async order => {
    mocks.rpc.mockResolvedValue(order)
    expect((await POST(request())).status).toBe(404)
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })
  it('does not accept a paid status supplied by the browser', async () => {
    expect((await POST(request({ status: 'paid' }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })
  it('rejects cross-origin requests and rate-limited polls', async () => {
    expect((await POST(request({}, 'https://untrusted.example'))).status).toBe(400)
    mocks.rate.mockResolvedValue({ ok: false })
    expect((await POST(request())).status).toBe(429)
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })
  it('keeps a provider failure pending rather than inventing a paid state', async () => {
    mocks.rpc.mockResolvedValue(pending)
    mocks.reconcile.mockRejectedValue(new Error('Provider unavailable'))
    const response = await POST(request())
    expect((await response.json()).order.status).toBe('pending')
  })
})
