'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { resolveErrorMessage } from '@/lib/errors/friendly'

export default function EnrollButton({
  courseId,
  price,
  isAuthed,
}: {
  courseId: string
  price: number | null
  isAuthed: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isFree = !price || price <= 0

  async function handleEnroll() {
    setError(null)

    if (!isAuthed) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)
      return
    }

    setLoading(true)
    try {
      // Forward the access token so the enroll route can authenticate either
      // way (it accepts a Bearer token or the session cookie).
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const res = await fetch(`/api/courses/${courseId}/enroll`, {
        method: 'POST',
        headers,
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 409) {
          // Already enrolled — just refresh so the page shows the resume state.
          router.refresh()
          return
        }
        throw new Error(resolveErrorMessage({ code: data?.code, message: data?.error }))
      }

      if (data?.url) {
        // Paid course: hand off to Stripe Checkout.
        window.location.href = data.url
        return
      }

      // Free course enrolled directly.
      toast.success('You are enrolled. Enjoy the course.')
      router.refresh()
    } catch (err) {
      const friendly = resolveErrorMessage(err)
      setError(friendly)
      toast.error(friendly)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleEnroll}
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-sm bg-teal px-6 py-3 font-body text-sm font-medium uppercase tracking-wider text-white transition-colors hover:bg-deep-teal disabled:opacity-60 sm:w-auto"
      >
        {loading
          ? 'One moment…'
          : isFree
            ? 'Enroll for free'
            : 'Enroll now'}
      </button>
      {error && <p className="mt-2 font-body text-sm text-coral">{error}</p>}
    </div>
  )
}
