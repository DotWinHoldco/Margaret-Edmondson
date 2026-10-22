'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiSend, errorMessage } from '@/lib/api/client'
import MasterCropWorkspace, { type CropDraft, type CropOutput } from './MasterCropWorkspace'
import { useToast } from '@/components/shared/toast/ToastProvider'

type Rect = { x: number; y: number; w: number; h: number; rotation?: 0 | 90 | 180 | 270; orient?: boolean }
type BorderMode = 'full_bleed' | 'matte'

export interface MasterCropTarget {
  id: string
  title: string
  /** Web-resolution proxy to draw the crop rectangle on — NEVER the source TIFF. */
  proxyUrl: string
  sourceWidthPx?: number | null
  sourceHeightPx?: number | null
  crop_box?: { x: number; y: number; w: number; h: number; rotation?: 0 | 90 | 180 | 270; orient?: boolean } | null
  crop_output?: CropOutput | null
  border_mode?: BorderMode | null
  border_color?: string | null
  print_error?: string | null
  print_status?: string | null
  print_requested_at?: string | null
}

/** Fit a standard source-pixel ratio into a scaled preview without distorting it. */
export function centeredAspectCrop(width: number, height: number, ratio: number, sourceAspect: number): Rect {
  const displayRatio = ratio * (width / height) / sourceAspect
  const w = Math.min(width, height * displayRatio)
  const h = w / displayRatio
  return { x: (width - w) / 2, y: (height - h) / 2, w, h }
}


// Master crop / print-area tool. Mirrors CropModal's drag math but:
//  - draws on a web-res proxy (the source master is too big for the browser),
//  - stores a NORMALIZED rect (0..1 of the original), not rasterized pixels,
//  - captures border mode (full bleed vs matte) + matte color,
//  - POSTs JSON to /api/admin/master-artworks/[id]/crop, which enqueues the
//    server-side libvips worker. The actual lossless crop/pad runs out-of-band.
export default function MasterCropModal({
  master,
  onClose,
  onSaved,
  initialAspectRatio,
  productId,
}: {
  master: MasterCropTarget
  initialAspectRatio?: number
  productId?: string
  onClose: () => void
  onSaved: (next: { print_status: string; border_mode: BorderMode; border_color: string; crop_output?: CropOutput | null }) => void
}) {
  const [draft, setDraft] = useState<CropDraft | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [unsavedCrop, setUnsavedCrop] = useState(Boolean(initialAspectRatio))
  const [status, setStatus] = useState<string | null>(master.print_status ?? null)
  const [progress, setProgress] = useState<{
    requestedAt: string | null
    state: 'preparing' | 'complete' | 'failed'
  } | null>(() => {
    const state = ['pending', 'processing'].includes(master.print_status || '')
      ? 'preparing'
      : master.print_status === 'ready' && master.crop_box && !master.print_error ? 'complete' : null
    return state ? { requestedAt: master.print_requested_at ?? null, state } : null
  })
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const [confirmSave, setConfirmSave] = useState(false)
  const [pendingSave, setPendingSave] = useState<Omit<CropDraft, 'valid'> | null>(null)
  const receiveDraft = useCallback((next: CropDraft, edited: boolean) => {
    setDraft(next)
    if (edited) setUnsavedCrop(true)
  }, [])
  const toast = useToast()
  useEffect(() => {
    // A delayed response for the previous crop must not confirm a newer save.
    if (progress?.state === 'preparing' && progress.requestedAt && master.print_requested_at !== progress.requestedAt) return
    setStatus(master.print_status ?? null)
    if (progress?.state !== 'preparing') return
    if (master.print_status !== 'ready' && master.print_status !== 'failed') return
    // Failed recrops restore the previous file to ready, with print_error set.
    if (master.print_error || master.print_status === 'failed') {
      setProgress({ ...progress, state: 'failed' })
      toast.error('This crop could not be finished. Your original is safe. Please try again.')
    } else {
      setProgress({ ...progress, state: 'complete' })
      toast.success('Crop saved. Your new print file is ready.')
    }
  }, [master.print_status, master.print_error, master.print_requested_at, progress, toast])

  const preparing = progress?.state === 'preparing'
  const completed = progress?.state === 'complete'
  const showDone = completed && !unsavedCrop
  const duplicateSave = preparing && !unsavedCrop

  function askSave() {
    if (submitting.current || duplicateSave || showDone || !draft?.valid) return
    setPendingSave({ crop_box: draft.crop_box, crop_output: draft.crop_output, border_mode: draft.border_mode, border_color: draft.border_color })
    setConfirmSave(true)
  }

  async function save() {
    if (!pendingSave || submitting.current) return
    submitting.current = true
    setSaving(true)
    setError('')
    try {
      const data = await apiSend<{ print_status?: string; print_requested_at?: string }>(
        `/api/admin/master-artworks/${master.id}/crop`,
        'POST',
        pendingSave,
      )
      const next = data?.print_status || 'pending'
      setProgress({ requestedAt: data.print_requested_at ?? null, state: 'preparing' })
      setStatus(next)
      setUnsavedCrop(false)
      setConfirmSave(false)
      setPendingSave(null)
      toast.info('Crop received. We’ll confirm when your print file is ready.')
      onSaved({ print_status: next, border_mode: pendingSave.border_mode, border_color: pendingSave.border_color, crop_output: pendingSave.crop_output })
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      toast.error(message)
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  // The way back: the uncropped original becomes the print file again. Always available,
  // because the original upload is never modified; a crop that failed or went wrong is
  // never a dead end for the products behind it.
  const [confirmRevert, setConfirmRevert] = useState(false)
  const [reverting, setReverting] = useState(false)
  const hasCropToRevert = Boolean(master.crop_box) || status === 'failed' || Boolean(master.print_error)
  async function revert() {
    setReverting(true)
    setError('')
    try {
      await apiSend(`/api/admin/master-artworks/${master.id}/crop/revert`, 'POST', {})
      setStatus('processing')
      setUnsavedCrop(false)
      toast.success('Print master reverted to the uncropped original.')
      onSaved({ print_status: 'processing', border_mode: 'full_bleed', border_color: '#ffffff', crop_output: null })
      onClose()
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      toast.error(message)
    } finally {
      setReverting(false)
      setConfirmRevert(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const scope = dialogRef.current?.querySelector<HTMLElement>('[role="dialog"]') ?? dialogRef.current
        const elements = Array.from(scope?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []).filter(el => el.tabIndex >= 0 && el.getClientRects().length)
        const first = elements[0], last = elements[elements.length-1]
        if (first && (!scope?.contains(document.activeElement) || (e.shiftKey ? document.activeElement === first : document.activeElement === last))) { e.preventDefault(); (e.shiftKey?last:first).focus() }
        return
      }
      if (e.key !== 'Escape') return
      if (saving || reverting) return
      if (confirmSave) {
        setConfirmSave(false)
        setPendingSave(null)
      } else if (confirmRevert) {
        setConfirmRevert(false)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmSave, confirmRevert, saving, reverting, onClose])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-charcoal/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" ref={dialogRef} aria-labelledby="master-crop-title" tabIndex={-1} className="max-h-[94dvh] w-full max-w-6xl overflow-y-auto rounded-xl bg-cream shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-charcoal/10 bg-cream p-4">
          <div>
            <h2 id="master-crop-title" className="font-display text-xl font-semibold text-charcoal">Prepare your print</h2>
            <p className="font-body text-xs text-charcoal/55">{master.title}</p>
          </div>
          <button type="button" aria-label="Close crop editor" onClick={onClose} className="rounded-md p-1.5 text-charcoal/50 hover:bg-charcoal/5 hover:text-charcoal">
            ✕
          </button>
        </div>

        <p className="px-5 pt-4 text-sm text-charcoal/65">Paper prints receive a white border of at least ¼ inch on all four sides automatically. You do not need to add that border here. Canvas uses your saved crop.</p>
        <MasterCropWorkspace productId={productId} master={master} initialAspectRatio={initialAspectRatio} onDraftChange={receiveDraft} />
        <div className="space-y-3 px-5 py-3">
          {preparing && (
            <div role="status" className="w-full rounded-lg border border-teal/25 bg-teal/5 p-4 font-body text-sm text-charcoal">
              <p className="font-semibold">Preparing your print file…</p>
              <p className="mt-1">Your crop was received. We’re preparing the file and checking print sizes. You don’t need to save again. You can close this window; preparation will continue.</p>
              {unsavedCrop && <p className="mt-2">You’ve made more changes. Save them only if you want to replace the crop being prepared.</p>}
            </div>
          )}
          {completed && (
            <div role="status" className="w-full rounded-lg border border-teal/30 bg-teal/10 p-4 font-body text-sm text-charcoal">
              <p className="font-semibold">✓ Crop saved — your print file is ready.</p>
              <p className="mt-1">{unsavedCrop ? 'You’ve made more changes since saving. Save again to apply those changes.' : 'You’re finished here. Choose Done to review your print sizes and prices. You can return to crop again anytime.'}</p>
            </div>
          )}
          {!preparing && master.print_error && <p role="alert" className="text-sm text-coral">{friendlyCropError(master.print_error)} Review the crop and save again to retry.</p>}
          {error && <p className="font-body text-xs text-coral text-center">{error}</p>}
        </div>

        {confirmSave && pendingSave && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-charcoal/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-crop-title">
            <div className="w-full max-w-md rounded-lg bg-cream shadow-2xl">
              <div className="p-6">
                <h2 id="confirm-crop-title" className="font-display text-xl font-light text-charcoal">Apply this print crop?</h2>
                <p className="mt-3 font-body text-sm leading-relaxed text-charcoal/70">
                  This replaces the print file for every product linked to “{master.title}”. The original upload stays safe. {pendingSave.crop_output ? 'Saving updates existing print sizes to matching standard sizes and refreshes prices. Review sizes after saving.' : 'Existing print sizes will follow the new artwork shape and prices will refresh. Review sizes after saving.'} If another crop is already being prepared, this one replaces it. Products may be unavailable while it is being prepared.
                </p>
                <p className="mt-2 font-body text-sm leading-relaxed text-charcoal/70">Make sure the important edges of the artwork are inside the box before continuing.</p>
                {pendingSave.crop_output && <p className="mt-3 rounded border border-teal/20 bg-teal/5 p-3 text-sm text-charcoal">Target print size: <strong>{pendingSave.crop_output.width_in} × {pendingSave.crop_output.height_in} in</strong>. {pendingSave.crop_output.fit==='pad'?'All selected artwork is kept without stretching. White space is added to fit the print size; a physical mat is chosen separately.':'The selection is trimmed to fit this shape.'}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 rounded-b-lg border-t border-charcoal/10 bg-white/40 p-4">
                <button type="button" onClick={() => { setConfirmSave(false); setPendingSave(null) }} className="rounded-sm px-4 py-2 font-body text-sm text-charcoal/70 hover:text-charcoal">Keep editing</button>
                <button type="button" onClick={save} disabled={saving} className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50">{saving ? 'Saving…' : 'Yes, apply crop'}</button>
              </div>
            </div>
          </div>
        )}

        {confirmRevert && (
          <div className="border-t border-charcoal/10 bg-cream px-4 py-3" role="dialog" aria-label="Revert crop">
            <p className="font-body text-sm font-semibold text-charcoal">Revert to the uncropped original?</p>
            <p className="mt-1 font-body text-xs text-charcoal/65">
              The full original file becomes the print file for every product linked to this master, and the crop is
              cleared. Existing print sizes must be checked again afterwards. The original is never changed, so you can
              crop again at any time.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={revert}
                disabled={reverting}
                className="rounded-lg bg-charcoal px-4 py-1.5 font-body text-sm font-medium text-cream hover:bg-charcoal/85 disabled:opacity-50"
              >
                {reverting ? 'Reverting…' : 'Yes, revert'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRevert(false)}
                disabled={reverting}
                className="rounded-lg px-4 py-1.5 font-body text-sm text-charcoal/70 hover:bg-charcoal/5"
              >
                Keep the crop
              </button>
            </div>
          </div>
        )}

        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 border-t border-charcoal/10 bg-cream p-4">
          <button
            type="button"
            onClick={() => setConfirmRevert(true)}
            disabled={!hasCropToRevert || reverting || saving}
            title={hasCropToRevert ? 'Make the uncropped original the print file again' : 'No crop to revert: the original is already the print file'}
            className="rounded-lg px-3 py-2 font-body text-sm font-medium text-charcoal/70 hover:bg-charcoal/5 disabled:opacity-40"
          >
            Revert to original
          </button>
          <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-body text-sm font-medium text-charcoal/70 hover:bg-charcoal/5">
            {preparing ? 'Close — keep preparing' : completed ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={showDone ? onClose : askSave}
            disabled={!showDone && (saving || duplicateSave || !draft?.valid)}
            className="rounded-lg bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving…' : showDone ? 'Done' : duplicateSave ? 'Preparing…' : 'Save crop'}
          </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Turn storage/worker details into a message an artist can act on. */
function friendlyCropError(message: string): string {
  if (/invalid compact jws|accessdenied|unauthorized|expired token/i.test(message)) {
    return 'The new print file could not be saved because storage access expired. Your previous print file is still safe and in use. Try saving the crop again.'
  }
  if (/too large|over 100 mb|450 mb/i.test(message)) {
    return 'This artwork is too large for automatic cropping. The original is safe; ask support to prepare this print file.'
  }
  if (/could not download|read the original/i.test(message)) {
    return 'The original artwork could not be read. Check that the master is still in your library, then try again.'
  }
  return message
}
