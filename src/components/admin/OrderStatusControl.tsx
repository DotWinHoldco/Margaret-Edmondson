'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function formatStatusLabel(status: string) {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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
  const [status, setStatus] = useState(currentStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to update status')
        return
      }
      router.refresh()
    } catch {
      setError('Failed to update status')
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
      {error && <p className="mt-2 font-body text-xs text-coral">{error}</p>}
    </div>
  )
}
