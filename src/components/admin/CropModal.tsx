'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Item {
  id: string
  url: string
  product_title: string
}

type Rect = { x: number; y: number; w: number; h: number }
type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const MAX_W = 640
const MAX_H = 520
const MIN = 28

// Free-form crop tool. Loads the product photo (CORS-enabled so the canvas isn't
// tainted), lets you move/resize a crop box, then exports the cropped region as a
// webp and posts it to the crop API. The original is preserved server-side.
export default function CropModal({
  item,
  onClose,
  onSaved,
}: {
  item: Item
  onClose: () => void
  onSaved: (next: { url: string; width: number; height: number }) => void
}) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ mode: Mode; sx: number; sy: number; start: Rect } | null>(null)

  const [disp, setDisp] = useState<{ w: number; h: number } | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Force a fresh, CORS-enabled fetch so canvas export isn't blocked by a
  // previously-cached non-CORS copy of the same URL.
  const corsUrl = item.url + (item.url.includes('?') ? '&' : '?') + 'cors=1'

  const onLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget
    const nw = el.naturalWidth, nh = el.naturalHeight
    const r = Math.min(MAX_W / nw, MAX_H / nh, 1)
    const w = Math.round(nw * r), h = Math.round(nh * r)
    setNat({ w: nw, h: nh })
    setDisp({ w, h })
    // default crop: centered 86%
    const cw = Math.round(w * 0.86), ch = Math.round(h * 0.86)
    setCrop({ x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: cw, h: ch })
  }, [])

  const clamp = useCallback((r: Rect, bw: number, bh: number): Rect => {
    let { x, y, w, h } = r
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
    const dx = e.clientX - sx, dy = e.clientY - sy
    let next: Rect
    if (mode === 'move') {
      next = { ...start, x: start.x + dx, y: start.y + dy }
    } else {
      let { x, y, w, h } = start
      if (mode === 'nw') { x = start.x + dx; y = start.y + dy; w = start.w - dx; h = start.h - dy }
      if (mode === 'ne') { y = start.y + dy; w = start.w + dx; h = start.h - dy }
      if (mode === 'sw') { x = start.x + dx; w = start.w - dx; h = start.h + dy }
      if (mode === 'se') { w = start.w + dx; h = start.h + dy }
      // prevent inversion
      if (w < MIN) { if (mode === 'nw' || mode === 'sw') x = start.x + start.w - MIN; w = MIN }
      if (h < MIN) { if (mode === 'nw' || mode === 'ne') y = start.y + start.h - MIN; h = MIN }
      next = { x, y, w, h }
    }
    setCrop(clamp(next, disp.w, disp.h))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null
    try { wrapRef.current?.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  async function apply() {
    if (!crop || !disp || !nat || !imgRef.current) return
    setSaving(true)
    setError('')
    try {
      const scaleX = nat.w / disp.w, scaleY = nat.h / disp.h
      const sw = Math.round(crop.w * scaleX), sh = Math.round(crop.h * scaleY)
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported')
      ctx.drawImage(imgRef.current, crop.x * scaleX, crop.y * scaleY, sw, sh, 0, 0, sw, sh)
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9))
      if (!blob) throw new Error('Could not export the crop')
      const fd = new FormData()
      fd.append('file', blob, 'crop.webp')
      fd.append('width', String(sw))
      fd.append('height', String(sh))
      const r = await fetch(`/api/admin/product-images/${item.id}/crop`, { method: 'POST', body: fd })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || 'Save failed')
      onSaved({ url: body.data.url, width: body.data.width, height: body.data.height })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Crop failed (the image may block cross-origin canvas export).')
    } finally {
      setSaving(false)
    }
  }

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
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
            <h2 className="font-display text-lg font-semibold text-charcoal">Crop photo</h2>
            <p className="font-body text-xs text-charcoal/55">{item.product_title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-charcoal/50 hover:bg-charcoal/5 hover:text-charcoal">✕</button>
        </div>

        <div className="flex flex-col items-center gap-2 p-5">
          <div
            ref={wrapRef}
            className="relative select-none touch-none"
            style={{ width: disp?.w, height: disp?.h }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={corsUrl}
              crossOrigin="anonymous"
              alt={item.product_title}
              onLoad={onLoad}
              draggable={false}
              className="block"
              style={{ width: disp?.w, height: disp?.h }}
            />
            {crop && disp && (
              <div
                className="absolute cursor-move"
                style={{
                  left: crop.x, top: crop.y, width: crop.w, height: crop.h,
                  boxShadow: '0 0 0 9999px rgba(20,20,20,0.55)',
                  outline: '1px solid rgba(255,255,255,0.9)',
                }}
                onPointerDown={onPointerDown('move')}
              >
                {/* rule-of-thirds guides */}
                <div className="pointer-events-none absolute inset-0 border border-white/40" />
                <span onPointerDown={onPointerDown('nw')} className={`${handle} -left-1.5 -top-1.5 cursor-nwse-resize`} />
                <span onPointerDown={onPointerDown('ne')} className={`${handle} -right-1.5 -top-1.5 cursor-nesw-resize`} />
                <span onPointerDown={onPointerDown('sw')} className={`${handle} -bottom-1.5 -left-1.5 cursor-nesw-resize`} />
                <span onPointerDown={onPointerDown('se')} className={`${handle} -bottom-1.5 -right-1.5 cursor-nwse-resize`} />
              </div>
            )}
            {!disp && <p className="py-16 font-body text-sm text-charcoal/40">Loading image…</p>}
          </div>

          {nat && crop && disp && (
            <p className="font-body text-[11px] text-charcoal/45">
              Crop: {Math.round(crop.w * (nat.w / disp.w))} × {Math.round(crop.h * (nat.h / disp.h))} px
            </p>
          )}
          {error && <p className="font-body text-xs text-coral text-center">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-charcoal/10 p-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-body text-sm font-medium text-charcoal/70 hover:bg-charcoal/5">
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={saving || !crop}
            className="rounded-lg bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Crop & save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
