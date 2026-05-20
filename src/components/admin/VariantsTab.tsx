'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { MEDIUMS, MEDIUMS_CATALOG, mediumLabel, sizeDimensions, type Medium } from '@/lib/pricing/mediums'
import { costPlusMarginCents, customerPriceCents } from '@/lib/pricing/variant-pricing'

export interface Variant {
  id: string
  product_id: string
  medium: Medium | null
  size_label: string | null
  lumaprints_cost_cents: number | null
  shipping_cost_cents: number | null
  margin_override_pct: number | null
  manual_price_override_cents: number | null
  is_active: boolean
  is_lumaprints_available: boolean
  last_priced_at: string | null
}

interface Props {
  productId: string
  productDefaultMargin: number
  variants: Variant[]
}

function fmtCents(c: number | null | undefined): string {
  if (c == null) return '—'
  return `$${(c / 100).toFixed(2)}`
}

export default function VariantsTab({ productId, productDefaultMargin, variants: initial }: Props) {
  const router = useRouter()
  const [variants, setVariants] = useState(initial)
  // defaultMargin is owned by the parent product editor (Pricing card).
  // Reflect it here so the math always uses the canonical value.
  const defaultMargin = productDefaultMargin
  const [pending, startTransition] = useTransition()
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [lastDiff, setLastDiff] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState<Medium | null>(null)

  const grouped = useMemo(() => {
    const out: Record<string, Variant[]> = {}
    for (const v of variants) {
      const key = v.medium || 'other'
      if (!out[key]) out[key] = []
      out[key].push(v)
    }
    // Sort each medium's rows by area (width × height) ascending — smallest
    // canvas first, then framed canvas, etc. Fall back to size_label string
    // compare when dims aren't set.
    const area = (v: Variant) => {
      const dims = v.size_label ? sizeDimensions(v.size_label) : null
      return dims ? dims.width * dims.height : 0
    }
    for (const key of Object.keys(out)) {
      out[key].sort((a, b) => {
        const aa = area(a)
        const ab = area(b)
        if (aa !== ab) return aa - ab
        return (a.size_label || '').localeCompare(b.size_label || '')
      })
    }
    return out
  }, [variants])

  const updateVariantField = (id: string, patch: Partial<Variant>) => {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  }

  const debouncedSave = useDebouncedSave()

  const onMarginChange = (id: string, value: number | null) => {
    updateVariantField(id, { margin_override_pct: value })
    debouncedSave(id, { margin_override_pct: value })
  }

  const onActiveChange = (id: string, value: boolean) => {
    updateVariantField(id, { is_active: value })
    debouncedSave(id, { is_active: value })
  }

  const onManualOverrideChange = (id: string, value: number | null) => {
    updateVariantField(id, { manual_price_override_cents: value })
    debouncedSave(id, { manual_price_override_cents: value })
  }

  const refreshAll = () => {
    setRefreshStatus('running')
    startTransition(async () => {
      const res = await fetch('/api/admin/variants/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product_id: productId }),
      })
      if (res.ok) {
        const body = await res.json()
        const diffs = (body.data?.diffs || []) as Array<{ medium: Medium; size_label: string; cost_before: number; cost_after: number }>
        const changes = diffs.filter((d) => d.cost_before !== d.cost_after)
        if (changes.length === 0) {
          setLastDiff(`${diffs.length} variant${diffs.length === 1 ? '' : 's'} refreshed — no price changes`)
        } else {
          const summary = changes.slice(0, 3).map((d) => `${d.medium} ${d.size_label}: ${fmtCents(d.cost_before)} → ${fmtCents(d.cost_after)}`).join(', ')
          const extra = changes.length > 3 ? `, +${changes.length - 3} more` : ''
          setLastDiff(`${changes.length} updated — ${summary}${extra}`)
        }
        setRefreshStatus('done')
        router.refresh()
      } else {
        setRefreshStatus('error')
      }
    })
  }

  const deleteVariant = async (id: string) => {
    await fetch(`/api/admin/variants/${id}`, { method: 'DELETE' })
    setVariants((prev) => prev.filter((v) => v.id !== id))
    setConfirmDelete(null)
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-charcoal">Product variants</h2>
          <p className="mt-1 font-body text-xs text-charcoal/50">
            Three prices per row: Lumaprints cost · + margin · + shipping. Inactive variants stay in the DB but hide on the public page.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-body text-xs text-charcoal/50">
            Default margin <strong className="text-charcoal/80">{defaultMargin}%</strong>
            <span className="ml-1 text-charcoal/40">(set in Pricing above)</span>
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={refreshAll}
            className="rounded-md border border-charcoal/20 px-3 py-1.5 font-body text-xs font-medium text-charcoal hover:bg-charcoal hover:text-cream transition-colors disabled:opacity-50"
          >
            {refreshStatus === 'running' ? 'Refreshing…' : 'Refresh all prices'}
          </button>
        </div>
      </div>

      {lastDiff && (
        <div className="mb-4 rounded-md bg-teal/10 border border-teal/30 px-3 py-2 font-body text-xs text-deep-teal">
          {lastDiff}
        </div>
      )}

      {MEDIUMS.map((m) => {
        const cfg = MEDIUMS_CATALOG[m]
        const rows = grouped[m] || []
        if (!cfg.enabled && rows.length === 0) return null
        return (
          <div key={m} className="mb-6 last:mb-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-base font-medium text-charcoal">
                {mediumLabel(m)}
                <span className="ml-2 font-body text-xs text-charcoal/40">({rows.length} variants)</span>
                {!cfg.enabled && (
                  <span className="ml-2 inline-block rounded-full bg-coral/10 px-2 py-0.5 font-body text-[10px] text-coral">
                    Not yet integrated
                  </span>
                )}
              </h3>
              {cfg.enabled && (
                <button
                  type="button"
                  onClick={() => setShowAdd(m)}
                  className="font-body text-xs font-semibold uppercase tracking-wider text-teal hover:text-deep-teal transition-colors"
                >
                  + Add sizes
                </button>
              )}
            </div>

            {rows.length > 0 && (
              <div className="rounded-md border border-charcoal/10 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-charcoal/[0.03]">
                    <tr>
                      <th className="px-3 py-2 font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/60">Size</th>
                      <th className="px-3 py-2 font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/60">Lumaprints</th>
                      <th className="px-3 py-2 font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/60">+ Margin</th>
                      <th className="px-3 py-2 font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/60">+ Shipping</th>
                      <th className="px-3 py-2 font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/60">Margin %</th>
                      <th className="px-3 py-2 font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/60">Active</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-charcoal/5">
                    {rows.map((v) => {
                      const pricing = {
                        lumaprints_cost_cents: v.lumaprints_cost_cents ?? 0,
                        shipping_cost_cents: v.shipping_cost_cents ?? 0,
                        margin_override_pct: v.margin_override_pct,
                        manual_price_override_cents: v.manual_price_override_cents,
                      }
                      const plusMargin = costPlusMarginCents(pricing, defaultMargin)
                      const finalPrice = customerPriceCents(pricing, defaultMargin)
                      const hasManual = v.manual_price_override_cents != null
                      return (
                        <tr key={v.id} className={!v.is_lumaprints_available ? 'bg-coral/5' : ''}>
                          <td className="px-3 py-2 font-body text-sm text-charcoal">
                            {v.size_label}
                            {!v.is_lumaprints_available && (
                              <span className="ml-2 inline-block rounded-full bg-coral/10 px-2 py-0.5 font-body text-[10px] text-coral">No longer offered</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-body text-sm text-charcoal/70">{fmtCents(v.lumaprints_cost_cents)}</td>
                          <td className="px-3 py-2 font-body text-sm text-charcoal/70">{fmtCents(plusMargin)}</td>
                          <td className={`px-3 py-2 font-body text-sm font-medium ${hasManual ? 'text-gold' : 'text-charcoal'}`}>
                            {fmtCents(finalPrice)}
                            {hasManual && <span className="ml-1 text-[10px] uppercase tracking-wider">override</span>}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={v.margin_override_pct ?? ''}
                              placeholder={String(defaultMargin)}
                              onChange={(e) => onMarginChange(v.id, e.target.value === '' ? null : Number(e.target.value))}
                              className="w-16 rounded border border-charcoal/15 px-2 py-1 font-body text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={v.is_active}
                              onChange={(e) => onActiveChange(v.id, e.target.checked)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                const cur = v.manual_price_override_cents != null ? (v.manual_price_override_cents / 100).toFixed(2) : ''
                                const next = window.prompt(
                                  'Manual price override (USD). Future refreshes will not change this number until cleared. Leave blank to clear.',
                                  cur,
                                )
                                if (next === null) return
                                const trimmed = next.trim()
                                if (trimmed === '') return onManualOverrideChange(v.id, null)
                                const cents = Math.round(Number(trimmed) * 100)
                                if (!Number.isFinite(cents) || cents < 0) return
                                onManualOverrideChange(v.id, cents)
                              }}
                              className="font-body text-[10px] uppercase tracking-wider text-charcoal/60 hover:text-charcoal mr-2"
                            >
                              {hasManual ? 'Edit override' : 'Override'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(v.id)}
                              className="font-body text-[10px] uppercase tracking-wider text-coral hover:text-coral/80"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {showAdd && (
        <AddVariantModal
          productId={productId}
          medium={showAdd}
          defaultMargin={defaultMargin}
          existingSizes={new Set(variants.filter((v) => v.medium === showAdd).map((v) => v.size_label || ''))}
          onClose={() => setShowAdd(null)}
          onCreated={() => {
            setShowAdd(null)
            router.refresh()
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this variant?"
        message="The variant will be permanently removed. Public pages will stop showing it immediately."
        variant="danger"
        confirmText="Delete"
        onConfirm={() => confirmDelete && deleteVariant(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  )
}

function AddVariantModal({
  productId,
  medium,
  defaultMargin,
  existingSizes,
  onClose,
  onCreated,
}: {
  productId: string
  medium: Medium
  defaultMargin: number
  existingSizes: Set<string>
  onClose: () => void
  onCreated: () => void
}) {
  const cfg = MEDIUMS_CATALOG[medium]
  const available = cfg.sizes.filter((s) => !existingSizes.has(s.size_label))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [marginOverride, setMarginOverride] = useState<string>('')
  const [creating, setCreating] = useState(false)

  const toggle = (size: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(size)) next.delete(size)
      else next.add(size)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(available.map((s) => s.size_label)))
  const clearAll = () => setSelected(new Set())

  const submit = async () => {
    if (selected.size === 0) return
    setCreating(true)
    const res = await fetch('/api/admin/variants/bulk-create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        medium,
        size_labels: [...selected],
        margin_override_pct: marginOverride === '' ? null : Number(marginOverride),
      }),
    })
    setCreating(false)
    if (res.ok) onCreated()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-lg bg-cream shadow-2xl">
        <div className="p-6">
          <h2 className="font-display text-xl font-light text-charcoal">Add {mediumLabel(medium)} variants</h2>
          <p className="mt-1 font-body text-xs text-charcoal/60">
            One variant per size. Prices pull from the live Lumaprints API + your margin.
          </p>

          <div className="flex justify-between items-center mt-5 mb-2">
            <span className="font-body text-xs uppercase tracking-wider text-charcoal/60">Sizes</span>
            <div className="flex gap-3">
              <button type="button" onClick={selectAll} className="font-body text-xs font-semibold uppercase tracking-wider text-teal hover:text-deep-teal">
                Select all
              </button>
              <button type="button" onClick={clearAll} className="font-body text-xs uppercase tracking-wider text-charcoal/60 hover:text-charcoal">
                Clear
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {available.length === 0 && (
              <p className="col-span-2 font-body text-sm text-charcoal/50">No remaining sizes — all are already on this product.</p>
            )}
            {available.map((s) => (
              <label key={s.size_label} className="flex items-center gap-2 font-body text-sm text-charcoal/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(s.size_label)}
                  onChange={() => toggle(s.size_label)}
                />
                {s.size_label}
              </label>
            ))}
          </div>

          <label className="block mt-5">
            <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">
              Margin override (optional)
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={marginOverride}
                onChange={(e) => setMarginOverride(e.target.value)}
                placeholder={`${defaultMargin}`}
                className="w-24 rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
              />
              <span className="text-charcoal/40">%</span>
              <span className="text-charcoal/40 text-xs">(blank = inherit product default)</span>
            </div>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 bg-white/40 p-4 rounded-b-lg">
          <button type="button" onClick={onClose} className="rounded-sm px-4 py-2 font-body text-sm text-charcoal/70 hover:text-charcoal">
            Cancel
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || creating}
            onClick={submit}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
          >
            {creating ? 'Creating…' : `Create ${selected.size} variant${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function useDebouncedSave() {
  const [timeouts] = useState(() => new Map<string, ReturnType<typeof setTimeout>>())
  return (id: string, patch: Partial<Variant>) => {
    if (timeouts.has(id)) clearTimeout(timeouts.get(id))
    const t = setTimeout(async () => {
      await fetch(`/api/admin/variants/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
    }, 500)
    timeouts.set(id, t)
  }
}
