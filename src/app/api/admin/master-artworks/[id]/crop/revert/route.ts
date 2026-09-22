// Authored by DotWin
// There is always a way back from a crop. The original upload is never modified, so the
// uncropped original can become the print file again at any moment: the crop rectangle is
// cleared, the print dimensions return to the source dimensions, the status is `ready`,
// and the request stamp moves forward so a crop job still in flight can never overwrite
// this decision (the worker's final write is fenced on the stamp it claimed).

import { requireAdmin } from '@/lib/auth/require-admin'
import { after } from 'next/server'
import { apiOk, apiError, dbFail } from '@/lib/api/respond'
import { reconcileVariantsForMaster } from '@/lib/pricing/reconcile-variants'

export const runtime = 'nodejs'
export const maxDuration = 300

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
      // Keep the product unavailable until its existing sizes have been moved
      // onto the original artwork's shape below.
      print_status: 'processing',
      print_error: null,
      print_requested_at: now,
      print_updated_at: now,
      updated_at: now,
    })
    .eq('id', id)
    .select('id, print_status, print_width_px, print_height_px, border_mode, border_color, crop_box')
    .single()
  if (error) return dbFail(error)
  after(async () => {
    let printError: string | null = null
    try {
      const reconciled = await reconcileVariantsForMaster(auth.supabase, id, Number(master.width_px), Number(master.height_px))
      console.info('[crop] reconciled print sizes after revert', { master: id, ...reconciled })
    } catch (reconcileError) {
      // Reverting the source file is complete even if a provider quote is briefly
      // unavailable. The owner can refresh prices from Print sizes afterward.
      console.error('[crop] could not reconcile print sizes after revert', { master: id, error: reconcileError })
      printError = 'The original is back in use, but print sizes still need to be refreshed before selling them.'
    }
    const { error: readyError } = await auth.supabase
      .from('master_artworks')
      .update({ print_status: 'ready', print_error: printError, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('print_status', 'processing')
      .eq('print_requested_at', now)
    if (readyError) {
      console.error('[crop] could not finish revert status update', { master: id, error: readyError })
    }
  })
  return apiOk({ ...data, reverted: true })
}
