'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Shown on the order confirmation page when the order row isn't readable yet —
 * i.e. the Stripe webhook hasn't finished writing it (normal: a few seconds) or
 * SUPABASE_SERVICE_ROLE_KEY isn't set in the environment. Re-renders the server
 * component a handful of times so the receipt appears as soon as it lands,
 * then stops so we don't poll forever.
 */
export default function OrderConfirmationPoll({
  maxAttempts = 6,
  intervalMs = 4000,
}: {
  maxAttempts?: number
  intervalMs?: number
}) {
  const router = useRouter()
  const attempts = useRef(0)

  useEffect(() => {
    const id = setInterval(() => {
      attempts.current += 1
      if (attempts.current > maxAttempts) {
        clearInterval(id)
        return
      }
      router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, maxAttempts, intervalMs])

  return (
    <p className="mt-6 font-body text-sm text-charcoal/50">
      This page updates automatically once your order is ready…
    </p>
  )
}
