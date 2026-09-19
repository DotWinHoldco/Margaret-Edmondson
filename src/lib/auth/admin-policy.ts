// Authored by DotWin
import { safeInternalPath } from '@/lib/navigation/safe-redirect'

/** Keep page and API authorization tied to the same stored profile roles. */
export function isAdminRole(role: unknown): role is 'admin' | 'artist' {
  return role === 'admin' || role === 'artist'
}

/** Keep sign-in return destinations inside the admin workspace. */
export function safeAdminReturnPath(value: string | null | undefined): string {
  const path = safeInternalPath(value, '/admin')
  const pathname = path.split(/[?#]/)[0]
  return pathname === '/admin' || pathname.startsWith('/admin/') ? path : '/admin'
}
