// Authored by DotWin
//
// A small inline status banner for form-level feedback where a transient toast
// isn't enough (e.g. a validation summary that should persist next to the
// submit button). Success is teal, error is coral — matching the toast system.
// For fire-and-forget confirmations, prefer useToast() instead.

export type BannerStatus = { type: 'success' | 'error' | 'info'; text: string } | null

export default function StatusBanner({ status, className = '' }: { status: BannerStatus; className?: string }) {
  if (!status || !status.text) return null
  const palette =
    status.type === 'success'
      ? 'border-teal/30 bg-teal/10 text-teal'
      : status.type === 'error'
        ? 'border-coral/30 bg-coral/10 text-coral'
        : 'border-charcoal/20 bg-charcoal/5 text-charcoal'
  return (
    <div
      role={status.type === 'error' ? 'alert' : 'status'}
      className={`rounded-sm border px-3 py-2 font-body text-sm ${palette} ${className}`}
    >
      {status.text}
    </div>
  )
}
