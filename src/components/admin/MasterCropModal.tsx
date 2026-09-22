'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

type Rect = { x: number; y: number; w: number; h: number }
type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se'
type BorderMode = 'full_bleed' | 'matte'

export interface MasterCropTarget {
  id: string
  title: string
  /** Web-resolution proxy to draw the crop rectangle on — NEVER the source TIFF. */
  proxyUrl: string
  sourceWidthPx?: number | null
  sourceHeightPx?: number | null
  crop_box?: { x: number; y: number; w: number; h: number } | null
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

const MAX_W = 640
const MAX_H = 520
const MIN = 28

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
}: {
  master: MasterCropTarget
  initialAspectRatio?: number
  onClose: () => void
  onSaved: (next: { print_status: string; border_mode: BorderMode; border_color: string }) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ mode: Mode; sx: number; sy: number; start: Rect } | null>(null)

  const [lockedAspect, setLockedAspect] = useState(initialAspectRatio || 0)
  const [sourceAspect, setSourceAspect] = useState(1)
  const [previewMismatch, setPreviewMismatch] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [disp, setDisp] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [borderMode, setBorderMode] = useState<BorderMode>(master.border_mode ?? 'full_bleed')
  const [borderColor, setBorderColor] = useState<string>(master.border_color ?? '#ffffff')
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
  const [pendingSave, setPendingSave] = useState<{
    crop_box: Rect
    border_mode: BorderMode
    border_color: string
  } | null>(null)
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

  const onLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const el = e.currentTarget
      const nw = el.naturalWidth
      const nh = el.naturalHeight
      const availableWidth = Math.max(120, (el.closest('[role="dialog"]')?.clientWidth || MAX_W + 40) - 40)
      const r = Math.min(Math.min(MAX_W, availableWidth) / nw, MAX_H / nh, 1)
      const w = Math.round(nw * r)
      const h = Math.round(nh * r)
      setDisp({ w, h })
      const sourceRatio = master.sourceWidthPx && master.sourceHeightPx ? master.sourceWidthPx / master.sourceHeightPx : nw / nh
      setSourceAspect(sourceRatio)
      setPreviewMismatch(Boolean(master.sourceWidthPx && master.sourceHeightPx && Math.abs((nw / nh) / sourceRatio - 1) > 0.01))
      if (initialAspectRatio) { setCrop(centeredAspectCrop(w, h, initialAspectRatio, sourceRatio)); return }
      // Seed from the saved crop_box (normalized → display px), else the full image.
      const cb = master.crop_box
      if (cb && cb.w > 0 && cb.h > 0) {
        setCrop({ x: Math.round(cb.x * w), y: Math.round(cb.y * h), w: Math.round(cb.w * w), h: Math.round(cb.h * h) })
      } else {
        setCrop({ x: 0, y: 0, w, h })
      }
    },
    [master.crop_box, master.sourceWidthPx, master.sourceHeightPx, initialAspectRatio],
  )

  const clamp = useCallback((rc: Rect, bw: number, bh: number): Rect => {
    let { x, y, w, h } = rc
    w = Math.max(MIN, Math.min(w, bw))
    h = Math.max(MIN, Math.min(h, bh))
    x = Math.max(0, Math.min(x, bw - w))
    y = Math.max(0, Math.min(y, bh - h))
    return { x, y, w, h }
  }, [])

  const onPointerDown = (mode: Mode) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!crop) return
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...crop } }
    wrapRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !disp) return
    setUnsavedCrop(true)
    const { mode, sx, sy, start } = drag.current
    const dx = e.clientX - sx
    const dy = e.clientY - sy
    let next: Rect
    if (mode === 'move') {
      next = { ...start, x: start.x + dx, y: start.y + dy }
    } else {
      let { x, y, w, h } = start
      if (mode === 'nw') { x = start.x + dx; y = start.y + dy; w = start.w - dx; h = start.h - dy }
      if (mode === 'ne') { y = start.y + dy; w = start.w + dx; h = start.h - dy }
      if (mode === 'sw') { x = start.x + dx; w = start.w - dx; h = start.h + dy }
      if (mode === 'se') { w = start.w + dx; h = start.h + dy }
      if (w < MIN) { if (mode === 'nw' || mode === 'sw') x = start.x + start.w - MIN; w = MIN }
      if (h < MIN) { if (mode === 'nw' || mode === 'ne') y = start.y + start.h - MIN; h = MIN }
      next = { x, y, w, h }
    }
    if (lockedAspect && mode !== 'move') {
      const displayRatio = lockedAspect * (disp.w / disp.h) / sourceAspect
      const left = mode === 'nw' || mode === 'sw'
      const top = mode === 'nw' || mode === 'ne'
      const anchorX = left ? start.x + start.w : start.x
      const anchorY = top ? start.y + start.h : start.y
      const maxW = Math.min(left ? anchorX : disp.w - anchorX, (top ? anchorY : disp.h - anchorY) * displayRatio)
      const desired = Math.abs(dx) >= Math.abs(dy * displayRatio) ? start.w + (left ? -dx : dx) : (start.h + (top ? -dy : dy)) * displayRatio
      const w = Math.min(maxW, Math.max(Math.min(MIN * Math.max(1, displayRatio), maxW), desired))
      const h = w / displayRatio
      setCrop({ x: left ? anchorX - w : anchorX, y: top ? anchorY - h : anchorY, w, h })
    } else setCrop(clamp(next, disp.w, disp.h))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null
    try {
      wrapRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }

  function askSave() {
    if (submitting.current || duplicateSave || showDone || !crop || !disp || previewMismatch || previewError) return
    // Keep the normalized coordinates in the confirmation state. The worker reads
    // these as fractions of the original master, regardless of preview size.
    setPendingSave({
      crop_box: {
        x: round4(crop.x / disp.w),
        y: round4(crop.y / disp.h),
        w: round4(crop.w / disp.w),
        h: round4(crop.h / disp.h),
      },
      border_mode: borderMode,
      border_color: borderColor,
    })
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
      onSaved({ print_status: next, border_mode: pendingSave.border_mode, border_color: pendingSave.border_color })
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
      onSaved({ print_status: 'processing', border_mode: 'full_bleed', border_color: '#ffffff' })
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
      if (e.key !== 'Escape') return
      if (confirmSave) {
        setConfirmSave(false)
        setPendingSave(null)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmSave, onClose])

  if (typeof document === 'undefined') return null

  const handle = 'absolute h-3.5 w-3.5 rounded-full bg-white ring-2 ring-teal shadow'

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-charcoal/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-cream shadow-2xl">
        <div className="flex items-center justify-between border-b border-charcoal/10 p-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-charcoal">Crop master / set print area</h2>
            <p className="font-body text-xs text-charcoal/55">{master.title}</p>
          </div>
          <button type="button" aria-label="Close crop editor" onClick={onClose} className="rounded-md p-1.5 text-charcoal/50 hover:bg-charcoal/5 hover:text-charcoal">
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 p-5">
          <label className="w-full font-body text-sm">Print shape
            <select aria-label="Print shape" value={lockedAspect} onChange={event => {
              const ratio = Number(event.target.value); setLockedAspect(ratio); setUnsavedCrop(true)
              if (ratio && disp) setCrop(centeredAspectCrop(disp.w, disp.h, ratio, sourceAspect))
            }} className="ml-3 rounded border border-charcoal/20 bg-white px-3 py-2">
              <option value={0}>Choose any shape</option>
              {[...new Set([initialAspectRatio, 4/5, 5/4, 5/7, 7/5, 11/14, 14/11, 3/4, 4/3, 1].filter((n): n is number => typeof n === 'number' && n > 0))].map(ratio => {
                const label = ratio === 4/5
                  ? 'Portrait 4:5 — 8 × 10 or 16 × 20'
                  : ratio === 5/4
                    ? 'Landscape 5:4 — 10 × 8 or 20 × 16'
                    : ratio === 5/7
                      ? 'Portrait 5:7 — 10 × 14'
                      : ratio === 7/5
                        ? 'Landscape 7:5 — 14 × 10'
                        : ratio === 11/14
                          ? 'Portrait 11:14 — 11 × 14'
                          : ratio === 14/11
                            ? 'Landscape 14:11 — 14 × 11'
                            : ratio === 3/4
                              ? 'Portrait 3:4 — 12 × 16 or 18 × 24'
                              : ratio === 4/3
                                ? 'Landscape 4:3 — 16 × 12 or 24 × 18'
                                : ratio === 1
                                  ? 'Square — 8 × 8 or 12 × 12'
                                  : 'Match the selected print size'
                return <option key={ratio} value={ratio}>{label}</option>
              })}
            </select>
          </label>
          {previewMismatch && <p role="alert" className="w-full rounded border border-coral/30 bg-coral/10 p-3 text-sm text-charcoal">The original master’s saved dimensions do not match its preview. Refresh the editor or replace/check the master before saving a print crop.</p>}
          {previewError && <p role="alert" className="w-full rounded border border-coral/30 bg-coral/10 p-3 text-sm text-charcoal">{previewError}</p>}
          <p className="w-full text-xs text-charcoal/55">Preview: original master artwork used for printing. Product photos do not change this crop.</p>
          <p className="w-full text-xs leading-relaxed text-charcoal/65">The preview shows the original artwork used for printing. The box shows what will remain. Choose a print shape to keep familiar proportions, or choose any shape and adjust it freely. Review every edge before saving. Saving changes this artwork for every linked product; existing sizes will be checked again after processing.</p>
          <div
            ref={wrapRef}
            className="relative select-none touch-none"
            style={{ width: disp?.w, height: disp?.h }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={master.proxyUrl}
              alt={master.title}
              onLoad={onLoad}
              onError={() => setPreviewError('The original master could not be loaded. Refresh the editor and try again, or ask support to prepare a browser-friendly preview.')}
              draggable={false}
              className="block"
              style={{ width: disp?.w, height: disp?.h }}
            />
            {crop && disp && <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute" style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h, boxShadow: '0 0 0 9999px rgba(20,20,20,0.55)' }} /></div>}
            {crop && disp && (
              <div
                className="absolute cursor-move"
                style={{
                  left: crop.x,
                  top: crop.y,
                  width: crop.w,
                  height: crop.h,
                  outline: '1px solid rgba(255,255,255,0.9)',
                }}
                onPointerDown={onPointerDown('move')}
              >
                <div className="pointer-events-none absolute inset-0 border border-white/40" />
                <span onPointerDown={onPointerDown('nw')} className={`${handle} -left-1.5 -top-1.5 cursor-nwse-resize`} />
                <span onPointerDown={onPointerDown('ne')} className={`${handle} -right-1.5 -top-1.5 cursor-nesw-resize`} />
                <span onPointerDown={onPointerDown('sw')} className={`${handle} -bottom-1.5 -left-1.5 cursor-nesw-resize`} />
                <span onPointerDown={onPointerDown('se')} className={`${handle} -bottom-1.5 -right-1.5 cursor-nwse-resize`} />
              </div>
            )}
            {!disp && <p className="py-16 font-body text-sm text-charcoal/40">Loading preview…</p>}
          </div>

          {/* Border mode */}
          <div className="flex w-full max-w-md flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setBorderMode('full_bleed'); setUnsavedCrop(true) }}
                className={`flex-1 rounded-md border px-3 py-2 font-body text-xs font-medium transition-colors ${borderMode === 'full_bleed' ? 'border-teal bg-teal text-cream' : 'border-charcoal/20 text-charcoal hover:bg-charcoal/5'}`}
              >
                Full bleed
              </button>
              <button
                type="button"
                onClick={() => { setBorderMode('matte'); setUnsavedCrop(true) }}
                className={`flex-1 rounded-md border px-3 py-2 font-body text-xs font-medium transition-colors ${borderMode === 'matte' ? 'border-teal bg-teal text-cream' : 'border-charcoal/20 text-charcoal hover:bg-charcoal/5'}`}
              >
                Matte border
              </button>
              {borderMode === 'matte' && (
                <input
                  type="color"
                  value={borderColor}
                  onChange={(e) => { setBorderColor(e.target.value); setUnsavedCrop(true) }}
                  aria-label="Matte color"
                  className="h-9 w-9 cursor-pointer rounded-md border border-charcoal/20 bg-white p-0.5"
                />
              )}
            </div>
            <p className="font-body text-[11px] text-charcoal/45">
              {borderMode === 'full_bleed'
                ? 'Full bleed: the crop fills the print, edge to edge.'
                : 'Matte adds a border while keeping the selected crop shape. It does not fit an uncut image into a different frame shape.'}
            </p>
            {status && (
              <p className="font-body text-[11px] text-charcoal/55">
                Print file: <span className="font-medium">{status === 'pending' ? 'waiting to be prepared' : status === 'processing' ? 'being prepared' : status === 'ready' ? 'ready' : status}</span>
                {status === 'pending' && ' — print sizes will be available when the new file is ready.'}
                {status === 'processing' && ' — the new file is being created. You can still edit and save a newer crop; the size information refreshes automatically.'}
                {status === 'ready' && (unsavedCrop ? ' — this is the previous saved file. Apply the new crop to use your current selection.' : ' — ready to use. Close this window to add or review print sizes.')}
              </p>
            )}
          </div>

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
                  This replaces the print file for every product linked to “{master.title}”. The original upload stays safe. Existing print sizes will be adjusted to follow the new artwork shape and repriced when the new file is ready. If another crop is already being prepared, this one replaces it. Products may be unavailable while it is being prepared.
                </p>
                <p className="mt-2 font-body text-sm leading-relaxed text-charcoal/70">Make sure the important edges of the artwork are inside the box before continuing.</p>
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

        <div className="flex items-center justify-between gap-2 border-t border-charcoal/10 p-4">
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
            disabled={!showDone && (saving || duplicateSave || !crop || previewMismatch || !!previewError)}
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

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

/** Turn storage/worker details into a message an artist can act on. */
function friendlyCropError(message: string): string {
  if (/invalid compact jws|accessdenied|unauthorized|expired token/i.test(message)) {
    return 'The new print file could not be saved because storage access expired. Your previous print file is still safe and in use. Try saving the crop again.'
  }
  if (/too large|over 100 mb|350 mb/i.test(message)) {
    return 'This artwork is too large for automatic cropping. The original is safe; ask support to prepare this print file.'
  }
  if (/could not download|read the original/i.test(message)) {
    return 'The original artwork could not be read. Check that the master is still in your library, then try again.'
  }
  return message
}
