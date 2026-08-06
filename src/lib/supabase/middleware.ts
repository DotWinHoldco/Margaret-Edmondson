import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { REQUEST_PATH_HEADER } from '@/lib/navigation/request-path'

export async function updateSession(request: NextRequest) {
  // Snapshot the request headers with the current path stamped on, so server
  // layouts (which Next gives no access to the URL) can build an accurate
  // "return here after MFA" link. Rebuilt at every NextResponse.next() call
  // because `request.cookies.set` writes refreshed auth cookies back into
  // `request.headers`, and those must still reach the upstream request.
  const forwardedHeaders = () => {
    const headers = new Headers(request.headers)
    headers.set(
      REQUEST_PATH_HEADER,
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    )
    return headers
  }

  let supabaseResponse = NextResponse.next({ request: { headers: forwardedHeaders() } })

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
          supabaseResponse = NextResponse.next({ request: { headers: forwardedHeaders() } })
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
