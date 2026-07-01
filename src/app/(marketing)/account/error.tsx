'use client'
// Authored by DotWin
import SegmentError from '@/components/shared/SegmentError'

export default function AccountError({
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
      title="We couldn't load your account"
      message="Please try again. If it keeps happening, contact us and we'll help."
    />
  )
}
