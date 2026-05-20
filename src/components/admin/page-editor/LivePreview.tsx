'use client'

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'

type DeviceWidth = 'mobile' | 'tablet' | 'desktop'

const WIDTH_PX: Record<DeviceWidth, number | null> = {
  mobile: 390,
  tablet: 768,
  desktop: null,
}

export interface LivePreviewHandle {
  refresh: () => void
}

interface Props {
  src: string
  /** Bumped from the parent every save to force a soft refresh. */
  refreshToken: number
}

const LivePreview = forwardRef<LivePreviewHandle, Props>(function LivePreview({ src, refreshToken }, ref) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [device, setDevice] = useState<DeviceWidth>('desktop')
  const [bridgeReady, setBridgeReady] = useState(false)

  // Try a soft refresh via postMessage. If the bridge never reported
  // ready (older marketing layout, missed mount), fall back to a hard
  // reload after a short grace period.
  useEffect(() => {
    if (refreshToken === 0) return
    const iframe = iframeRef.current
    if (!iframe) return
    const win = iframe.contentWindow
    if (!win) return
    if (bridgeReady) {
      win.postMessage({ type: 'page-editor-refresh' }, window.location.origin)
    } else {
      try {
        win.location.reload()
      } catch {
        iframe.src = src + (src.includes('?') ? '&' : '?') + 't=' + Date.now()
      }
    }
  }, [refreshToken, bridgeReady, src])

  // Listen for the bridge's ready announcement.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string } | null
      if (data?.type === 'page-editor-ready') setBridgeReady(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useImperativeHandle(ref, () => ({
    refresh() {
      const win = iframeRef.current?.contentWindow
      if (!win) return
      if (bridgeReady) {
        win.postMessage({ type: 'page-editor-refresh' }, window.location.origin)
      } else {
        try { win.location.reload() } catch { /* ignore */ }
      }
    },
  }))

  const width = WIDTH_PX[device]

  return (
    <div className="flex h-full flex-col rounded-sm border border-charcoal/10 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-charcoal/10 bg-charcoal/[0.02] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-coral/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-gold/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-teal/70" />
          <span className="ml-2 font-mono text-xs text-charcoal/50">{src || '/'}</span>
        </div>
        <div className="flex items-center gap-1">
          {(['mobile', 'tablet', 'desktop'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              className={`rounded-sm px-2 py-1 font-body text-[10px] font-medium uppercase tracking-wider transition-colors ${
                device === d ? 'bg-charcoal text-cream' : 'text-charcoal/55 hover:text-charcoal'
              }`}
              title={d}
            >
              {deviceIcon(d)}
            </button>
          ))}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 rounded-sm px-2 py-1 text-charcoal/40 hover:text-charcoal"
            title="Open in new tab"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7-7 7M3 12h18" />
            </svg>
          </a>
        </div>
      </div>
      <div className="flex flex-1 items-stretch justify-center overflow-auto bg-charcoal/[0.04] p-3">
        <div
          className="mx-auto flex-1 overflow-hidden rounded-sm bg-white shadow-md"
          style={width ? { maxWidth: `${width}px` } : undefined}
        >
          {src ? (
            <iframe
              ref={iframeRef}
              src={src}
              title="Live preview"
              className="h-full w-full"
              style={{ minHeight: '600px', height: '100%' }}
            />
          ) : (
            <div className="flex h-full min-h-[600px] items-center justify-center font-body text-sm text-charcoal/45">
              No preview available.
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

function deviceIcon(d: DeviceWidth) {
  if (d === 'mobile') return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  )
  if (d === 'tablet') return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  )
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <line x1="8" y1="22" x2="16" y2="22" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  )
}

export default LivePreview
