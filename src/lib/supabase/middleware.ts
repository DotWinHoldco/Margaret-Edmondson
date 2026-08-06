import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { REQUEST_PATH_HEADER } from '@/lib/navigation/request-path'

/**
 * Refresh the Supabase session cookie for this request and apply the optimistic
 * route guards for /account and /admin. (Route handlers still self-authorize;
 * this only saves an unauthenticated visitor a round trip.)
 *
 * The headers forwarded to the app are rebuilt at every NextResponse.next()
 * call rather than snapshotted once, because `setAll` below writes refreshed
 * auth cookies back onto the request and that mutation must survive into the
 * forwarded headers. Two extras ride along: the current path stamped as
 * REQUEST_PATH_HEADER (server layouts get no URL access; the MFA guard needs
 * an accurate "return here after step-up" link) and `extraRequestHeaders`,
 * the per-request CSP nonce material minted in `src/proxy.ts`.
 */
export async function updateSession(
  request: NextRequest,
  extraRequestHeaders?: Record<string, string>
) {
  const forwardedRequest = () => {
    const headers = new Headers(request.headers)
    headers.set(
      REQUEST_PATH_HEADER,
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    )
    if (extraRequestHeaders) {
      for (const [name, value] of Object.entries(extraRequestHeaders)) headers.set(name, value)
    }
    return { headers }
  }

  let supabaseResponse = NextResponse.next({ request: forwardedRequest() })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request: forwardedRequest() })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Redirect ?code= on root to /auth/callback for magic link handling
  if (request.nextUrl.pathname === '/' && request.nextUrl.searchParams.get('code')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect /account routes
  if (request.nextUrl.pathname.startsWith('/account') && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Optimistic filter for /admin routes. The authoritative gate (role + MFA)
  // is the (admin) server layout and requireAdmin; this only saves a render.
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'artist'].includes(profile.role)) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
