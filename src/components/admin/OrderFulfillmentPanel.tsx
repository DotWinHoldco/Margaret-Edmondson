'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface FulfillmentItem {
  id: string
  title: string
  fulfillment_type: string
  fulfillment_status: string
  tracking_number: string | null
  tracking_url: string | null
  carrier: string | null
  shipped_at: string | null
}

function ItemRow({ item }: { item: FulfillmentItem }) {
  const router = useRouter()
  const [carrier, setCarrier] = useState(item.carrier || '')
  const [trackingNumber, setTrackingNumber] = useState(item.tracking_number || '')
  const [trackingUrl, setTrackingUrl] = useState(item.tracking_url || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function patch(extra: Record<string, unknown>) {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/order-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier, tracking_number: trackingNumber, tracking_url: trackingUrl, ...extra }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMsg(data.error || 'Save failed')
        return
      }
      router.refresh()
    } catch {
      setMsg('Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-charcoal/10 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-body text-sm font-medium text-charcoal">{item.title}</p>
        <span className="inline-flex rounded-full bg-charcoal/5 px-2 py-0.5 font-body text-xs capitalize text-charcoal/60">
          {item.fulfillment_status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          placeholder="Carrier (USPS, UPS…)"
          className="rounded-lg border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
        />
        <input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="Tracking number"
          className="rounded-lg border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
        />
        <input
          value={trackingUrl}
          onChange={(e) => setTrackingUrl(e.target.value)}
          placeholder="Tracking URL (optional)"
          className="rounded-lg border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => patch({})}
          disabled={busy}
          className="rounded-lg bg-charcoal/5 px-3 py-1.5 font-body text-xs font-medium text-charcoal/70 transition-colors hover:bg-charcoal/10 disabled:opacity-50"
        >
          Save tracking
        </button>
        <button
          type="button"
          onClick={() => patch({ mark_shipped: true })}
          disabled={busy}
          className="rounded-lg bg-teal px-3 py-1.5 font-body text-xs font-medium text-white transition-colors hover:bg-deep-teal disabled:opacity-50"
        >
          Mark shipped
        </button>
        <button
          type="button"
          onClick={() => patch({ mark_delivered: true })}
          disabled={busy}
          className="rounded-lg bg-olive px-3 py-1.5 font-body text-xs font-medium text-white transition-colors hover:bg-olive/80 disabled:opacity-50"
        >
          Mark delivered
        </button>
        {item.shipped_at && (
          <span className="font-body text-xs text-charcoal/40">
            Shipped {new Date(item.shipped_at).toLocaleDateString('en-US')}
          </span>
        )}
        {msg && <span className="font-body text-xs text-coral">{msg}</span>}
      </div>
    </div>
  )
}

export default function OrderFulfillmentPanel({ items }: { items: FulfillmentItem[] }) {
  if (!items.length) return null
  return (
    <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">Shipping &amp; Tracking</h2>
      <div className="space-y-3">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
