// Authored by DotWin
// The medium (family) switch: the top level of the catalog cascade.
//
// Turning a medium off takes every subcategory under it out of the storefront in one
// move, so the key is validated against the MEDIUMS enum before the RPC is called: an
// unknown key would otherwise reach `catalog_admin_set_medium_enabled` and come back as
// a row-not-found, which reads as "someone deleted it" rather than "that is not a medium".
//
// `lumaprints_mediums` is keyed by text and predates the catalog v2 tables; it is still
// the switch the live store reads, which is why the manager's top level is this table.

import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { invalidateCatalogCache } from '@/lib/catalog/cache-tag'
import { MEDIUMS, type Medium } from '@/lib/pricing/mediums'

const Body = z.object({ enabled: z.boolean() }).strict()

/** Map a catalog_admin RPC failure onto the house error shape, by SQLSTATE, never by text. */
function rpcError(error: { code?: string; message?: string }, context: string): Response {
  const message = (error.message ?? '').replace(/^catalog_admin:\s*/, '')
  if (error.code === '42501') return apiError('You do not have permission to change the print catalog.', 403, 'FORBIDDEN')
  if (error.code === 'P0002') return apiError('That catalog row no longer exists. Refresh and try again.', 404, 'NOT_FOUND')
  if (error.code === '22023') return apiError(message || 'That change is not valid.', 400, 'INVALID_PATCH')
  if (error.code === 'P0001') return apiError(message || 'That change was refused.', 409, 'REFUSED')
  return dbFail(error, context)
}

// PATCH /api/admin/catalog/medium/[medium] — switch a whole print medium on or off
// through the catalog admin RPC, which evicts every pricing cache row beneath it; admin only.
export async function PATCH(request: Request, { params }: { params: Promise<{ medium: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { medium } = await params
  if (!(MEDIUMS as readonly string[]).includes(medium)) {
    return apiError('That is not a print medium.', 400, 'VALIDATION_FAILED')
  }

  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response

  try {
    const { data, error } = await auth.supabase.rpc('catalog_admin_set_medium_enabled', {
      p_medium: medium as Medium,
      p_enabled: parsed.data.enabled,
    })
    if (error) return rpcError(error, 'admin/catalog medium PATCH')
    invalidateCatalogCache()
    return apiOk(data)
  } catch (err) {
    return apiFail(err, { context: 'admin/catalog medium PATCH' })
  }
}
