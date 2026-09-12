import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { safeInternalPath } from '@/lib/navigation/safe-redirect'

// GET /auth/callback — exchange an OAuth code for a session, upsert the profile, and redirect; public (completes sign-in).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const recovery = searchParams.get('type') === 'recovery'
  const redirect = searchParams.has('redirect')
    ? safeInternalPath(searchParams.get('redirect'), '/account')
    : null

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // The PKCE verifier records PASSWORD_RECOVERY even if the email redirect
      // loses its query string. Recovery must precede normal role redirects.
      // auth-js returns this extra field at runtime but its public response
      // type omits it; narrow it without asserting a wider session shape.
      const redirectType = 'redirectType' in data ? data.redirectType : null
      if (recovery || redirectType === 'PASSWORD_RECOVERY' || redirectType === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      // Create/update profile on successful auth
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').upsert({
          id: user.id,
          email: user.email!,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
        }, { onConflict: 'id' })

        // Check if admin — route to admin dashboard
        if (redirect) {
          return NextResponse.redirect(new URL(redirect, origin))
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role === 'admin' || profile?.role === 'artist') {
          return NextResponse.redirect(`${origin}/admin`)
        }
      }

      return NextResponse.redirect(`${origin}/account`)
    }
  }

  return NextResponse.redirect(recovery
    ? `${origin}/reset-password?error=invalid-link`
    : `${origin}/login?error=auth`)
}
