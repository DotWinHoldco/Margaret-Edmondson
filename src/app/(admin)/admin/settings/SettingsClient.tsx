'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ─── Types ─── */

interface Integration {
  label: string
  configured: boolean
}

interface PromoCode {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_order_amount: number | null
  usage_limit: number | null
  usage_count: number
  valid_from: string | null
  valid_until: string | null
  is_active: boolean
}

/* ─── Main ─── */

export default function SettingsClient() {
  return (
    <div className="space-y-8">
      <AccountSection />
      <SiteSettingsSection />
      <PricingSettingsSection />
      <IntegrationStatusSection />
      <PromoCodesSection />
      <DangerZoneSection />
    </div>
  )
}

/* ─── Pricing Settings ─── */

function PricingSettingsSection() {
  const [marginPct, setMarginPct] = useState('')
  const [zips, setZips] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/admin/pricing/settings')
      const data = await res.json()
      if (data.data) {
        setMarginPct((Number(data.data.default_margin_pct) * 100).toString())
        setZips((data.data.shipping_quote_zips || []).join(', '))
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setSavedMsg(null)
    const body = {
      default_margin_pct: marginPct ? parseFloat(marginPct) / 100 : undefined,
      shipping_quote_zips: zips
        ? zips.split(',').map((z) => z.trim()).filter(Boolean)
        : undefined,
    }
    const res = await fetch('/api/admin/pricing/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setSavedMsg(data.error || 'Save failed')
    } else {
      setSavedMsg('Saved.')
      setTimeout(() => setSavedMsg(null), 2500)
    }
  }

  async function handleRefreshAll(useDefaults: boolean) {
    setRefreshing(true)
    setRefreshMsg(null)
    const res = await fetch('/api/admin/pricing/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useDefaults }),
    })
    const data = await res.json()
    setRefreshing(false)
    if (!res.ok) setRefreshMsg(data.error || 'Refresh failed')
    else setRefreshMsg(`Recomputed ${data.updated} variants from ${data.source}. ${data.skipped?.length || 0} skipped.`)
  }

  if (loading) {
    return (
      <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
        <p className="font-body text-sm text-charcoal/40">Loading pricing settings...</p>
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-charcoal mb-2">Pricing</h2>
      <p className="font-body text-xs text-charcoal/50 mb-5">
        Variant prices are <code>(wholesale + worst-case CONUS shipping) / (1 − margin)</code>. Shipping is included for contiguous US; AK, HI, and Canada are surcharged at checkout.
      </p>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
              Default Margin (%)
            </label>
            <div className="relative w-40">
              <input
                type="number"
                min="0"
                max="99"
                step="0.1"
                value={marginPct}
                onChange={(e) => setMarginPct(e.target.value)}
                className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-sm text-charcoal/50">%</span>
            </div>
            <p className="mt-1 font-body text-xs text-charcoal/30">Used when a product has no override.</p>
          </div>
          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
              CONUS Quote Zips (comma-separated)
            </label>
            <input
              type="text"
              value={zips}
              onChange={(e) => setZips(e.target.value)}
              placeholder="33101, 98101, 04401, 92101"
              className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
            <p className="mt-1 font-body text-xs text-charcoal/30">LumaPrints is quoted at each zip; the highest cost is baked into prices.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Pricing Settings'}
          </button>
          {savedMsg && (
            <span className="font-body text-sm text-teal">{savedMsg}</span>
          )}
        </div>

        <div className="border-t border-charcoal/8 pt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleRefreshAll(false)}
            disabled={refreshing}
            className="rounded-sm border border-charcoal/15 bg-cream px-4 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh prices (LumaPrints quote)'}
          </button>
          <button
            onClick={() => handleRefreshAll(true)}
            disabled={refreshing}
            className="rounded-sm border border-charcoal/15 bg-cream px-4 py-2 font-body text-sm font-medium text-charcoal/70 transition-colors hover:bg-charcoal/5 disabled:opacity-50"
          >
            Refresh prices (use defaults)
          </button>
          {refreshMsg && (
            <span className="font-body text-xs text-charcoal/60">{refreshMsg}</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Account Settings ─── */

function AccountSection() {
  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // Profile save
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Email change
  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setEmail(user.email || '')
        setPhone(user.user_metadata?.phone || '')
        setFullName(user.user_metadata?.full_name || '')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSaveProfile() {
    setSavingProfile(true)
    setProfileMsg(null)
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName, phone },
    })
    // Also update the profiles table
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({
        full_name: fullName,
        phone: phone || null,
      }).eq('id', user.id)
    }
    setSavingProfile(false)
    if (error) {
      setProfileMsg({ type: 'error', text: error.message })
    } else {
      setProfileMsg({ type: 'success', text: 'Profile updated.' })
      setTimeout(() => setProfileMsg(null), 3000)
    }
  }

  async function handleChangeEmail() {
    if (!newEmail.trim()) return
    setSavingEmail(true)
    setEmailMsg(null)
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    setSavingEmail(false)
    if (error) {
      setEmailMsg({ type: 'error', text: error.message })
    } else {
      setEmailMsg({ type: 'success', text: 'Verification email sent to your new address. Check your inbox to confirm the change.' })
      setNewEmail('')
    }
  }

  async function handleChangePassword() {
    if (!newPassword || !confirmPassword) return
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'Password must be at least 8 characters.' })
      return
    }
    setSavingPassword(true)
    setPasswordMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (error) {
      setPasswordMsg({ type: 'error', text: error.message })
    } else {
      setPasswordMsg({ type: 'success', text: 'Password updated successfully.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordMsg(null), 3000)
    }
  }

  if (loading) {
    return (
      <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
        <p className="font-body text-sm text-charcoal/40">Loading account...</p>
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-charcoal mb-5">
        Account
      </h2>

      {/* Profile Info */}
      <div className="space-y-4 mb-8">
        <h3 className="font-body text-sm font-semibold text-charcoal/70 uppercase tracking-wider">Profile</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>
          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">Phone (optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>
        </div>
        <div>
          <label className="block font-body text-sm font-medium text-charcoal mb-1.5">Current Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full rounded-sm border border-charcoal/10 bg-charcoal/[0.03] px-3 py-2 font-body text-sm text-charcoal/60"
          />
          <p className="mt-1 font-body text-xs text-charcoal/30">To change your email, use the section below.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
          {profileMsg && (
            <span className={`font-body text-sm ${profileMsg.type === 'success' ? 'text-teal' : 'text-coral'}`}>
              {profileMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* Change Email */}
      <div className="space-y-4 mb-8 pt-6 border-t border-charcoal/8">
        <h3 className="font-body text-sm font-semibold text-charcoal/70 uppercase tracking-wider">Change Email</h3>
        <p className="font-body text-xs text-charcoal/40">
          A verification email will be sent to your new address. The change won&apos;t take effect until you confirm it.
        </p>
        <div className="max-w-md">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="New email address"
            className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleChangeEmail}
            disabled={savingEmail || !newEmail.trim()}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {savingEmail ? 'Sending...' : 'Send Verification Email'}
          </button>
          {emailMsg && (
            <span className={`font-body text-sm ${emailMsg.type === 'success' ? 'text-teal' : 'text-coral'}`}>
              {emailMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* Change Password */}
      <div className="space-y-4 pt-6 border-t border-charcoal/8">
        <h3 className="font-body text-sm font-semibold text-charcoal/70 uppercase tracking-wider">Change Password</h3>
        <div className="max-w-md space-y-3">
          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>
          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleChangePassword}
            disabled={savingPassword || !newPassword || !confirmPassword}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
          {passwordMsg && (
            <span className={`font-body text-sm ${passwordMsg.type === 'success' ? 'text-teal' : 'text-coral'}`}>
              {passwordMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Site Settings ─── */

function SiteSettingsSection() {
  const [siteName, setSiteName] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      setSiteName(data.siteName || '')
      setSiteUrl(data.siteUrl || '')
      if (data.globalSettings?.content) {
        setSeoTitle(data.globalSettings.content.seo_title || '')
        setSeoDescription(data.globalSettings.content.seo_description || '')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seo_title: seoTitle, seo_description: seoDescription }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) {
    return (
      <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
        <p className="font-body text-sm text-charcoal/40">Loading site settings...</p>
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-charcoal mb-5">
        Site Settings
      </h2>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
              Site Name
            </label>
            <input
              type="text"
              value={siteName}
              disabled
              className="w-full rounded-sm border border-charcoal/10 bg-charcoal/[0.03] px-3 py-2 font-body text-sm text-charcoal/60"
            />
            <p className="mt-1 font-body text-xs text-charcoal/30">
              Set via NEXT_PUBLIC_SITE_NAME env var
            </p>
          </div>
          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
              Site URL
            </label>
            <input
              type="text"
              value={siteUrl}
              disabled
              className="w-full rounded-sm border border-charcoal/10 bg-charcoal/[0.03] px-3 py-2 font-body text-sm text-charcoal/60"
            />
            <p className="mt-1 font-body text-xs text-charcoal/30">
              Set via NEXT_PUBLIC_SITE_URL env var
            </p>
          </div>
        </div>

        <div>
          <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
            Default SEO Title
          </label>
          <input
            type="text"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            placeholder="Default page title for search engines"
            className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
        </div>

        <div>
          <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
            Default SEO Description
          </label>
          <textarea
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            placeholder="Default meta description for search engines"
            rows={3}
            className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal resize-y"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save SEO Settings'}
          </button>
          {saved && (
            <span className="font-body text-sm text-teal">Saved successfully.</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Integration Status ─── */

function IntegrationStatusSection() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      setIntegrations(data.integrations || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-charcoal mb-5">
        Integration Status
      </h2>
      {loading ? (
        <p className="font-body text-sm text-charcoal/40">Checking integrations...</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((int) => (
            <div
              key={int.label}
              className="flex items-center gap-3 rounded-sm border border-charcoal/10 px-4 py-3"
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  int.configured ? 'bg-teal' : 'bg-coral'
                }`}
              />
              <div className="min-w-0">
                <p className="font-body text-sm font-medium text-charcoal">
                  {int.label}
                </p>
                <p
                  className={`font-body text-xs ${
                    int.configured ? 'text-teal' : 'text-coral'
                  }`}
                >
                  {int.configured ? 'Configured' : 'Not configured'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Promo Codes ─── */

function PromoCodesSection() {
  const [codes, setCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const fetchCodes = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/promo-codes')
    const data = await res.json()
    setCodes(data.promoCodes || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy fetch-on-mount; safe
    fetchCodes()
  }, [fetchCodes])

  async function handleToggleActive(code: PromoCode) {
    await fetch('/api/admin/promo-codes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: code.id, is_active: !code.is_active }),
    })
    fetchCodes()
  }

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-xl font-semibold text-charcoal">
          Promo Codes
        </h2>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-sm bg-teal px-4 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal"
        >
          Create Code
        </button>
      </div>

      {showAdd && (
        <PromoCodeForm
          onCancel={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            fetchCodes()
          }}
        />
      )}

      {loading ? (
        <p className="py-8 text-center font-body text-sm text-charcoal/40">
          Loading promo codes...
        </p>
      ) : codes.length === 0 ? (
        <p className="py-8 text-center font-body text-sm text-charcoal/40">
          No promo codes yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-charcoal/10">
                <th className="px-3 py-2 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Code
                </th>
                <th className="px-3 py-2 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Discount
                </th>
                <th className="px-3 py-2 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Min Order
                </th>
                <th className="px-3 py-2 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Usage
                </th>
                <th className="px-3 py-2 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Valid Period
                </th>
                <th className="px-3 py-2 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Status
                </th>
                <th className="px-3 py-2 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {codes.map((code) => (
                <tr
                  key={code.id}
                  className="transition-colors hover:bg-charcoal/[0.02]"
                >
                  <td className="px-3 py-2.5">
                    <span className="font-body text-sm font-semibold text-charcoal font-mono">
                      {code.code}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-body text-sm text-charcoal/70">
                    {code.discount_type === 'percentage'
                      ? `${code.discount_value}%`
                      : `$${Number(code.discount_value).toFixed(2)}`}
                  </td>
                  <td className="px-3 py-2.5 font-body text-sm text-charcoal/60">
                    {code.min_order_amount
                      ? `$${Number(code.min_order_amount).toFixed(2)}`
                      : '--'}
                  </td>
                  <td className="px-3 py-2.5 font-body text-sm text-charcoal/60">
                    {code.usage_count}
                    {code.usage_limit ? ` / ${code.usage_limit}` : ''}
                  </td>
                  <td className="px-3 py-2.5 font-body text-xs text-charcoal/50">
                    {code.valid_from
                      ? new Date(code.valid_from).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : '--'}{' '}
                    -{' '}
                    {code.valid_until
                      ? new Date(code.valid_until).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'No end'}
                  </td>
                  <td className="px-3 py-2.5">
                    {code.is_active ? (
                      <span className="inline-flex rounded-sm bg-teal/15 px-2 py-0.5 font-body text-xs font-medium text-teal">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-sm bg-charcoal/10 px-2 py-0.5 font-body text-xs font-medium text-charcoal/50">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => handleToggleActive(code)}
                      className={`rounded-sm px-2 py-1 font-body text-xs transition-colors ${
                        code.is_active
                          ? 'bg-coral/10 text-coral hover:bg-coral/20'
                          : 'bg-teal/10 text-teal hover:bg-teal/20'
                      }`}
                    >
                      {code.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PromoCodeForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: '',
    min_order_amount: '',
    usage_limit: '',
    valid_from: '',
    valid_until: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!form.code.trim() || !form.discount_value) {
      setError('Code and discount value are required.')
      return
    }
    setError(null)
    setSaving(true)
    const res = await fetch('/api/admin/promo-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to create promo code.')
      setSaving(false)
      return
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="mb-4 space-y-3 rounded-sm border border-teal/20 bg-teal/[0.03] p-4">
      {error && (
        <p className="font-body text-sm text-coral">{error}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block font-body text-xs font-medium text-charcoal/60 mb-1">
            Code
          </label>
          <input
            type="text"
            placeholder="e.g. SUMMER20"
            value={form.code}
            onChange={(e) =>
              setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
            }
            className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm font-mono text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <label className="block font-body text-xs font-medium text-charcoal/60 mb-1">
            Discount Type
          </label>
          <select
            value={form.discount_type}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                discount_type: e.target.value as 'percentage' | 'fixed',
              }))
            }
            className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
          >
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed ($)</option>
          </select>
        </div>
        <div>
          <label className="block font-body text-xs font-medium text-charcoal/60 mb-1">
            Discount Value
          </label>
          <input
            type="number"
            placeholder={form.discount_type === 'percentage' ? '20' : '10.00'}
            value={form.discount_value}
            onChange={(e) =>
              setForm((f) => ({ ...f, discount_value: e.target.value }))
            }
            step="0.01"
            min="0"
            className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="block font-body text-xs font-medium text-charcoal/60 mb-1">
            Min Order Amount
          </label>
          <input
            type="number"
            placeholder="0.00"
            value={form.min_order_amount}
            onChange={(e) =>
              setForm((f) => ({ ...f, min_order_amount: e.target.value }))
            }
            step="0.01"
            min="0"
            className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <label className="block font-body text-xs font-medium text-charcoal/60 mb-1">
            Usage Limit
          </label>
          <input
            type="number"
            placeholder="Unlimited"
            value={form.usage_limit}
            onChange={(e) =>
              setForm((f) => ({ ...f, usage_limit: e.target.value }))
            }
            min="0"
            className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <label className="block font-body text-xs font-medium text-charcoal/60 mb-1">
            Valid From
          </label>
          <input
            type="date"
            value={form.valid_from}
            onChange={(e) =>
              setForm((f) => ({ ...f, valid_from: e.target.value }))
            }
            className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <label className="block font-body text-xs font-medium text-charcoal/60 mb-1">
            Valid Until
          </label>
          <input
            type="date"
            value={form.valid_until}
            onChange={(e) =>
              setForm((f) => ({ ...f, valid_until: e.target.value }))
            }
            className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-sm bg-teal px-4 py-1.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Promo Code'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-sm px-4 py-1.5 font-body text-sm text-charcoal/50 transition-colors hover:text-charcoal"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/* ─── Danger Zone ─── */

function DangerZoneSection() {
  const [clearingCarts, setClearingCarts] = useState(false)
  const [cartsCleared, setCartsCleared] = useState(false)
  const [revalidating, setRevalidating] = useState(false)

  async function handleClearCarts() {
    if (
      !confirm(
        'Are you sure you want to clear ALL active carts? This cannot be undone.'
      )
    ) {
      return
    }

    setClearingCarts(true)
    // Placeholder: would call an API to clear carts
    await new Promise((r) => setTimeout(r, 1000))
    setClearingCarts(false)
    setCartsCleared(true)
    setTimeout(() => setCartsCleared(false), 3000)
  }

  function handleRevalidateCache() {
    setRevalidating(true)
    // Placeholder: would call revalidation API
    setTimeout(() => setRevalidating(false), 1500)
  }

  return (
    <div className="rounded-sm border border-coral/30 bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-coral mb-2">
        Danger Zone
      </h2>
      <p className="font-body text-sm text-charcoal/50 mb-5">
        These actions are destructive and cannot be easily reversed.
      </p>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-sm border border-charcoal/10 p-4">
          <div>
            <p className="font-body text-sm font-medium text-charcoal">
              Clear All Carts
            </p>
            <p className="font-body text-xs text-charcoal/50">
              Removes all active shopping carts from the database.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearCarts}
              disabled={clearingCarts}
              className="shrink-0 rounded-sm border border-coral/30 bg-coral/10 px-4 py-2 font-body text-sm font-medium text-coral transition-colors hover:bg-coral/20 disabled:opacity-50"
            >
              {clearingCarts ? 'Clearing...' : 'Clear All Carts'}
            </button>
            {cartsCleared && (
              <span className="font-body text-xs text-teal">Done (placeholder).</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-sm border border-charcoal/10 p-4">
          <div>
            <p className="font-body text-sm font-medium text-charcoal">
              Revalidate Cache
            </p>
            <p className="font-body text-xs text-charcoal/50">
              Force revalidate all cached pages and data.
            </p>
          </div>
          <button
            onClick={handleRevalidateCache}
            disabled={revalidating}
            className="shrink-0 rounded-sm border border-charcoal/15 bg-charcoal/5 px-4 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/10 disabled:opacity-50"
          >
            {revalidating ? 'Revalidating...' : 'Revalidate Cache'}
          </button>
        </div>
      </div>
    </div>
  )
}
