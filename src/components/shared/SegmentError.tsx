'use client'
// Authored by DotWin
//
// Shared presentational error boundary used by per-segment error.tsx files. A
// thrown render/data error degrades to a recoverable, branded card instead of a
// white screen — and never leaks internals (stack, digest, message) to the user.

import { useEffect } from 'react'

export default function SegmentError({
  error,
  reset,
  title = 'Something went wrong',
  message = 'Please try again. If the problem continues, please contact us.',
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  message?: string
}) {
  useEffect(() => {
    // Developer-only signal; never rendered.
    console.error('[segment-error]', error)
  }, [error])

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <h2 className="font-display text-2xl font-light text-charcoal">{title}</h2>
      <div className="mt-3 h-px w-12 bg-gold" />
      <p className="mt-4 font-body text-sm text-charcoal/60">{message}</p>
      <button
        onClick={() => reset()}
        className="mt-6 rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal"
      >
        Try again
      </button>
    </div>
  )
}
