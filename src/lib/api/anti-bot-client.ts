// Authored by DotWin
//
// Browser side of the anti-bot intent token. Every public form that writes
// (contact, newsletter, commissions) or uploads calls this before submitting;
// the matching server guard lives in src/lib/api/anti-bot.ts.
//
// The token is fetched once and reused until shortly before it expires, so a
// visitor filling a multi-step form pays a single extra request rather than one
// per action, and concurrent callers share a single in-flight fetch.

import { ANTI_BOT_HEADER } from '@/lib/api/anti-bot-header'
import { apiFetch } from '@/lib/api/client'

// Server TTL is 15 minutes; renew early so a token minted just before the
// boundary cannot expire mid-submit.
const TOKEN_TTL_MS = 15 * 60 * 1000
const RENEW_BEFORE_MS = 3 * 60 * 1000

let cached: { token: string; issuedAt: number } | null = null
let inFlight: Promise<string> | null = null

/**
 * Resolve a usable intent token, minting one when the cache is empty or close
 * to expiry. Rejects with the standard friendly ApiError when the token
 * endpoint is unreachable, which surfaces on the form as a normal failure
 * instead of a silent 403 from the endpoint being submitted to.
 */
export async function getAntiBotToken(): Promise<string> {
  const now = Date.now()
  if (cached && now - cached.issuedAt < TOKEN_TTL_MS - RENEW_BEFORE_MS) return cached.token
  if (inFlight) return inFlight

  inFlight = apiFetch<{ token: string }>('/api/anti-bot/token', { cache: 'no-store' })
    .then((body) => {
      if (!body || typeof body.token !== 'string' || !body.token) {
        throw new Error('We could not verify your session. Please refresh the page and try again.')
      }
      cached = { token: body.token, issuedAt: Date.now() }
      return body.token
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/** Header bag to merge into a request that a public write endpoint will guard. */
export async function antiBotHeaders(): Promise<Record<string, string>> {
  return { [ANTI_BOT_HEADER]: await getAntiBotToken() }
}

/** Drop the cached token, so the next call mints a fresh one. */
export function resetAntiBotToken(): void {
  cached = null
}
