// Authored by DotWin
// One option's admin-owned fields, including its swatch (ADR-6).
//
// The write goes through `catalog_admin_patch_option` (SECURITY DEFINER). Two of its
// rules matter more than the column whitelist:
//   - an option whose geometry needs a print file with extra bleed, or whose probe is
//     still owed, cannot be switched ON however the request is shaped (ADR-4). That
//     refusal arrives as P0001 and is a 409 here, with the reason passed through.
//   - the swatch is validated field by field in SQL as well as here, so a hand-made
//     request cannot store a colour that is not a hex or a frame face of zero inches.
//
// `is_default` is NOT patchable here: moving a default between siblings is atomic and
// lives at option/[id]/default.

import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { invalidateCatalogCache } from '@/lib/catalog/cache-tag'

const Swatch = z
  .object({
    color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    image_path: z.string().min(1).max(512).optional(),
    frame_face_in: z.number().positive().optional(),
    frame_depth_in: z.number().positive().optional(),
  })
  .strict()

const Patch = z
  .object({
    enabled: z.boolean().optional(),
    display_label: z.string().optional(),
    sort_order: z.number().optional(),
    swatch: Swatch.nullable().optional(),
    acknowledged: z.boolean().optional(),
  })
  .strict()

/** Map a catalog_admin RPC failure onto the house error shape, by SQLSTATE, never by text. */
function rpcError(error: { code?: string; message?: string }, context: string): Response {
  const message = (error.message ?? '').replace(/^catalog_admin:\s*/, '')
  if (error.code === '42501') return apiError('You do not have permission to change the print catalog.', 403, 'FORBIDDEN')
  if (error.code === 'P0002') return apiError('That catalog row no longer exists. Refresh and try again.', 404, 'NOT_FOUND')
  if (error.code === '22023') return apiError(message || 'That change is not valid.', 400, 'INVALID_PATCH')
  // The table CHECK on swatch.image_path: a site path or a public media URL only.
  if (error.code === '23514') return apiError('The swatch image must be a media library file or a site path.', 400, 'INVALID_PATCH')
  if (error.code === 'P0001') return apiError(message || 'That change was refused.', 409, 'REFUSED')
  return dbFail(error, context)
}

// PATCH /api/admin/catalog/option/[id] — change an option's admin-owned fields
// (enabled, label, sort order, swatch, acknowledgement) through the catalog admin RPC,
// which refuses to enable a geometry-blocked option; admin only.
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
    const { data, error } = await auth.supabase.rpc('catalog_admin_patch_option', {
      p_id: id,
      p_patch: patch,
    })
    if (error) return rpcError(error, 'admin/catalog option PATCH')
    invalidateCatalogCache()
    return apiOk(data)
  } catch (err) {
    return apiFail(err, { context: 'admin/catalog option PATCH' })
  }
}
