'use client'

import { useState, useEffect } from 'react'

export default function ShippingConfigSection() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [originZip, setOriginZip] = useState('')
  const [originState, setOriginState] = useState('')
  const [freeThreshold, setFreeThreshold] = useState('') // dollars in the UI

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (!cancelled && data.settings) {
        const s = data.settings
        setOriginZip(s.shipping_origin_zip || '')
        setOriginState(s.shipping_origin_state || '')
        setFreeThreshold(
          s.free_shipping_threshold_cents != null
            ? (s.free_shipping_threshold_cents / 100).toString()
            : ''
        )
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    const cents =
      freeThreshold.trim() === ''
        ? null
        : Math.round(parseFloat(freeThreshold) * 100)
    if (cents != null && (!Number.isFinite(cents) || cents < 0)) {
      setSaving(false)
      setMsg({ type: 'error', text: 'Free shipping threshold must be a positive amount.' })
      return
    }
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipping_origin_zip: originZip,
        shipping_origin_state: originState,
        free_shipping_threshold_cents: cents,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setMsg({ type: 'error', text: data.error || 'Save failed.' })
    } else {
      setMsg({ type: 'success', text: 'Saved.' })
      setTimeout(() => setMsg(null), 2500)
    }
  }

  const inputCls =
    'w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal'
  const labelCls = 'block font-body text-sm font-medium text-charcoal mb-1.5'

  if (loading) {
    return (
      <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
        <p className="font-body text-sm text-charcoal/40">Loading shipping config...</p>
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-charcoal mb-1">
        Shipping Origin
      </h2>
      <p className="font-body text-xs text-charcoal/50 mb-5">
        Origin address used for LumaPrints shipping quotes, plus an optional
        free-shipping threshold.
      </p>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Origin Zip</label>
            <input
              type="text"
              value={originZip}
              onChange={(e) => setOriginZip(e.target.value)}
              placeholder="30301"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Origin State</label>
            <input
              type="text"
              value={originState}
              onChange={(e) => setOriginState(e.target.value)}
              placeholder="GA"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Free Shipping Over ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-body text-sm text-charcoal/50">
                $
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={freeThreshold}
                onChange={(e) => setFreeThreshold(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} pl-7`}
              />
            </div>
            <p className="mt-1 font-body text-xs text-charcoal/30">
              Leave blank to never offer free shipping.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Shipping Config'}
          </button>
          {msg && (
            <span
              className={`font-body text-sm ${
                msg.type === 'success' ? 'text-teal' : 'text-coral'
              }`}
            >
              {msg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
