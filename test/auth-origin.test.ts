// Authored by DotWin
// Sign-in flows return to the origin the person is standing on, so a preview deploy
// finishes Google sign-in on its own domain; the configured site URL is the fallback.

import { describe, expect, it } from 'vitest'
import { authOrigin } from '@/lib/supabase/auth'

describe('authOrigin', () => {
  it('prefers the browser origin over the configured site URL', () => {
    expect(authOrigin({ NEXT_PUBLIC_SITE_URL: 'https://www.artbyme.studio' }, 'https://margaret-edmondson-git-x-dotwinholdcos-projects.vercel.app'))
      .toBe('https://margaret-edmondson-git-x-dotwinholdcos-projects.vercel.app')
  })

  it('falls back to the configured site URL, normalised, when there is no browser origin', () => {
    expect(authOrigin({ NEXT_PUBLIC_SITE_URL: 'https://www.artbyme.studio/' }, null)).toBe('https://www.artbyme.studio')
    expect(authOrigin({ NEXT_PUBLIC_SITE_URL: 'www.artbyme.studio' }, null)).toBe('https://www.artbyme.studio')
    expect(authOrigin({ NEXT_PUBLIC_SITE_URL: ' https://www.artbyme.studio  ' }, null)).toBe('https://www.artbyme.studio')
  })

  it('never produces "undefined/auth/callback" when nothing is configured', () => {
    expect(authOrigin({}, null)).toBe('')
  })
})
