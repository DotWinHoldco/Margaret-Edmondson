import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { getGateConfig, gateToken } from '@/lib/gate/config'

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

async function gateCheck(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  if (
    pathname.startsWith('/gate') ||
    pathname.startsWith('/api/gate') ||
    // Machine-to-machine callbacks carry no gate cookie and must never be
    // rewritten to /gate — Stripe/Lumaprints/Printful/ShipStation/Resend
    // webhooks and Vercel cron jobs would otherwise receive the gate HTML.
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/cron') ||
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
  return NextResponse.rewrite(url)
}

export async function proxy(request: NextRequest) {
  const gated = await gateCheck(request)
  if (gated) return gated
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
