import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refresh the Supabase session cookie for this request and apply the optimistic
 * route guards for /account and /admin. (Route handlers still self-authorize;
 * this only saves an unauthenticated visitor a round trip.)
 *
 * `extraRequestHeaders` are merged into the headers forwarded to the app: the
 * CSP nonce, see `src/proxy.ts`. They are re-applied every time the response is
 * rebuilt rather than snapshotted once, because `setAll` below writes refreshed
 * auth cookies back onto the request and that mutation has to survive into the
 * headers that get forwarded.
 */
export async function updateSession(
  request: NextRequest,
  extraRequestHeaders?: Record<string, string>
) {
  const forwardedRequest = () => {
    if (!extraRequestHeaders) return request
    const headers = new Headers(request.headers)
    for (const [name, value] of Object.entries(extraRequestHeaders)) headers.set(name, value)
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
          cookiesToSet.forEach(({ name, value, options }) =>
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

  // Protect /admin routes
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
