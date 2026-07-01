'use client'
// Authored by DotWin
import SegmentError from '@/components/shared/SegmentError'

export default function CoursesError({
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
      title="We couldn't load your courses"
      message="Please try again in a moment. Your progress is saved."
    />
  )
}
