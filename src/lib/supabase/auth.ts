import { createClient } from './client'

/**
 * Where a sign-in flow returns to. In the browser this is the origin the person is
 * standing on, so a preview deploy completes Google sign-in on its own domain instead
 * of handing the session to the production site (or to nowhere, when the preview has
 * no NEXT_PUBLIC_SITE_URL at all). Outside the browser the configured site URL stands
 * in. The Supabase redirect allowlist still decides which origins may finish a
 * sign-in; this only stops the app from naming the wrong one.
 */
export function authOrigin(env: Record<string, string | undefined> = process.env, browserOrigin?: string | null): string {
  // `undefined` = detect the browser; `null` = there is no browser origin (server, tests).
  const fromBrowser = browserOrigin !== undefined ? browserOrigin : (typeof window !== 'undefined' && window.location ? window.location.origin : null)
  const raw = (fromBrowser || env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

export function authCallbackUrl(suffix: string = ''): string {
  return `${authOrigin()}/auth/callback${suffix}`
}

export async function signUp(email: string, password: string, fullName: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: authCallbackUrl(),
    },
  })
  return { data, error }
}

export async function signIn(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signInWithGoogle() {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: authCallbackUrl(),
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
  return { data, error }
}

export async function signInWithMagicLink(email: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: authCallbackUrl(),
    },
  })
  return { data, error }
}

export async function signOut() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function resetPassword(email: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authCallbackUrl('?type=recovery'),
  })
  return { data, error }
}
