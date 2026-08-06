import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { issueCartToken, verifyCartToken } from '@/lib/cart/token'

// Route-level proof of the derive-or-reject contract on the only public route
// that can create a cart. The cart id reaching track_cart must come from a
// signature the server produced, never from the request body, and the response
// must never hand a raw cart id back to the browser.

const rpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({ rpc }),
  createClient: async () => ({ rpc }),
}))

vi.mock('@/lib/crm/contacts', () => ({
  upsertContact: async () => null,
}))

const { POST } = await import('@/app/api/cart/track/route')

const CART_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const ATTACKER_TARGET_ID = '11111111-2222-4333-8444-555555555555'
const SECRET = 'cart-track-route-suite-signing-material'
const DAY_MS = 24 * 60 * 60 * 1000

const originalSecret = process.env.SITE_AUTH_SECRET
let ipCounter = 0

const ITEMS = [{
  productId: '22222222-3333-4444-8555-666666666666',
  variantId: '33333333-4444-4555-8666-777777777777',
  title: 'Test Artwork — 18 × 24 Canvas',
  price: 125,
  quantity: 1,
}]

/**
 * Route the shared mock by RPC name: the route now hits rate_limit_hit through
 * the same service client before it ever reaches track_cart, so the limiter
 * gets a healthy allow row and only track_cart returns the per-test result.
 */
function mockTrackCart(result: { data: unknown; error: unknown }): void {
  rpc.mockImplementation((fn: string) =>
    fn === 'rate_limit_hit'
      ? Promise.resolve({ data: [{ allowed: true, remaining: 59, retry_after_ms: 0 }], error: null })
      : Promise.resolve(result),
  )
}

/** Calls that reached the cart table, ignoring the limiter's own RPC traffic. */
function trackCartCalls(): unknown[][] {
  return rpc.mock.calls.filter((call) => call[0] === 'track_cart')
}

beforeEach(() => {
  process.env.SITE_AUTH_SECRET = SECRET
  rpc.mockReset()
  mockTrackCart({ data: null, error: null })
  // A fresh client IP per request keeps the in-memory rate limiter out of the way.
  ipCounter += 1
})

afterEach(() => {
  vi.useRealTimers()
  if (originalSecret === undefined) delete process.env.SITE_AUTH_SECRET
  else process.env.SITE_AUTH_SECRET = originalSecret
})

function trackRequest(body: Record<string, unknown>): Request {
  return new Request('https://artbyme.studio/api/cart/track', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `203.0.113.${ipCounter % 250}`,
    },
    body: JSON.stringify(body),
  })
}

/** Issue a token as if it had been minted `daysAgo` days in the past. */
function issueAgedToken(cartId: string, daysAgo: number): string {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(Date.now() - daysAgo * DAY_MS))
  const token = issueCartToken(cartId)
  vi.useRealTimers()
  return token
}

function presentedCartId(): string | null {
  const call = trackCartCalls()[0] as [string, { p_cart_id?: string | null }] | undefined
  return call?.[1]?.p_cart_id ?? null
}

describe('POST /api/cart/track token derivation', () => {
  it('sends the token-derived cart id to track_cart and returns no raw cart id', async () => {
    mockTrackCart({ data: CART_ID, error: null })
    const token = issueCartToken(CART_ID)

    const response = await POST(trackRequest({ cartToken: token, items: ITEMS, subtotal: 125 }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('track_cart', expect.objectContaining({ p_cart_id: CART_ID }))
    expect(body.ok).toBe(true)
    // Still far from expiry, so no replacement is issued.
    expect(body.cartToken).toBeNull()
    expect(JSON.stringify(body)).not.toContain(CART_ID)
  })

  it('ignores a bare cart UUID: the hard cutover accepts no legacy identifiers', async () => {
    mockTrackCart({ data: CART_ID, error: null })

    const response = await POST(
      trackRequest({ cartToken: ATTACKER_TARGET_ID, items: ITEMS, subtotal: 125 }),
    )
    const body = await response.json()

    expect(presentedCartId()).toBeNull()
    expect(rpc).toHaveBeenCalledWith('track_cart', expect.objectContaining({ p_cart_id: null }))
    // A fresh cart was started for this caller, addressed by a signed token.
    expect(verifyCartToken(body.cartToken)).toBe(CART_ID)
  })

  it('ignores a forged token whose signature does not verify', async () => {
    mockTrackCart({ data: CART_ID, error: null })
    const real = issueCartToken(CART_ID)
    const [version, , expiresAt, signature] = real.split('.')
    const forged = `${version}.${ATTACKER_TARGET_ID}.${expiresAt}.${signature}`

    await POST(trackRequest({ cartToken: forged, items: ITEMS, subtotal: 125 }))

    expect(presentedCartId()).toBeNull()
  })

  it('ignores an expired token and starts a fresh cart silently', async () => {
    mockTrackCart({ data: CART_ID, error: null })
    const expired = issueAgedToken(ATTACKER_TARGET_ID, 40)

    const response = await POST(trackRequest({ cartToken: expired, items: ITEMS, subtotal: 125 }))
    const body = await response.json()

    expect(presentedCartId()).toBeNull()
    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(verifyCartToken(body.cartToken)).toBe(CART_ID)
  })

  it('issues a token for a cart created on the first sync', async () => {
    mockTrackCart({ data: CART_ID, error: null })

    const response = await POST(trackRequest({ items: ITEMS, subtotal: 125 }))
    const body = await response.json()

    expect(presentedCartId()).toBeNull()
    expect(verifyCartToken(body.cartToken)).toBe(CART_ID)
  })

  it('re-issues a token inside the renewal window for the same cart', async () => {
    mockTrackCart({ data: CART_ID, error: null })
    const aging = issueAgedToken(CART_ID, 20)

    const response = await POST(trackRequest({ cartToken: aging, items: ITEMS, subtotal: 125 }))
    const body = await response.json()

    expect(presentedCartId()).toBe(CART_ID)
    expect(body.cartToken).toBeTruthy()
    expect(body.cartToken).not.toBe(aging)
    expect(verifyCartToken(body.cartToken)).toBe(CART_ID)
  })

  it('re-issues when track_cart settles on a different cart than the token named', async () => {
    // The named cart row is gone, so the RPC inserts a replacement.
    mockTrackCart({ data: ATTACKER_TARGET_ID, error: null })
    const token = issueCartToken(CART_ID)

    const response = await POST(trackRequest({ cartToken: token, items: ITEMS, subtotal: 125 }))
    const body = await response.json()

    expect(presentedCartId()).toBe(CART_ID)
    expect(verifyCartToken(body.cartToken)).toBe(ATTACKER_TARGET_ID)
  })

  it('short-circuits an empty cart with no usable token without touching the cart tables', async () => {
    const response = await POST(trackRequest({ cartToken: ATTACKER_TARGET_ID, items: [] }))
    const body = await response.json()

    expect(trackCartCalls()).toHaveLength(0)
    expect(body).toEqual({ ok: true, cartToken: null })
  })

  it('rejects an over-long token at the schema boundary', async () => {
    const response = await POST(
      trackRequest({ cartToken: 'v1.' + 'x'.repeat(600), items: ITEMS, subtotal: 125 }),
    )

    expect(response.status).toBe(400)
    expect(trackCartCalls()).toHaveLength(0)
  })
})
