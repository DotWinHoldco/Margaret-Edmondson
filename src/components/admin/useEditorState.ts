'use client'

import { useEffect } from 'react'

export interface EditorState { dirty: boolean; saving: boolean }
export type EditorStateChange = (state: EditorState) => void

/** Let the guide protect drafts, including when the browser tab is closed. */
export function useEditorState(dirty: boolean, saving: boolean, onChange?: EditorStateChange) {
  useEffect(() => { onChange?.({ dirty, saving }) }, [dirty, saving, onChange])
  useEffect(() => () => { onChange?.({ dirty: false, saving: false }) }, [onChange])
  useEffect(() => {
    if (!dirty && !saving) return
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [dirty, saving])
}
