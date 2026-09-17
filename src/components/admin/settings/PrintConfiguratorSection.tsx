'use client'

// Authored by DotWin
// Settings card: the storefront print configurator on/off switch, and how ready the
// prices behind it are. Same shape as the Site access card so the two launch switches
// read the same way. While it is off, product pages show today's size list and everything
// switched on in Print Catalog is staged; on, shoppers get print types, frames, mats,
// papers, a live price and a preview.
//
// The readiness line exists because of 2026-09-17: the door was opened on a cold price
// cache and the first shopper saw "Our print partner is busy" within a minute. A warmer
// now prices every offered size on a schedule; this card shows how far it has got, lets
// the owner start a pass now, and says so in the switch-on confirmation while sizes are
// still unpriced.

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

interface DoorData {
  enabled: boolean
  updatedAt: string | null
}

interface WarmCoverage {
  surface: number
  fresh: number
  stale: number
  missing: number
  expiringSoon: number
  lastWarmedAt: string | null
}

const ROUTE = '/api/admin/settings/print-configurator'
const WARM_ROUTE = '/api/admin/catalog/warm'
/** While a pass runs, re-read coverage this often, for at most this many reads. */
const POLL_MS = 10_000
const POLL_LIMIT = 30

function isCoverage(value: unknown): value is WarmCoverage {
  const v = value as Partial<WarmCoverage> | null
  return !!v && typeof v.surface === 'number' && typeof v.missing === 'number'
}

function relative(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

/** The warmer prices about ten sizes per five-minute pass. */
function warmEstimate(missing: number): string {
  const minutes = Math.ceil(missing / 10) * 5
  return minutes <= 5 ? 'a few minutes' : minutes < 90 ? `about ${minutes} minutes` : `about ${Math.round(minutes / 60)} hours`
}

export default function PrintConfiguratorSection() {
  const [data, setData] = useState<DoorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState<'on' | 'off' | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [coverage, setCoverage] = useState<WarmCoverage | null>(null)
  const [warming, setWarming] = useState(false)
  const [warmMsg, setWarmMsg] = useState<string | null>(null)
  const polls = useRef(0)

  const loadCoverage = useCallback(async (): Promise<WarmCoverage | null> => {
    try {
      const res = await fetch(WARM_ROUTE)
      const json = await res.json().catch(() => null)
      if (res.ok && isCoverage(json)) {
        setCoverage(json)
        return json
      }
    } catch {
      /* the line simply does not render */
    }
    return null
  }, [])

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
    void loadCoverage()
    return () => {
      cancelled = true
    }
  }, [loadCoverage])

  // While a pass runs, watch `missing` fall; stop when it reaches zero or the pass is over.
  useEffect(() => {
    if (!warming) return
    const timer = setInterval(async () => {
      polls.current += 1
      const next = await loadCoverage()
      if ((next && next.missing === 0 && next.stale === 0) || polls.current >= POLL_LIMIT) {
        setWarming(false)
        setWarmMsg(next && next.missing === 0 ? 'Every offered size is priced.' : null)
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [warming, loadCoverage])

  async function warmNow() {
    setWarmMsg(null)
    try {
      const res = await fetch(WARM_ROUTE, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWarmMsg(json?.error || 'Could not start pricing.')
        return
      }
      if (json?.started === false) {
        const seconds = Math.ceil((Number(json?.retryAfterMs) || 0) / 1000)
        setWarmMsg(seconds > 0 ? `A pricing pass is already running. Try again in ${seconds} s.` : 'A pricing pass is already running.')
        setWarming(true)
        return
      }
      polls.current = 0
      setWarming(true)
      setWarmMsg('Pricing started. This card updates as sizes are priced.')
    } catch {
      setWarmMsg('Could not start pricing.')
    }
  }

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

  const priced = coverage ? coverage.surface - coverage.missing : 0
  const allPriced = coverage !== null && coverage.missing === 0

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
              {confirming === 'on' && coverage && coverage.missing > 0 && (
                <p className="mt-2 font-body text-sm text-charcoal/80" data-testid="warm-warning">
                  {coverage.missing} of {coverage.surface} sizes have no price yet. A shopper who picks one of
                  those waits a moment while it is priced; pricing finishes on its own in{' '}
                  {warmEstimate(coverage.missing)}.
                </p>
              )}
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

          {coverage && (
            <div className="border-t border-charcoal/10 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-body text-sm text-charcoal" data-testid="warm-coverage">
                  <span className="font-semibold">Print prices:</span> ready for {priced} of {coverage.surface} sizes
                  {coverage.missing > 0 && ` · ${coverage.missing} not priced yet`}
                  {coverage.stale > 0 && ` · ${coverage.stale} older than three days`}
                  {coverage.expiringSoon > 0 && ` · ${coverage.expiringSoon} refreshing soon`}
                  <span className="text-charcoal/50"> · last priced {relative(coverage.lastWarmedAt)}</span>
                </p>
                <button
                  type="button"
                  onClick={warmNow}
                  disabled={warming || (allPriced && coverage.stale === 0 && coverage.expiringSoon === 0)}
                  className="rounded-sm border border-charcoal/15 px-3 py-1.5 font-body text-sm text-charcoal hover:bg-charcoal/5 disabled:opacity-50"
                >
                  {warming ? 'Pricing…' : 'Price sizes now'}
                </button>
              </div>
              <p className="mt-1 font-body text-xs text-charcoal/50">
                Prices are kept ready automatically every five minutes; use the button to start a pass right away.
              </p>
              {warmMsg && (
                <p className="mt-2 font-body text-sm text-deep-teal" role="status">
                  {warmMsg}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
