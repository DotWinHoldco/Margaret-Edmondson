'use client'
// Authored by DotWin
import SegmentError from '@/components/shared/SegmentError'

export default function CheckoutError({
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
      title="We hit a snag at checkout"
      message="Your card has not been charged. Please try again — if the problem continues, contact us and we'll sort it out."
    />
  )
}
