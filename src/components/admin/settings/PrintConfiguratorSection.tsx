'use client'

// Authored by DotWin
// Settings card: the storefront print configurator on/off switch. Same shape as the
// Site access card so the two launch switches read the same way. While it is off,
// product pages show today's size list and everything switched on in Print Catalog is
// staged; on, shoppers get print types, frames, mats, papers, a live price and a preview.

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface DoorData {
  enabled: boolean
  updatedAt: string | null
}

const ROUTE = '/api/admin/settings/print-configurator'

export default function PrintConfiguratorSection() {
  const [data, setData] = useState<DoorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState<'on' | 'off' | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(ROUTE)
        const json = await res.json()
        if (!cancelled && res.ok) setData(json)
      } catch {
        /* the card shows its own failure state */
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function flip(enabled: boolean) {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(ROUTE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ text: json?.error || 'Could not save.', ok: false })
        return
      }
      setData(json)
      setMsg({
        text: enabled
          ? 'The print configurator is on. Product pages show it on their next load.'
          : 'The print configurator is off. Product pages show the size list again on their next load.',
        ok: true,
      })
      setTimeout(() => setMsg(null), 5000)
    } catch {
      setMsg({ text: 'Could not save.', ok: false })
    } finally {
      setSaving(false)
      setConfirming(null)
    }
  }

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-charcoal">Print configurator</h2>
          <p className="mt-1 font-body text-sm text-charcoal/60">
            On, a product page lets shoppers choose a print type, frame, mat, paper and other options
            that are switched on in{' '}
            <Link href="/admin/catalog" className="underline hover:text-teal">
              Print Catalog
            </Link>
            , with a live price and a preview. Off, the page shows today&apos;s size list at the same
            prices. Changes reach shoppers on their next page load.
          </p>
        </div>
        {data && (
          <span
            className={`shrink-0 rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider ${
              data.enabled ? 'bg-teal/20 text-deep-teal' : 'bg-charcoal/10 text-charcoal/70'
            }`}
          >
            {data.enabled ? 'On' : 'Off'}
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-4 font-body text-sm text-charcoal/40">Loading…</p>
      ) : !data ? (
        <p className="mt-4 font-body text-sm text-coral">Couldn&apos;t load the print configurator setting.</p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={data.enabled}
              aria-label="Print configurator"
              onClick={() => setConfirming(data.enabled ? 'off' : 'on')}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                data.enabled ? 'bg-teal' : 'bg-charcoal/30'
              } ${saving ? 'opacity-50' : ''}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  data.enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="font-body text-sm text-charcoal">
              Print configurator {data.enabled ? 'is on' : 'is off'}
            </span>
          </div>

          {confirming && (
            <div className="rounded-sm border border-charcoal/15 bg-cream p-4">
              <p className="font-body text-sm font-semibold text-charcoal">
                {confirming === 'on' ? 'Turn the print configurator on?' : 'Turn the print configurator off?'}
              </p>
              <p className="mt-1 font-body text-sm text-charcoal/65">
                {confirming === 'on'
                  ? 'Shoppers will see every print type and option that is switched on in Print Catalog. Today’s sizes keep their prices; new options are priced live.'
                  : 'Product pages go back to the size list. Nothing in Print Catalog is lost; it stays staged for next time.'}
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => flip(confirming === 'on')}
                  disabled={saving}
                  className="rounded-sm bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Yes, do it'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  disabled={saving}
                  className="rounded-sm border border-charcoal/15 px-4 py-2 font-body text-sm text-charcoal hover:bg-charcoal/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {msg && (
            <p className={`font-body text-sm ${msg.ok ? 'text-deep-teal' : 'text-coral'}`} role="status">
              {msg.text}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
