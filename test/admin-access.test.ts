// @vitest-environment node
// Authored by DotWin
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getUser: vi.fn(), profile: vi.fn(), from: vi.fn(),
  headers: vi.fn(), mfa: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: h.getUser, get mfa() { h.mfa(); throw new Error('MFA must not be consulted') } },
  from: h.from,
}) }))
vi.mock('next/headers', () => ({ headers: h.headers }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
import { requireAdmin } from '@/lib/auth/require-admin'
import { requireAdminPage } from '@/lib/auth/admin-page-guard'
import { safeAdminReturnPath } from '@/lib/auth/admin-policy'

beforeEach(() => {
  vi.resetAllMocks()
  h.getUser.mockResolvedValue({ data: { user: { id: 'admin-user', factors: [] } }, error: null })
  h.profile.mockResolvedValue({ data: { role: 'admin' }, error: null })
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: h.profile }
  h.from.mockReturnValue(query)
  h.headers.mockResolvedValue(new Headers({ 'x-artbyme-path': '/admin/orders?status=new' }))
})

describe('password-only admin access', () => {
  it.each(['admin', 'artist'])('allows a %s session through both guards without factor APIs', async role => {
    h.profile.mockResolvedValue({ data: { role }, error: null })
    const api = await requireAdmin()
    expect(api.ok).toBe(true)
    if (!api.ok) throw new Error('Expected access')
    expect(api.role).toBe(role)
    expect(api.supabase.from).toBe(h.from)
    expect((await requireAdminPage()).role).toBe(role)
    expect(h.mfa).not.toHaveBeenCalled()
  })

  it('allows a previously enrolled admin without consulting the factor', async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: 'admin-user', factors: [{ factor_type: 'totp', status: 'verified' }] } }, error: null })
    expect((await requireAdmin()).ok).toBe(true)
    await expect(requireAdminPage()).resolves.toHaveProperty('role', 'admin')
    expect(h.mfa).not.toHaveBeenCalled()
  })

  it.each(['customer', '', null, 'ADMIN'])('denies a stored role of %s', async role => {
    h.profile.mockResolvedValue({ data: { role }, error: null })
    const api = await requireAdmin()
    expect(api.ok).toBe(false)
    if (api.ok) throw new Error('Expected denial')
    expect(api.response.status).toBe(403)
    await expect(api.response.json()).resolves.toEqual({ error: 'Forbidden' })
    await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/')
  })

  it.each([
    { data: null, error: null },
    { data: { role: 'admin' }, error: { message: 'Lookup failed' } },
  ])('denies missing or failed profile lookups', async result => {
    h.profile.mockResolvedValue(result)
    const api = await requireAdmin()
    expect(api.ok).toBe(false)
    if (!api.ok) expect(api.response.status).toBe(403)
    await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/')
  })

  it('does not trust a role in user-editable metadata', async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: 'customer', user_metadata: { role: 'admin' } } }, error: null })
    h.profile.mockResolvedValue({ data: { role: 'customer' }, error: null })
    expect((await requireAdmin()).ok).toBe(false)
    await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/')
  })

  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: 'admin-user' } }, error: { message: 'Invalid token' } },
  ])('rejects missing or invalid sessions before any profile lookup', async result => {
    h.getUser.mockResolvedValue(result)
    const api = await requireAdmin()
    expect(api.ok).toBe(false)
    if (!api.ok) expect(api.response.status).toBe(401)
    await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/login?redirect=%2Fadmin%2Forders%3Fstatus%3Dnew')
    expect(h.from).not.toHaveBeenCalled()
  })
})

describe('admin sign-in return paths', () => {
  it.each([undefined, null, '', 'https://example.test/admin', '//example.test/admin', '/account', '/administrator'])('falls back safely for %s', path => {
    expect(safeAdminReturnPath(path)).toBe('/admin')
  })
  it('preserves an admin page and query', () => {
    expect(safeAdminReturnPath('/admin/orders?status=new')).toBe('/admin/orders?status=new')
  })
})
