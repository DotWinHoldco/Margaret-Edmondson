'use client'
// Authored by DotWin
// "Would this exact configuration sell, and for what?"
//
// It exists because the tree answers a different question. The tree says what is switched
// on; the engine says whether the provider will take the order and what the money is. A
// subcategory can look entirely healthy and still refuse a 40x60 because of the glass
// ceiling, or price a mat colour at nothing because its parent group is off.
//
// Collapsed by default: it is a spot check, not a dashboard, and every run is a round trip.

import { useState } from 'react'
import { apiSend, errorMessage } from '@/lib/api/client'
import type { CatalogSubcategory } from '@/lib/catalog/types'

interface CheckResult {
  available: boolean
  violations: Array<{ code: string; message: string }>
  costCents: number
  shippingCents: number
  priceCents: number
  stale: boolean
  fromCache: boolean
  outerWidthIn: number
  outerHeightIn: number
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** The per-subcategory sellable check panel. */
export default function SellableCheck({ subcategory }: { subcategory: CatalogSubcategory }) {
  const [open, setOpen] = useState(false)
  const [widthIn, setWidthIn] = useState(String(subcategory.min_width_in))
  const [heightIn, setHeightIn] = useState(String(subcategory.min_height_in))
  const [optionIds, setOptionIds] = useState<number[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const choosable = subcategory.groups.flatMap((group) =>
    group.options
      .filter((option) => option.enabled && option.blocked_reason === null)
      .map((option) => ({
        id: option.option_id,
        label: `${group.display_label || group.api_group_name}: ${option.display_label || option.api_option_name}`,
      })),
  )

  async function run() {
    setRunning(true)
    setFailure(null)
    try {
      const answer = await apiSend<CheckResult>('/api/admin/catalog/check', 'POST', {
        subcategoryRef: subcategory.id,
        widthIn: Number(widthIn),
        heightIn: Number(heightIn),
        optionIds,
      })
      setResult(answer)
    } catch (err) {
      setResult(null)
      setFailure(errorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-sm border border-charcoal/15 px-2 py-1 font-body text-xs text-charcoal/70 transition-colors hover:bg-teal/5"
      >
        Sellable check
      </button>
    )
  }

  return (
    <div className="rounded-sm border border-charcoal/15 bg-teal/5 p-3">
      <div className="flex items-center justify-between">
        <h4 className="font-body text-xs font-medium tracking-wide text-charcoal uppercase">Sellable check</h4>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-body text-[11px] text-charcoal/50 underline underline-offset-2 hover:text-charcoal"
        >
          Hide
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="font-body text-[11px] text-charcoal/60">
          Width (in)
          <input
            type="number"
            step="0.25"
            value={widthIn}
            aria-label="Check width in inches"
            onChange={(event) => setWidthIn(event.target.value)}
            className="ml-1 w-20 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
          />
        </label>
        <label className="font-body text-[11px] text-charcoal/60">
          Height (in)
          <input
            type="number"
            step="0.25"
            value={heightIn}
            aria-label="Check height in inches"
            onChange={(event) => setHeightIn(event.target.value)}
            className="ml-1 w-20 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
          />
        </label>
        <label className="font-body text-[11px] text-charcoal/60">
          Options
          <select
            multiple
            value={optionIds.map(String)}
            aria-label="Options to include in the check"
            onChange={(event) =>
              setOptionIds(Array.from(event.target.selectedOptions, (option) => Number(option.value)))
            }
            className="ml-1 h-24 min-w-56 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
          >
            {choosable.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded-sm bg-teal px-3 py-1.5 font-body text-xs text-cream transition-colors hover:bg-deep-teal disabled:opacity-40"
        >
          {running ? 'Checking…' : 'Check'}
        </button>
      </div>

      {failure ? (
        <p role="alert" className="mt-3 font-body text-xs text-coral">
          {failure}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 space-y-1 font-body text-xs text-charcoal/80">
          <p className={result.available ? 'text-teal' : 'text-coral'}>
            {result.available ? 'Available' : 'Not available'}
            {result.stale ? ' (stale price)' : ''}
            {result.fromCache ? ' (from cache)' : ''}
          </p>
          {result.violations.map((violation) => (
            <p key={`${violation.code}-${violation.message}`} className="text-coral">
              {violation.code}: {violation.message}
            </p>
          ))}
          <p>
            Cost {money(result.costCents)} {'·'} Shipping {money(result.shippingCents)} {'·'} Price{' '}
            {money(result.priceCents)}
          </p>
          <p className="text-charcoal/60">
            Outer size {result.outerWidthIn}in {'×'} {result.outerHeightIn}in
          </p>
        </div>
      ) : null}
    </div>
  )
}
