// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server'
import nextConfig from '../next.config'

describe('Stripe callback canonical hostname routing', () => {
  it('keeps the existing apex Stripe callback directly reachable with query parameters', async () => {
    const response = await unstable_getResponseFromNextConfig({ url: 'https://artbyme.studio/api/webhooks/stripe?check=1', nextConfig })
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })
  it.each(['/', '/classes/festive-paint-marion-il?source=invite', '/admin', '/api/classes/festive/checkout', '/api/webhooks/stripe-other', '/logo.svg'])(
    'preserves the www canonical redirect for %s', async path => {
      const response = await unstable_getResponseFromNextConfig({ url: `https://artbyme.studio${path}`, nextConfig })
      expect(response.status).toBe(308)
      expect(response.headers.get('location')).toBe(`https://www.artbyme.studio${path}`)
    },
  )
  it.each(['https://www.artbyme.studio/classes', 'https://candidate.vercel.app/classes'])(
    'does not redirect the canonical or preview host %s', async url => {
      const response = await unstable_getResponseFromNextConfig({ url, nextConfig })
      expect(response.status).toBe(200)
    },
  )
})
