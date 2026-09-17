// Authored by DotWin
// The catalog READ host: the provider host by default; on a preview deploy (which talks
// to the sandbox provider while the catalog tables only hold production-host rows)
// `CATALOG_READ_HOST` points reads at the production rows. Production ignores it.

import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => { throw new Error('not used here') },
  createClient: async () => { throw new Error('not used here') },
}))
vi.mock('@/lib/catalog/walk', () => ({ catalogHost: () => 'us.api-sandbox.lumaprints.com' }))

const { catalogReadHost } = await import('@/lib/catalog/load')

describe('catalogReadHost', () => {
  it('reads the provider host when no override is set', () => {
    expect(catalogReadHost({})).toBe('us.api-sandbox.lumaprints.com')
    expect(catalogReadHost({ CATALOG_READ_HOST: '   ' })).toBe('us.api-sandbox.lumaprints.com')
  })

  it('honours the override outside production', () => {
    expect(catalogReadHost({ CATALOG_READ_HOST: 'us.api.lumaprints.com', VERCEL_ENV: 'preview' })).toBe('us.api.lumaprints.com')
    expect(catalogReadHost({ CATALOG_READ_HOST: ' us.api.lumaprints.com ' })).toBe('us.api.lumaprints.com')
  })

  it('ignores the override on production', () => {
    expect(catalogReadHost({ CATALOG_READ_HOST: 'us.api.lumaprints.com', VERCEL_ENV: 'production' })).toBe('us.api-sandbox.lumaprints.com')
  })
})
