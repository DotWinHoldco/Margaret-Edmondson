import { describe, expect, it } from 'vitest'
import { safeInternalPath } from '@/lib/navigation/safe-redirect'

describe('safeInternalPath', () => {
  it('keeps a same-origin path, query, and fragment', () => {
    expect(safeInternalPath('/shop/art/solo?size=18#details', '/account'))
      .toBe('/shop/art/solo?size=18#details')
  })

  it.each([
    'https://evil.example/phish',
    '//evil.example/phish',
    '/\\evil.example/phish',
    '\\evil.example/phish',
    'javascript:alert(1)',
    '\n/admin',
  ])('rejects an unsafe redirect (%s)', (value) => {
    expect(safeInternalPath(value, '/account')).toBe('/account')
  })

  it('uses the fallback for a missing or malformed value', () => {
    expect(safeInternalPath(null, '/')).toBe('/')
    expect(safeInternalPath('/%zz', '/account')).toBe('/account')
  })
})
