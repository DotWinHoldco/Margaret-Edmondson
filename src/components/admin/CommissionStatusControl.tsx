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

export default function CommissionStatusControl({
  commissionId,
  currentStatus,
  statuses,
}: {
  commissionId: string
  currentStatus: string
  statuses: readonly string[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [status, setStatus] = useState(currentStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await apiSend('/api/commissions', 'PATCH', { id: commissionId, status })
      toast.success('Status updated.')
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
      {error && <p className="mt-2 font-body text-xs text-coral">{error}</p>}
    </div>
  )
}
