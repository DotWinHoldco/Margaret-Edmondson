'use client'

import { useEffect } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Replaces native window.confirm() with a brand-aligned modal that
 * supports keyboard dismissal (Esc) and explicit destructive styling.
 *
 *   const [confirming, setConfirming] = useState(false)
 *   <ConfirmDialog
 *     open={confirming}
 *     title="Delete this product?"
 *     message="This will archive the product and remove it from the shop."
 *     variant="danger"
 *     confirmText="Delete"
 *     onConfirm={...}
 *     onCancel={() => setConfirming(false)}
 *   />
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const confirmCls =
    variant === 'danger'
      ? 'bg-coral text-white hover:bg-coral/90'
      : 'bg-teal text-cream hover:bg-deep-teal'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-lg bg-cream shadow-2xl"
      >
        <div className="p-6">
          <h2 id="confirm-dialog-title" className="font-display text-xl font-light text-charcoal">
            {title}
          </h2>
          {message && (
            <p className="mt-3 font-body text-sm text-charcoal/70 leading-relaxed">{message}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 bg-white/40 p-4 rounded-b-lg">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm px-4 py-2 font-body text-sm text-charcoal/70 hover:text-charcoal transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-sm px-5 py-2 font-body text-sm font-medium transition-colors ${confirmCls}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
