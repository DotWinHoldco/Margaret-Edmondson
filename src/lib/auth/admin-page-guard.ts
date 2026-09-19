// Authored by DotWin
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { REQUEST_PATH_HEADER } from '@/lib/navigation/request-path'
import { isAdminRole, safeAdminReturnPath } from './admin-policy'

export type AdminPageSession = {
  supabase: SupabaseClient
  user: User
  role: string
}

/** Preserve a safe destination when a signed-out admin returns through sign-in. */
export async function currentAdminPath(): Promise<string> {
  const headerList = await headers()
  return safeAdminReturnPath(headerList.get(REQUEST_PATH_HEADER))
}

/** Require a validated session and stored admin/artist role for every admin page. */
export async function requireAdminPage(): Promise<AdminPageSession> {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    const target = await currentAdminPath()
    redirect(`/login?redirect=${encodeURIComponent(target)}`)
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role
  if (error || !isAdminRole(role)) redirect('/')

  return { supabase, user, role }
}
