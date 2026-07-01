'use client'
// Authored by DotWin
import SegmentError from '@/components/shared/SegmentError'

export default function ShopError({
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
      title="We couldn't load the shop"
      message="Something went wrong on our end. Please try again in a moment."
    />
  )
}
