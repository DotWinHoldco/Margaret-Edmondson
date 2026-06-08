'use client'

import { useState, useEffect } from 'react'

export default function SocialLinksSection() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [instagram, setInstagram] = useState('')
  const [facebook, setFacebook] = useState('')
  const [pinterest, setPinterest] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (!cancelled && data.settings) {
        const s = data.settings
        setInstagram(s.instagram_url || '')
        setFacebook(s.facebook_url || '')
        setPinterest(s.pinterest_url || '')
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
        instagram_url: instagram,
        facebook_url: facebook,
        pinterest_url: pinterest,
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
        <p className="font-body text-sm text-charcoal/40">Loading social links...</p>
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-charcoal mb-1">
        Social Links
      </h2>
      <p className="font-body text-xs text-charcoal/50 mb-5">
        Linked from the site footer and social-share metadata. Leave blank to
        hide a network.
      </p>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Instagram URL</label>
          <input
            type="url"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="https://instagram.com/artbyme"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Facebook URL</label>
          <input
            type="url"
            value={facebook}
            onChange={(e) => setFacebook(e.target.value)}
            placeholder="https://facebook.com/artbyme"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Pinterest URL</label>
          <input
            type="url"
            value={pinterest}
            onChange={(e) => setPinterest(e.target.value)}
            placeholder="https://pinterest.com/artbyme"
            className={inputCls}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Social Links'}
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
