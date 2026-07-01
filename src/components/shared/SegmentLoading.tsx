// Authored by DotWin
//
// Shared loading placeholder used by per-segment loading.tsx files, so a
// navigation or slow data fetch shows an intentional state instead of a blank
// frame. Purely presentational; no client hooks needed.

export default function SegmentLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 py-16" aria-busy="true">
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-charcoal/15 border-t-teal"
        aria-hidden
      />
      <p className="font-body text-sm text-charcoal/40">{label}</p>
    </div>
  )
}
