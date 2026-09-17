// Authored by DotWin
// The P5 router guard rule, on its own: a Stripe test-mode order may reach the print
// provider only when the provider host is a sandbox. Everything else is allowed,
// including an order with no recorded mode (treated as live: refusing it would strand
// a paying customer, whereas the guarded case costs real money).

import { describe, expect, it } from 'vitest'
import { providerGuard, providerHostIsSandbox } from '@/lib/fulfillment/provider-guard'

describe('providerHostIsSandbox', () => {
  it('recognises the LumaPrints sandbox host and nothing else', () => {
    expect(providerHostIsSandbox('us.api-sandbox.lumaprints.com')).toBe(true)
    expect(providerHostIsSandbox('sandbox.lumaprints.com')).toBe(true)
    expect(providerHostIsSandbox('us.api.lumaprints.com')).toBe(false)
    expect(providerHostIsSandbox('unknown-host')).toBe(false)
    expect(providerHostIsSandbox('')).toBe(false)
    expect(providerHostIsSandbox(null)).toBe(false)
    expect(providerHostIsSandbox(undefined)).toBe(false)
    // "sandboxed" is not the sandbox: the word must stand alone between separators.
    expect(providerHostIsSandbox('sandboxed.lumaprints.com')).toBe(false)
  })
})

describe('providerGuard', () => {
  it('refuses a test-mode order on the production host', () => {
    const decision = providerGuard({ stripeMode: 'test', host: 'us.api.lumaprints.com' })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reason).toMatch(/test-mode order must not reach the production print provider/)
  })

  it('refuses a test-mode order when the host is unknown', () => {
    expect(providerGuard({ stripeMode: 'test', host: null }).allowed).toBe(false)
    expect(providerGuard({ stripeMode: 'test', host: 'unknown-host' }).allowed).toBe(false)
  })

  it('allows a test-mode order on the sandbox host', () => {
    expect(providerGuard({ stripeMode: 'test', host: 'us.api-sandbox.lumaprints.com' })).toEqual({ allowed: true })
  })

  it('allows live and unknown-mode orders on any host', () => {
    expect(providerGuard({ stripeMode: 'live', host: 'us.api.lumaprints.com' })).toEqual({ allowed: true })
    expect(providerGuard({ stripeMode: 'live', host: 'us.api-sandbox.lumaprints.com' })).toEqual({ allowed: true })
    expect(providerGuard({ stripeMode: null, host: 'us.api.lumaprints.com' })).toEqual({ allowed: true })
    expect(providerGuard({ stripeMode: undefined, host: 'us.api.lumaprints.com' })).toEqual({ allowed: true })
  })
})
