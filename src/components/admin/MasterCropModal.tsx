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
  const [disp, setDisp] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [borderMode, setBorderMode] = useState<BorderMode>(master.border_mode ?? 'full_bleed')
  const [borderColor, setBorderColor] = useState<string>(master.border_color ?? '#ffffff')
  const [saving, setSaving] = useState(false)
  const [unsavedCrop, setUnsavedCrop] = useState(Boolean(initialAspectRatio))
  const [status, setStatus] = useState<string | null>(master.print_status ?? null)
  const [error, setError] = useState('')
  const toast = useToast()
  useEffect(() => { setStatus(master.print_status ?? null) }, [master.print_status])

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

  async function save() {
    if (!crop || !disp || previewMismatch) return
    setSaving(true)
    setError('')
    try {
      // Normalize to 0..1 of the ORIGINAL (the worker reads regions by fraction).
      const crop_box = {
        x: round4(crop.x / disp.w),
        y: round4(crop.y / disp.h),
        w: round4(crop.w / disp.w),
        h: round4(crop.h / disp.h),
      }
      const data = await apiSend<{ print_status?: string }>(
        `/api/admin/master-artworks/${master.id}/crop`,
        'POST',
        { crop_box, border_mode: borderMode, border_color: borderColor },
      )
      const next = data?.print_status || 'pending'
      setStatus(next)
      setUnsavedCrop(false)
      toast.success('Print master queued for processing.')
      onSaved({ print_status: next, border_mode: borderMode, border_color: borderColor })
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      toast.error(message)
    } finally {
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
      setStatus('ready')
      setUnsavedCrop(false)
      toast.success('Print master reverted to the uncropped original.')
      onSaved({ print_status: 'ready', border_mode: 'full_bleed', border_color: '#ffffff' })
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
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
              <option value={0}>Free crop</option>
              {[...new Set([initialAspectRatio, 4/5, 5/4, 5/7, 7/5, 11/14, 14/11, 3/4, 4/3, 1].filter((n): n is number => typeof n === 'number' && n > 0))].map(ratio => <option key={ratio} value={ratio}>{ratio === 4/5 ? '4:5 portrait — 8 × 10, 16 × 20' : ratio === 5/4 ? '5:4 landscape — 10 × 8, 20 × 16' : ratio === 1 ? 'Square' : `Locked shape ${ratio.toFixed(3)}`}</option>)}
            </select>
          </label>
          {previewMismatch && <p role="alert" className="w-full rounded border border-coral/30 bg-coral/10 p-3 text-sm text-charcoal">This preview has a different shape from the original print file. It may already be cropped. Choose an uncropped preview of the same artwork before saving a print crop.</p>}
          <p className="w-full text-xs leading-relaxed text-charcoal/65">The preview must show the same uncropped artwork as the original print file. The box shows the art that will remain. A locked shape keeps standard print proportions while you move or resize it. Review all edges before saving. Saving changes this master for every linked product; existing sizes must be checked again after processing.</p>
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
                Print master: <span className="font-medium">{status}</span>
                {status === 'pending' && ' — queued for processing. Print sizes will be available when this file is ready.'}
                {status === 'processing' && ' — creating the print file. You can leave this editor open; the size information refreshes automatically.'}
                {status === 'ready' && (unsavedCrop ? ' — this is the previous saved file. Save crop to apply your new selection.' : ' — print-ready master generated. Close this window to add your print sizes.')}
              </p>
            )}
          </div>

          {master.print_error && <p role="alert" className="text-sm text-coral">{master.print_error} Review the crop and save again to retry.</p>}
          {error && <p className="font-body text-xs text-coral text-center">{error}</p>}
        </div>

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
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !crop || previewMismatch || status === 'pending' || status === 'processing'}
            className="rounded-lg bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving…' : status === 'pending' || status === 'processing' ? 'Processing crop…' : 'Save crop'}
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
