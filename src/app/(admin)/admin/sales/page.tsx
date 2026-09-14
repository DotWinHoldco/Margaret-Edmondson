'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LegacySalesDashboardPage() {
  const router = useRouter()

  useEffect(() => {
    // URL fragments are available only in the browser. Preserve old tax links.
    router.replace(`/admin${window.location.hash}`)
  }, [router])

  return (
    <p className="font-body text-sm text-charcoal/70" role="status">
      Opening your dashboard…{' '}
      <Link href="/admin" className="text-teal underline">Go to Dashboard</Link>
    </p>
  )
}
