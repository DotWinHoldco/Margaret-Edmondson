'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { FulfillmentPolicy } from '@/lib/fulfillment/policy'

export default function FulfillmentSettings({
  compact = false,
}: {
  compact?: boolean
}) {
  const [policy, setPolicy] = useState<FulfillmentPolicy | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [inFlight, setInFlight] = useState(0)
  const router = useRouter()
  useEffect(() => {
    let live = true
    fetch('/api/admin/fulfillment-settings')
      .then((r) => r.json())
      .then((d) => {
        if (live) {
          setPolicy(d.policy || null)
          setInFlight(d.inFlight || 0)
          if (d.error) setMessage(d.error)
        }
      })
      .catch(() => {
        if (live) setMessage('Could not load order settings.')
      })
    return () => {
      live = false
    }
  }, [])
  async function save(next: FulfillmentPolicy) {
    setBusy(true)
    setMessage('')
    try {
      const r = await fetch('/api/admin/fulfillment-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not save')
      setPolicy(d.policy)
      setMessage(
        d.policy.lumaprints_enabled
          ? 'Lumaprints is on for new eligible prints.'
          : 'Lumaprints is off. New artwork orders go to your studio.',
      )
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save settings.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="rounded-xl border border-teal/20 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h2 className="font-display text-2xl text-charcoal">
            Orders &amp; fulfillment
          </h2>
          <p className="mt-1 font-body text-sm text-charcoal/70">
            {!policy
              ? 'Loading fulfillment settings…'
              : policy.lumaprints_enabled
                ? 'Lumaprints prints and ships. Originals stay with you.'
                : 'Your studio handles printing, framing, and shipping.'}
          </p>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 font-body text-sm font-medium">
          <span>Use Lumaprints</span>
          <input
            aria-label="Use Lumaprints"
            role="switch"
            type="checkbox"
            checked={policy?.lumaprints_enabled ?? false}
            disabled={!policy || busy}
            onChange={(e) =>
              policy &&
              save({ ...policy, lumaprints_enabled: e.target.checked })
            }
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-7 w-12 rounded-full bg-charcoal/25 transition-colors after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-teal peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-teal peer-focus-visible:ring-offset-2"
          />
          <span>
            {!policy ? '…' : policy.lumaprints_enabled ? 'ON' : 'OFF'}
          </span>
        </label>
      </div>
      <p className="mt-3 font-body text-xs text-charcoal/60">
        Both sets of prices stay saved. Existing orders keep their fulfillment
        method.
      </p>
      {inFlight > 0 && (
        <p className="mt-3 rounded-md bg-gold/15 p-3 font-body text-sm">
          {inFlight} provider submission{inFlight === 1 ? ' is' : 's are'} in
          progress. Turning off stops new submissions; check Orders before
          moving existing work to the studio.
        </p>
      )}
      {!compact && policy && (
        <details className="mt-4 border-t border-charcoal/10 pt-4">
          <summary className="cursor-pointer font-body text-sm font-medium text-teal">
            Studio shipping defaults &amp; production time
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="font-body text-sm">
              Default shipping
              <select
                value={policy.shipping_mode}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    shipping_mode: e.target.value as 'included' | 'flat',
                  })
                }
                className="mt-1 w-full rounded-md border border-charcoal/20 p-2"
              >
                <option value="included">Shipping included</option>
                <option value="flat">Flat fee per item</option>
              </select>
            </label>
            {policy.shipping_mode === 'flat' && (
              <label className="font-body text-sm">
                Fee per item ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={policy.shipping_fee_cents / 100}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      shipping_fee_cents: Math.round(
                        Number(e.target.value) * 100,
                      ),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-charcoal/20 p-2"
                />
              </label>
            )}
            <label className="font-body text-sm">
              Ships within (calendar days)
              <input
                type="number"
                min="0"
                max="365"
                value={policy.lead_days}
                onChange={(e) =>
                  setPolicy({ ...policy, lead_days: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-md border border-charcoal/20 p-2"
              />
            </label>
            <label className="flex items-center gap-2 font-body text-sm">
              <input
                type="checkbox"
                checked={policy.ship_akhi}
                onChange={(e) =>
                  setPolicy({ ...policy, ship_akhi: e.target.checked })
                }
                className="h-5 w-5 accent-teal"
              />
              My studio rates also cover Alaska and Hawaii
            </label>
          </div>
          <p className="mt-3 font-body text-xs text-charcoal/60">
            Products inherit these defaults. Each original or print size can
            have its own shipping fee and production time.
          </p>
          <button
            type="button"
            onClick={() => save(policy)}
            disabled={busy}
            className="mt-4 rounded-md bg-teal px-4 py-2 font-body text-sm text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save studio defaults'}
          </button>
        </details>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link
          href="/admin/orders?view=studio"
          className="font-body text-sm font-medium text-teal underline underline-offset-4"
        >
          Open my order queue
        </Link>
        {message && (
          <p role="status" className="font-body text-sm text-charcoal/80">
            {message}
          </p>
        )}
      </div>
    </section>
  )
}
