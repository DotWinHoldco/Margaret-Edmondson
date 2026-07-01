'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

const BADGE: Record<string, string> = {
  active: 'bg-teal/15 text-teal',
  draft: 'bg-charcoal/10 text-charcoal/60',
  archived: 'bg-coral/15 text-coral',
  sold: 'bg-gold/15 text-gold',
}

// Inline publish/unpublish (draft ↔ active) toggle on the products list.
export default function StatusToggle({ productId, status: initial }: { productId: string; status: string }) {
  const router = useRouter()
  const toast = useToast()
  const [status, setStatus] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function setTo(next: string) {
    const prev = status
    setStatus(next)
    setSaving(true)
    try {
      await apiSend(`/api/admin/products/${productId}`, 'PATCH', { status: next })
      toast.success(next === 'active' ? 'Product is now live.' : `Product moved to ${next}.`)
      router.refresh()
    } catch (err) {
      setStatus(prev)
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Archived/sold are a different lifecycle axis — show the badge plus a quick
  // "Publish" to bring it back live.
  if (status === 'archived' || status === 'sold') {
    return (
      <div className="flex items-center gap-2">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 font-body text-xs font-medium capitalize ${BADGE[status]}`}>{status}</span>
        <button
          type="button"
          disabled={saving}
          onClick={() => setTo('active')}
          className="font-body text-[10px] uppercase tracking-wider text-teal hover:text-deep-teal disabled:opacity-50"
        >
          Publish
        </button>
      </div>
    )
  }

  const isLive = status === 'active'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLive}
      disabled={saving}
      onClick={() => setTo(isLive ? 'draft' : 'active')}
      title={isLive ? 'Live — click to unpublish (move to draft)' : 'Draft — click to publish (make live)'}
      className="inline-flex items-center gap-2 disabled:opacity-50"
    >
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isLive ? 'bg-teal' : 'bg-charcoal/25'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isLive ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
      <span className={`font-body text-xs font-medium ${isLive ? 'text-teal' : 'text-charcoal/55'}`}>{isLive ? 'Live' : 'Draft'}</span>
    </button>
  )
}
