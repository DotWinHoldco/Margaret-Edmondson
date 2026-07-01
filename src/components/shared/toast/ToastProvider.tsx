'use client'
// Authored by DotWin
//
// The app-wide toast system for ArtByME. One place for loud, consistent
// feedback: green for success ("Saved."), coral for errors (always friendly
// copy — see src/lib/errors/friendly.ts). Mounted once in
// src/components/shared/Providers.tsx so every admin and storefront screen can
// call useToast() without wiring anything.
//
//   const toast = useToast()
//   toast.success('Saved.')
//   toast.error(errorMessage(err))   // friendly copy from the fetch wrapper

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastApi {
  success: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
  info: (message: string, durationMs?: number) => void
  show: (type: ToastType, message: string, durationMs?: number) => void
}

// A no-op default so useToast() never throws when a component happens to render
// outside the provider (defensive — the provider is mounted app-wide).
const noop: ToastApi = {
  success: () => {},
  error: () => {},
  info: () => {},
  show: () => {},
}

const ToastContext = createContext<ToastApi>(noop)

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3200,
  info: 4000,
  error: 6000,
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (type: ToastType, message: string, durationMs?: number) => {
      const text = (message || '').trim()
      if (!text) return
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, type, message: text }])
      const duration = durationMs ?? DEFAULT_DURATION[type]
      const timer = setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m, d) => show('success', m, d),
      error: (m, d) => show('error', m, d),
      info: (m, d) => show('info', m, d),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[9999] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const palette: Record<ToastType, string> = {
    success: 'bg-teal text-cream',
    error: 'bg-coral text-white',
    info: 'bg-charcoal text-cream',
  }
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-sm px-4 py-3 font-body text-sm shadow-lg ${palette[toast.type]}`}
    >
      <span aria-hidden className="mt-px shrink-0 font-semibold">
        {toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠' : 'i'}
      </span>
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="-mr-1 shrink-0 opacity-70 transition-opacity hover:opacity-100"
      >
        {'×'}
      </button>
    </div>
  )
}
