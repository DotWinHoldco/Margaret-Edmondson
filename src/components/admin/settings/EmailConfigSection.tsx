'use client'

import { useState, useEffect } from 'react'

export default function EmailConfigSection() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [fromName, setFromName] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [orderNotify, setOrderNotify] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (!cancelled && data.settings) {
        const s = data.settings
        setFromName(s.email_from_name || '')
        setFromAddress(s.email_from_address || '')
        setOrderNotify(s.order_notification_email || '')
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
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_from_name: fromName,
        email_from_address: fromAddress,
        order_notification_email: orderNotify,
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
        <p className="font-body text-sm text-charcoal/40">Loading email config...</p>
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-charcoal mb-1">
        Email Configuration
      </h2>
      <p className="font-body text-xs text-charcoal/50 mb-5">
        The from-line on outbound email and the inbox that receives new-order
        alerts. The sending domain must be verified in Resend.
      </p>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>From Name</label>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="ArtByME"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>From Address</label>
            <input
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="hello@artbyme.studio"
              className={inputCls}
            />
          </div>
        </div>
        <p className="font-body text-xs text-charcoal/40">
          Preview:{' '}
          <code className="rounded-sm bg-charcoal/[0.04] px-1.5 py-0.5 text-[11px] text-charcoal/70">
            {(fromName || 'ArtByME')} &lt;{fromAddress || 'hello@artbyme.studio'}&gt;
          </code>
        </p>
        <div className="max-w-md">
          <label className={labelCls}>Order Notification Email</label>
          <input
            type="email"
            value={orderNotify}
            onChange={(e) => setOrderNotify(e.target.value)}
            placeholder="orders@artbyme.studio"
            className={inputCls}
          />
          <p className="mt-1 font-body text-xs text-charcoal/30">
            Where a copy of each new order is sent. Leave blank to disable.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Email Config'}
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
