'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

function formatStatusLabel(status: string) {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

type UpdateResult = {
  success?: boolean
  refund_issued?: boolean
  refund_note?: string | null
}

export default function OrderStatusControl({
  orderId,
  currentStatus,
  statuses,
}: {
  orderId: string
  currentStatus: string
  statuses: readonly string[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [status, setStatus] = useState(currentStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Persistent warning shown when the status flipped to "refunded" but no money
  // actually moved (no payment intent, or Stripe key not configured).
  const [refundWarning, setRefundWarning] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    setRefundWarning(null)
    try {
      const result = await apiSend<UpdateResult>(
        `/api/admin/orders/${orderId}`,
        'PATCH',
        { status },
      )
      // Money correctness: setting "refunded" can succeed at the DB level while
      // no Stripe refund was issued. Surface that loudly so the admin never
      // believes money moved when it did not.
      if (status === 'refunded' && result?.refund_issued === false) {
        const note =
          result.refund_note ||
          'Status updated, but no refund was issued. Please issue the refund manually.'
        setRefundWarning(note)
        toast.error('Status saved, but no refund was issued. See the warning below.')
      } else {
        toast.success('Order status updated.')
      }
      router.refresh()
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="w-full rounded-lg border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
      >
        {statuses.map((s) => (
          <option key={s} value={s}>
            {formatStatusLabel(s)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 w-full rounded-lg bg-teal px-4 py-2 font-body text-sm font-medium text-white transition-colors hover:bg-deep-teal disabled:opacity-50"
      >
        {saving ? 'Updating...' : 'Update Status'}
      </button>
      {refundWarning && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 font-body text-xs text-charcoal"
        >
          <span className="font-semibold">No refund issued. </span>
          {refundWarning}
        </div>
      )}
      {error && <p className="mt-2 font-body text-xs text-coral">{error}</p>}
    </div>
  )
}
