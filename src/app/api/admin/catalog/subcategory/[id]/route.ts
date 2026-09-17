// Authored by DotWin
// One subcategory's admin-owned fields.
//
// Browser roles hold SELECT only on the catalog v2 tables (20260917000100), so every
// write here goes through `catalog_admin_patch_subcategory`, the SECURITY DEFINER
// function that owns the column whitelist, the audit rows and the pricing-cache
// eviction. A `.update()` from this route would be silently swallowed by RLS.
//
// The RPC classifies its refusals by SQLSTATE, so this route maps them without ever
// parsing provider or Postgres prose.

import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { invalidateCatalogCache } from '@/lib/catalog/cache-tag'

const Patch = z
  .object({
    enabled: z.boolean().optional(),
    display_label: z.string().optional(),
    description: z.string().nullable().optional(),
    customer_note: z.string().nullable().optional(),
    sort_order: z.number().optional(),
    acknowledged: z.boolean().optional(),
  })
  .strict()

/** Map a catalog_admin RPC failure onto the house error shape, by SQLSTATE, never by text. */
function rpcError(error: { code?: string; message?: string }, context: string): Response {
  const message = (error.message ?? '').replace(/^catalog_admin:\s*/, '')
  if (error.code === '42501') return apiError('You do not have permission to change the print catalog.', 403, 'FORBIDDEN')
  if (error.code === 'P0002') return apiError('That catalog row no longer exists. Refresh and try again.', 404, 'NOT_FOUND')
  if (error.code === '22023') return apiError(message || 'That change is not valid.', 400, 'INVALID_PATCH')
  if (error.code === 'P0001') return apiError(message || 'That change was refused.', 409, 'REFUSED')
  return dbFail(error, context)
}

// PATCH /api/admin/catalog/subcategory/[id] — change a subcategory's admin-owned fields
// (enabled, labels, notes, sort order, NEW acknowledgement) through the catalog admin RPC; admin only.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) patch[key] = value
  }
  if (Object.keys(patch).length === 0) {
    return apiError('Nothing to change.', 400, 'EMPTY_PATCH')
  }

  try {
    const { data, error } = await auth.supabase.rpc('catalog_admin_patch_subcategory', {
      p_id: id,
      p_patch: patch,
    })
    if (error) return rpcError(error, 'admin/catalog subcategory PATCH')
    invalidateCatalogCache()
    return apiOk(data)
  } catch (err) {
    return apiFail(err, { context: 'admin/catalog subcategory PATCH' })
  }
}
