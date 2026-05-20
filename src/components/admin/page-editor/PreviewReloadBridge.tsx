'use client'

// Mounted in the public (marketing) layout. When the page is rendered
// inside an iframe (i.e. window.parent !== window), it listens for
// `{ type: 'page-editor-refresh' }` messages and calls router.refresh()
// to pull fresh server data without a hard reload (preserves scroll
// position). When NOT in an iframe, this component is a no-op.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const MESSAGE_TYPE = 'page-editor-refresh'

export default function PreviewReloadBridge() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.parent === window) return

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string } | null
      if (data?.type !== MESSAGE_TYPE) return
      router.refresh()
    }
    window.addEventListener('message', onMessage)
    // Announce readiness so the parent can clear any "loading" state.
    window.parent.postMessage({ type: 'page-editor-ready' }, window.location.origin)
    return () => window.removeEventListener('message', onMessage)
  }, [router])

  return null
}
