/**
 * Signed, expiring guest-cart tokens.
 *
 * A guest cart is identified server-side by a `carts.id` UUID. That id used to
 * travel to the browser and come back on every public cart call, which turned it
 * into a bearer capability: anyone who learned or guessed a cart id could read
 * that cart's shipping surcharge, pin a cart-scoped discount code to it, or
 * overwrite its contents through the public cart APIs. This module replaces the
 * bare id with a token the server signs and the browser can only carry.
 *
 * Format (four dot-separated fields, no JSON, no base64 padding):
 *
 *   v1.<cartId>.<expiresAtEpochSeconds>.<base64url HMAC-SHA256>
 *
 * The MAC covers exactly `v1.<cartId>.<expiresAt>` and is keyed by
 * SITE_AUTH_SECRET, so the cart id and its expiry are both tamper-evident. The
 * expiry rides inside the signed material rather than in a revocation table:
 * cart tokens are high volume and disposable, and a database round trip per
 * verification would buy nothing that a 30 day TTL plus secret rotation does not
 * already provide.
 *
 * Verification is total. Every malformed, forged, or stale input returns null
 * instead of throwing, because the public cart routes must read "no usable
 * token" as "this shopper has no server-side cart yet" and quietly start a fresh
 * one rather than surface an error in the middle of a purchase.
 *
 * Server-only: this module uses node:crypto and must never be imported from a
 * client component. The browser treats the token as an opaque string.
 */

import crypto from 'node:crypto'

const TOKEN_VERSION = 'v1'

/** Longest token any public route will read before rejecting it outright. */
export const CART_TOKEN_MAX_LENGTH = 512

/** Lifetime of a freshly issued cart token: 30 days. */
export const CART_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * Sliding-renewal threshold: 15 days. A presented token with less than this much
 * life left is replaced in the response so an actively shopping visitor never
 * loses their cart to an expiry, while an abandoned token still ages out.
 */
export const CART_TOKEN_RENEWAL_THRESHOLD_SECONDS = 15 * 24 * 60 * 60

// Outside production a clearly marked development key keeps local work and the
// test suite running without a configured environment. A token signed with it
// can never verify under production configuration, and production refuses to
// sign or verify at all when SITE_AUTH_SECRET is missing (fail closed).
const DEV_ONLY_FALLBACK_KEY = 'artbyme-development-only-cart-token-key-not-for-production'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXPIRY_PATTERN = /^[0-9]{1,12}$/

interface CartTokenClaims {
  cartId: string
  expiresAt: number
}

/** Details a route needs after accepting a token: the cart it names, plus a replacement when it is aging out. */
export interface CartTokenResolution {
  /** The cart id carried by the verified token. Safe to use as a `carts.id`. */
  cartId: string
  /**
   * A freshly issued token when the presented one is inside its renewal window,
   * otherwise null. Routes echo this to the client, which swaps its stored copy.
   */
  renewedToken: string | null
}

/**
 * Resolve the HMAC key at call time so configuration changes and per-test
 * overrides are honored. Throws in production when SITE_AUTH_SECRET is unset:
 * an unsigned or weakly signed cart token would hand back the capability this
 * module exists to remove.
 */
function getSigningKey(): string {
  const configured = process.env.SITE_AUTH_SECRET
  if (configured && configured.length > 0) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SITE_AUTH_SECRET is not set; refusing to issue or verify guest cart tokens in production',
    )
  }
  return DEV_ONLY_FALLBACK_KEY
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function signPayload(payload: string, key: string): string {
  return base64url(crypto.createHmac('sha256', key).update(payload, 'utf8').digest())
}

/**
 * Compare two base64url signatures without leaking where they diverge. Both
 * inputs are fixed-width for a given hash, so the length guard (required because
 * crypto.timingSafeEqual throws on a length mismatch) reveals nothing useful.
 */
function signaturesMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Structural parse plus signature and expiry checks, shared by every public
 * entry point. Returns null for any input that is not a token this deployment
 * issued and that is still inside its lifetime.
 */
function readCartToken(token: unknown): CartTokenClaims | null {
  if (typeof token !== 'string') return null
  if (token.length === 0 || token.length > CART_TOKEN_MAX_LENGTH) return null

  const parts = token.split('.')
  if (parts.length !== 4) return null

  const [version, cartId, expiresAtRaw, signature] = parts
  if (version !== TOKEN_VERSION) return null
  if (!UUID_PATTERN.test(cartId)) return null
  if (!EXPIRY_PATTERN.test(expiresAtRaw)) return null
  if (signature.length === 0) return null

  const expiresAt = Number.parseInt(expiresAtRaw, 10)
  if (!Number.isSafeInteger(expiresAt)) return null

  let key: string
  try {
    key = getSigningKey()
  } catch {
    // Fail closed: production without a signing key accepts nothing.
    return null
  }

  // Sign the raw substring rather than a re-serialized payload so a token can
  // only ever verify against the exact bytes that were signed.
  const expected = signPayload(`${version}.${cartId}.${expiresAtRaw}`, key)
  if (!signaturesMatch(signature, expected)) return null

  if (nowSeconds() >= expiresAt) return null

  return { cartId, expiresAt }
}

/**
 * Mint a token that authorizes the bearer to act on exactly one guest cart for
 * the next 30 days. Throws when the cart id is not a UUID (a caller bug) or when
 * production has no SITE_AUTH_SECRET to sign with, so a cart reference can never
 * leave the server unsigned.
 */
export function issueCartToken(cartId: string): string {
  if (typeof cartId !== 'string' || !UUID_PATTERN.test(cartId)) {
    throw new Error('issueCartToken requires a cart id in UUID form')
  }
  const key = getSigningKey()
  const expiresAt = nowSeconds() + CART_TOKEN_TTL_SECONDS
  const payload = `${TOKEN_VERSION}.${cartId}.${expiresAt}`
  return `${payload}.${signPayload(payload, key)}`
}

/**
 * Recover the cart id a token names, or null. Null is returned for every failure
 * mode (wrong type, wrong shape, unknown version, non-UUID cart id, tampered
 * payload, bad signature, expired, no signing key) and nothing is thrown, so
 * callers can treat the result as a plain "is there a cart here" question.
 */
export function verifyCartToken(token: unknown): string | null {
  const claims = readCartToken(token)
  return claims ? claims.cartId : null
}

/**
 * Verify a token and decide, in one pass, whether the shopper should be handed a
 * replacement. Public cart routes use this so sliding renewal is applied
 * identically everywhere instead of being re-derived per route.
 */
export function resolveCartToken(token: unknown): CartTokenResolution | null {
  const claims = readCartToken(token)
  if (!claims) return null
  const remaining = claims.expiresAt - nowSeconds()
  const renewedToken =
    remaining < CART_TOKEN_RENEWAL_THRESHOLD_SECONDS ? issueCartToken(claims.cartId) : null
  return { cartId: claims.cartId, renewedToken }
}
