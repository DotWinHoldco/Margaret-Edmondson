'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Rect = { x: number; y: number; w: number; h: number }
type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se'
type BorderMode = 'full_bleed' | 'matte'

export interface MasterCropTarget {
  id: string
  title: string
  /** Web-resolution proxy to draw the crop rectangle on — NEVER the source TIFF. */
  proxyUrl: string
  crop_box?: { x: number; y: number; w: number; h: number } | null
  border_mode?: BorderMode | null
  border_color?: string | null
  print_status?: string | null
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
}: {
  master: MasterCropTarget
  onClose: () => void
  onSaved: (next: { print_status: string; border_mode: BorderMode; border_color: string }) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ mode: Mode; sx: number; sy: number; start: Rect } | null>(null)

  const [disp, setDisp] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [borderMode, setBorderMode] = useState<BorderMode>(master.border_mode ?? 'full_bleed')
  const [borderColor, setBorderColor] = useState<string>(master.border_color ?? '#ffffff')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(master.print_status ?? null)
  const [error, setError] = useState('')

  const onLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const el = e.currentTarget
      const nw = el.naturalWidth
      const nh = el.naturalHeight
      const r = Math.min(MAX_W / nw, MAX_H / nh, 1)
      const w = Math.round(nw * r)
      const h = Math.round(nh * r)
      setDisp({ w, h })
      // Seed from the saved crop_box (normalized → display px), else the full image.
      const cb = master.crop_box
      if (cb && cb.w > 0 && cb.h > 0) {
        setCrop({ x: Math.round(cb.x * w), y: Math.round(cb.y * h), w: Math.round(cb.w * w), h: Math.round(cb.h * h) })
      } else {
        setCrop({ x: 0, y: 0, w, h })
      }
    },
    [master.crop_box],
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
    setCrop(clamp(next, disp.w, disp.h))
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
    if (!crop || !disp) return
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
      const r = await fetch(`/api/admin/master-artworks/${master.id}/crop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ crop_box, border_mode: borderMode, border_color: borderColor }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || 'Could not queue the crop')
      const next = body.data?.print_status || 'pending'
      setStatus(next)
      onSaved({ print_status: next, border_mode: borderMode, border_color: borderColor })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Crop failed')
    } finally {
      setSaving(false)
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
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-xl bg-cream shadow-2xl">
        <div className="flex items-center justify-between border-b border-charcoal/10 p-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-charcoal">Crop master / set print area</h2>
            <p className="font-body text-xs text-charcoal/55">{master.title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-charcoal/50 hover:bg-charcoal/5 hover:text-charcoal">
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 p-5">
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
            {crop && disp && (
              <div
                className="absolute cursor-move"
                style={{
                  left: crop.x,
                  top: crop.y,
                  width: crop.w,
                  height: crop.h,
                  boxShadow: '0 0 0 9999px rgba(20,20,20,0.55)',
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
                onClick={() => setBorderMode('full_bleed')}
                className={`flex-1 rounded-md border px-3 py-2 font-body text-xs font-medium transition-colors ${borderMode === 'full_bleed' ? 'border-teal bg-teal text-cream' : 'border-charcoal/20 text-charcoal hover:bg-charcoal/5'}`}
              >
                Full bleed
              </button>
              <button
                type="button"
                onClick={() => setBorderMode('matte')}
                className={`flex-1 rounded-md border px-3 py-2 font-body text-xs font-medium transition-colors ${borderMode === 'matte' ? 'border-teal bg-teal text-cream' : 'border-charcoal/20 text-charcoal hover:bg-charcoal/5'}`}
              >
                Matte border
              </button>
              {borderMode === 'matte' && (
                <input
                  type="color"
                  value={borderColor}
                  onChange={(e) => setBorderColor(e.target.value)}
                  aria-label="Matte color"
                  className="h-9 w-9 cursor-pointer rounded-md border border-charcoal/20 bg-white p-0.5"
                />
              )}
            </div>
            <p className="font-body text-[11px] text-charcoal/45">
              {borderMode === 'full_bleed'
                ? 'Full bleed: the crop fills the print, edge to edge.'
                : 'Matte: pad the crop to its exact aspect with a solid border so every size matches.'}
            </p>
            {status && (
              <p className="font-body text-[11px] text-charcoal/55">
                Print master: <span className="font-medium">{status}</span>
                {status === 'pending' && ' — run the crop worker to generate the print file.'}
                {status === 'ready' && ' — print-ready master generated.'}
              </p>
            )}
          </div>

          {error && <p className="font-body text-xs text-coral text-center">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-charcoal/10 p-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-body text-sm font-medium text-charcoal/70 hover:bg-charcoal/5">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !crop}
            className="rounded-lg bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save crop & queue'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}
