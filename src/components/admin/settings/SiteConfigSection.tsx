'use client'

import { useState, useEffect } from 'react'

const CURRENCIES = [
  { code: 'usd', label: 'USD — US Dollar' },
  { code: 'cad', label: 'CAD — Canadian Dollar' },
  { code: 'eur', label: 'EUR — Euro' },
  { code: 'gbp', label: 'GBP — British Pound' },
  { code: 'aud', label: 'AUD — Australian Dollar' },
]

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-teal' : 'bg-charcoal/30'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function SiteConfigSection() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [announcementText, setAnnouncementText] = useState('')
  const [announcementEnabled, setAnnouncementEnabled] = useState(false)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [currency, setCurrency] = useState('usd')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (!cancelled && data.settings) {
        const s = data.settings
        setAnnouncementText(s.announcement_bar_text || '')
        setAnnouncementEnabled(!!s.announcement_bar_enabled)
        setMaintenanceMode(!!s.maintenance_mode)
        setCurrency(s.currency_code || 'usd')
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
        announcement_bar_text: announcementText,
        announcement_bar_enabled: announcementEnabled,
        maintenance_mode: maintenanceMode,
        currency_code: currency,
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
        <p className="font-body text-sm text-charcoal/40">Loading site config...</p>
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-charcoal mb-1">
        Site Configuration
      </h2>
      <p className="font-body text-xs text-charcoal/50 mb-5">
        Announcement bar, maintenance mode, and storefront currency.
      </p>
      <div className="space-y-6">
        {/* Announcement bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-body text-sm font-semibold text-charcoal/70 uppercase tracking-wider">
              Announcement Bar
            </h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <Toggle
                checked={announcementEnabled}
                onChange={setAnnouncementEnabled}
              />
              <span className="font-body text-sm text-charcoal">
                {announcementEnabled ? 'On' : 'Off'}
              </span>
            </label>
          </div>
          <div>
            <label className={labelCls}>Bar Text</label>
            <input
              type="text"
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              placeholder="Free shipping on all originals this week"
              className={inputCls}
            />
            <p className="mt-1 font-body text-xs text-charcoal/30">
              Shown as a banner at the top of every public page when enabled.
            </p>
          </div>
        </div>

        {/* Maintenance mode */}
        <div className="flex items-center justify-between gap-4 rounded-sm border border-charcoal/10 p-4">
          <div>
            <p className="font-body text-sm font-medium text-charcoal">
              Maintenance Mode
            </p>
            <p className="font-body text-xs text-charcoal/50">
              Show a maintenance page to public visitors. Admins keep full access.
            </p>
          </div>
          <Toggle checked={maintenanceMode} onChange={setMaintenanceMode} />
        </div>

        {/* Currency */}
        <div className="max-w-xs">
          <label className={labelCls}>Storefront Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Site Config'}
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
