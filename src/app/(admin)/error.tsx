'use client'
// Authored by DotWin
import SegmentError from '@/components/shared/SegmentError'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SegmentError
      error={error}
      reset={reset}
      title="This screen hit a snag"
      message="Something went wrong loading this part of the admin. Try again, or reload the page."
    />
  )
}
