// Authored by DotWin
import { issueAntiBotToken, requireSameOrigin } from '@/lib/api/anti-bot'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { apiFail } from '@/lib/api/respond'

/**
 * GET /api/anti-bot/token: issue a short-lived intent token for the anonymous
 * write and upload forms; public but same-origin only.
 *
 * The token is what the contact, newsletter, commission, and upload endpoints
 * require in `x-abm-token`. Handing one out is deliberately cheap but not free:
 * the caller must present an Origin or Referer matching this host (so a page on
 * this site, not a bare script hitting the API), and minting is rate limited on
 * the shared Postgres limiter so a bot cannot farm tokens faster than it could
 * have hit the guarded endpoints directly. The token itself is stateless
 * (HMAC over issued-at plus nonce), so nothing is stored per issue.
 *
 * Never cached: each response is a fresh token with its own 15 minute clock.
 */
export async function GET(request: Request) {
  const originCheck = requireSameOrigin(request)
  if (originCheck) return originCheck

  const rl = await rateLimit(request, { limit: 30, windowMs: 60_000, keyPrefix: 'anti-bot-token' })
  if (!rl.ok) return rateLimitResponse(rl)

  let token: string
  try {
    token = issueAntiBotToken()
  } catch (err) {
    // Only reachable when SITE_AUTH_SECRET is unset in production, where token
    // signing fails closed rather than using a guessable development secret.
    return apiFail(err, {
      status: 503,
      code: 'CONFIG_MISSING',
      context: 'anti-bot token issue',
    })
  }

  return Response.json({ data: { token } }, { headers: { 'Cache-Control': 'no-store' } })
}
