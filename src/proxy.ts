import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { getGateConfig, gateToken } from '@/lib/gate/config'
import {
  buildContentSecurityPolicy,
  CSP_REPORTING_ENDPOINTS,
  cspHeaderName,
  generateCspNonce,
} from '@/lib/security/csp'

const GATE_COOKIE = 'site-auth'

// Constant-time string compare for the gate token. Inlined (not imported from
// lib/auth/timing-safe) because this middleware runs in the edge runtime, where
// node:crypto.timingSafeEqual is unavailable. Token and expected are both
// fixed-length 64-char SHA-256 hex, so the length check leaks nothing.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

async function gateCheck(
  request: NextRequest,
  forwardedHeaders: Headers,
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  if (
    pathname.startsWith('/gate') ||
    pathname.startsWith('/api/gate') ||
    // Machine-to-machine callbacks carry no gate cookie and must never be
    // rewritten to /gate — Stripe/Lumaprints/Printful/ShipStation/Resend
    // webhooks and Vercel cron jobs would otherwise receive the gate HTML.
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/cron') ||
    // Same reasoning for the CSP violation collector: the browser posts a
    // report with no cookies, so behind the gate every report would be
    // answered with the gate HTML and the policy would go unmonitored during
    // exactly the pre-launch window it exists to cover.
    pathname === '/api/csp-report' ||
    pathname.startsWith('/_next') ||
    pathname === '/icon.png' ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return null
  }

  // Gate config is DB-first (site_settings) with env fallback, cached ~30s per
  // edge instance — the owner's go-live toggle takes effect without a deploy.
  // The exclusions above run FIRST so webhooks/crons never pay the config read.
  const cfg = await getGateConfig()
  if (!cfg.enabled || !cfg.password || !cfg.secret) return null

  const token = request.cookies.get(GATE_COOKIE)?.value
  const expected = await gateToken(cfg.password, cfg.secret)
  if (token && constantTimeEqual(token, expected)) return null

  const url = request.nextUrl.clone()
  url.pathname = '/gate'
  url.search = ''
  url.searchParams.set('next', pathname + request.nextUrl.search)
  // Forward the CSP headers so the gate page itself renders with a nonce.
  return NextResponse.rewrite(url, { request: { headers: forwardedHeaders } })
}

// Stamp the finished policy onto the outgoing response. `Reporting-Endpoints`
// resolves the `report-to` group named inside the policy; without it Chromium
// silently drops every report.
function applyCspHeaders(response: NextResponse, policy: string): void {
  response.headers.set(cspHeaderName(), policy)
  response.headers.set('Reporting-Endpoints', CSP_REPORTING_ENDPOINTS)
}

export async function proxy(request: NextRequest) {
  // One fresh nonce per request. It rides on the forwarded request headers,
  // where Next.js reads it back out of `content-security-policy` and stamps it
  // onto the framework runtime, the page bundles and its own inline scripts;
  // and on the response, where the browser enforces the matching policy.
  // Both headers are `set` (not appended), so a client cannot smuggle in a
  // nonce of its own choosing by sending these headers itself.
  const nonce = generateCspNonce()
  const policy = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === 'development')
  const cspRequestHeaders = {
    'x-nonce': nonce,
    'content-security-policy': policy,
  }

  const forwardedHeaders = new Headers(request.headers)
  for (const [name, value] of Object.entries(cspRequestHeaders)) {
    forwardedHeaders.set(name, value)
  }

  const gated = await gateCheck(request, forwardedHeaders)
  const response = gated ?? (await updateSession(request, cspRequestHeaders))
  applyCspHeaders(response, policy)
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
  ],
}
