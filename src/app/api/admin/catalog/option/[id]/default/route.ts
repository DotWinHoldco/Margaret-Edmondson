// Authored by DotWin
// Move an option group's default to this option.
//
// The default is OUR geometry-neutral choice: it is what every untouched configuration
// sends to the provider, so it is not a patchable field but a move between siblings.
// `catalog_admin_set_default_option` clears the previous default and sets this one in
// one statement sequence, so the partial unique index never sees two at once, and it
// refuses a tombstoned or geometry-blocked option outright (P0001 -> 409 here).
//
// No body: the id in the path is the whole request.

import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, apiOk, dbFail } from '@/lib/api/respond'
import { invalidateCatalogCache } from '@/lib/catalog/cache-tag'

/** Map a catalog_admin RPC failure onto the house error shape, by SQLSTATE, never by text. */
function rpcError(error: { code?: string; message?: string }, context: string): Response {
  const message = (error.message ?? '').replace(/^catalog_admin:\s*/, '')
  if (error.code === '42501') return apiError('You do not have permission to change the print catalog.', 403, 'FORBIDDEN')
  if (error.code === 'P0002') return apiError('That catalog row no longer exists. Refresh and try again.', 404, 'NOT_FOUND')
  if (error.code === '22023') return apiError(message || 'That change is not valid.', 400, 'INVALID_PATCH')
  if (error.code === 'P0001') return apiError(message || 'That change was refused.', 409, 'REFUSED')
  return dbFail(error, context)
}

// POST /api/admin/catalog/option/[id]/default — make this option its group's default,
// clearing the previous one in the same transaction; admin only.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const { data, error } = await auth.supabase.rpc('catalog_admin_set_default_option', { p_id: id })
    if (error) return rpcError(error, 'admin/catalog option default POST')
    invalidateCatalogCache()
    return apiOk(data)
  } catch (err) {
    return apiFail(err, { context: 'admin/catalog option default POST' })
  }
}
