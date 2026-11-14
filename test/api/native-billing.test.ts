// @vitest-environment node
// Authored by DotWin
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mocks.auth }))
import { GET, POST } from '@/app/api/admin/billing/route'

beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllGlobals()
  mocks.auth.mockResolvedValue({ ok: true, user: { id: 'site-admin' }, supabase: { auth: { getSession: mocks.session } } })
  mocks.session.mockResolvedValue({ data: { session: { user: { id: 'site-admin' }, access_token: 'verified-session-token' } }, error: null })
})

describe('native billing proxy', () => {
  it('requires admin authorization before contacting the main merchant', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) })
    expect((await GET(new Request('https://www.artbyme.studio/api/admin/billing'))).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects cross-origin mutations even with a signed-in admin', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const response = await POST(new Request('https://www.artbyme.studio/api/admin/billing', { method: 'POST', headers: { origin: 'https://other.example', 'content-type': 'application/json' }, body: '{}' }))
    expect(response.status).toBe(403); expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects caller-supplied customer/subscription identifiers', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const response = await POST(new Request('https://www.artbyme.studio/api/admin/billing', { method: 'POST', headers: { origin: 'https://www.artbyme.studio', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'set_renewal', renew: false, requestId: '00000000-0000-4000-8000-000000000001', customer: 'cus_other' }) }))
    expect(response.status).toBe(400); expect(fetcher).not.toHaveBeenCalled()
  })
  it('forwards only the authenticated session to the fixed DotWin service', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ plan: { amount: 9700 } })); vi.stubGlobal('fetch', fetcher)
    const response = await GET(new Request('https://www.artbyme.studio/api/admin/billing?customer=cus_other&endpoint=https://other.example'))
    expect(String(fetcher.mock.calls[0][0])).toBe('https://entrepreneurs.win/api/client-billing/artbyme')
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer verified-session-token')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(JSON.stringify(await response.json())).not.toContain('verified-session-token')
  })
  it('does not forward a session belonging to another identity', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    mocks.session.mockResolvedValue({ data: { session: { user: { id: 'another-user' }, access_token: 'another-token' } }, error: null })
    expect((await GET(new Request('https://www.artbyme.studio/api/admin/billing'))).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
