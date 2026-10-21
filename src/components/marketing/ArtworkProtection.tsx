'use client'

import { useEffect } from 'react'

/** Discourage casual image saving; displayed pixels can still be captured. */
export default function ArtworkProtection() {
  useEffect(() => {
    function protect(event: Event) {
      const target = event.target
      if (target instanceof HTMLImageElement && !target.closest('[data-allow-image-save]')) event.preventDefault()
    }
    document.addEventListener('contextmenu', protect)
    document.addEventListener('dragstart', protect)
    return () => {
      document.removeEventListener('contextmenu', protect)
      document.removeEventListener('dragstart', protect)
    }
  }, [])
  return null
}
