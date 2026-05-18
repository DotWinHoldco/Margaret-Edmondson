'use client'

import { useEffect } from 'react'

/**
 * Warn the user before leaving the page if they have unsaved changes.
 * Handles browser navigation (close tab, refresh, back button) via beforeunload.
 * In-app navigation (Next router push) is harder to intercept without a custom
 * router wrapper, so for now we only catch hard exits — usually enough for
 * admin pages where the main loss vector is closing the tab.
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      // Modern browsers ignore the message and show a generic prompt
      e.returnValue = 'You have unsaved changes. Leave anyway?'
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])
}
