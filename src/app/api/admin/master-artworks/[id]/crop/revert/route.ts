// Authored by DotWin
// There is always a way back from a crop. The original upload is never modified, so the
// uncropped original can become the print file again at any moment: the crop rectangle is
// cleared, the print dimensions return to the source dimensions, the status is `ready`,
// and the request stamp moves forward so a crop job still in flight can never overwrite
// this decision (the worker's final write is fenced on the stamp it claimed).

import { requireAdmin } from '@/lib/auth/require-admin'
import { apiOk, apiError, dbFail } from '@/lib/api/respond'

export const runtime = 'nodejs'

// POST /api/admin/master-artworks/[id]/crop/revert — admin only. Makes the uncropped
// original the print file for every product linked to this master and clears the crop.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const { data: master, error: loadErr } = await auth.supabase
    .from('master_artworks')
    .select('id, storage_path, width_px, height_px')
    .eq('id', id)
    .maybeSingle()
  if (loadErr) return dbFail(loadErr)
  if (!master) return apiError('Master artwork not found', 404, 'NOT_FOUND')
  if (!master.storage_path || !(Number(master.width_px) > 0) || !(Number(master.height_px) > 0)) {
    return apiError('This master has no original file to revert to.', 409, 'NO_ORIGINAL')
  }

  const now = new Date().toISOString()
  const { data, error } = await auth.supabase
    .from('master_artworks')
    .update({
      crop_box: null,
      border_mode: 'full_bleed',
      border_color: '#ffffff',
      print_storage_path: master.storage_path,
      print_width_px: master.width_px,
      print_height_px: master.height_px,
      print_status: 'ready',
      print_error: null,
      print_requested_at: now,
      print_updated_at: now,
      updated_at: now,
    })
    .eq('id', id)
    .select('id, print_status, print_width_px, print_height_px, border_mode, border_color, crop_box')
    .single()
  if (error) return dbFail(error)
  return apiOk({ ...data, reverted: true })
}
