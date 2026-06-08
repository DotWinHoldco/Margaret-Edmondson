'use client'

import { useState, useEffect } from 'react'

interface Address {
  street: string
  city: string
  state: string
  postal_code: string
  country: string
}

export default function BusinessInfoSection() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [addr, setAddr] = useState<Address>({
    street: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (!cancelled && data.settings) {
        const s = data.settings
        setName(s.business_name || '')
        setEmail(s.business_email || '')
        setPhone(s.business_phone || '')
        setAddr({
          street: s.business_address?.street || '',
          city: s.business_address?.city || '',
          state: s.business_address?.state || '',
          postal_code: s.business_address?.postal_code || '',
          country: s.business_address?.country || '',
        })
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
        business_name: name,
        business_email: email,
        business_phone: phone,
        business_address: addr,
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
        <p className="font-body text-sm text-charcoal/40">Loading business info...</p>
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-charcoal mb-1">
        Business &amp; Contact
      </h2>
      <p className="font-body text-xs text-charcoal/50 mb-5">
        Used across the storefront, receipts, and customer-facing emails.
      </p>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Business Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ArtByME"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Business Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hello@artbyme.studio"
              className={inputCls}
            />
          </div>
        </div>
        <div className="max-w-xs">
          <label className={labelCls}>Phone (optional)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className={inputCls}
          />
        </div>

        <div className="pt-2">
          <h3 className="font-body text-sm font-semibold text-charcoal/70 uppercase tracking-wider mb-3">
            Business Address
          </h3>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Street</label>
              <input
                type="text"
                value={addr.street}
                onChange={(e) => setAddr((a) => ({ ...a, street: e.target.value }))}
                placeholder="123 Main St"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>City</label>
                <input
                  type="text"
                  value={addr.city}
                  onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>State / Region</label>
                <input
                  type="text"
                  value={addr.state}
                  onChange={(e) => setAddr((a) => ({ ...a, state: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Postal Code</label>
                <input
                  type="text"
                  value={addr.postal_code}
                  onChange={(e) =>
                    setAddr((a) => ({ ...a, postal_code: e.target.value }))
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Country</label>
                <input
                  type="text"
                  value={addr.country}
                  onChange={(e) => setAddr((a) => ({ ...a, country: e.target.value }))}
                  placeholder="United States"
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Business Info'}
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
