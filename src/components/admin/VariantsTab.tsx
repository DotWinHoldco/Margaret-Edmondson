'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { MEDIUMS, mediumLabel, sizeDimensions, orientationForSize, type Medium, type Orientation } from '@/lib/pricing/mediums'
import { costPlusMarginCents, customerPriceCents } from '@/lib/pricing/variant-pricing'

export interface MediumCatalogEntry {
  medium: Medium
  name: string | null
  subcategory_id: number | null
  option_ids: number[]
  sizes: Array<{ size_label: string; width: number; height: number; cost_cents?: number }>
  enabled: boolean
  last_synced_at: string | null
}

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
  mediumCatalog: MediumCatalogEntry[]
  /** Shape of the product's master artwork (from width_px/height_px). When set,
   *  the "Add sizes" picker defaults to the matching size set. */
  artworkOrientation?: Orientation | null
}

const ORIENTATION_LABEL: Record<Orientation, string> = {
  square: 'square',
  portrait: 'portrait',
  landscape: 'landscape',
}

function fmtCents(c: number | null | undefined): string {
  if (c == null) return '—'
  return `$${(c / 100).toFixed(2)}`
}

export default function VariantsTab({ productId, productDefaultMargin, variants: initial, mediumCatalog, artworkOrientation = null }: Props) {
  const router = useRouter()
  const catalogByMedium = useMemo(() => {
    const out: Record<string, MediumCatalogEntry> = {}
    for (const c of mediumCatalog) out[c.medium] = c
    return out
  }, [mediumCatalog])
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
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

  // One-click: create the artwork-matched size set for every configured medium
  // (priced live through Lumaprints by bulk-create) and deactivate the existing
  // variants that are a different shape. Non-destructive — off-shape variants are
  // deactivated (hidden from the public page), never deleted.
  const [confirmFix, setConfirmFix] = useState(false)
  const [fixStatus, setFixStatus] = useState<string | null>(null)
  const fixToShape = () => {
    if (!artworkOrientation) return
    setConfirmFix(false)
    startTransition(async () => {
      setFixStatus('Generating sizes through Lumaprints…')
      let created = 0
      for (const m of MEDIUMS) {
        const cfg = catalogByMedium[m]
        if (!cfg || !cfg.subcategory_id || cfg.sizes.length === 0) continue
        const existing = new Set(variants.filter((v) => v.medium === m).map((v) => v.size_label || ''))
        const toCreate = cfg.sizes
          .filter((s) => orientationForSize(s.size_label) === artworkOrientation && !existing.has(s.size_label))
          .map((s) => s.size_label)
        if (toCreate.length === 0) continue
        const res = await fetch('/api/admin/variants/bulk-create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ product_id: productId, medium: m, size_labels: toCreate }),
        })
        if (res.ok) created += toCreate.length
      }
      const mismatched = variants.filter(
        (v) => v.size_label && orientationForSize(v.size_label) !== artworkOrientation && v.is_active,
      )
      for (const v of mismatched) {
        await fetch(`/api/admin/variants/${v.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        })
      }
      setFixStatus(
        `Created ${created} ${artworkOrientation} variant${created === 1 ? '' : 's'}; deactivated ${mismatched.length} off-shape variant${mismatched.length === 1 ? '' : 's'}.`,
      )
      router.refresh()
    })
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
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-body text-xs text-charcoal/50">
            Default margin <strong className="text-charcoal/80">{defaultMargin}%</strong>
            <span className="ml-1 text-charcoal/40">(set in Pricing above)</span>
          </span>
          <button
            type="button"
            disabled={syncStatus === 'syncing'}
            onClick={async () => {
              setSyncStatus('syncing')
              setSyncMsg(null)
              const res = await fetch('/api/admin/lumaprints/sync', { method: 'POST' })
              if (res.ok) {
                const body = await res.json()
                const matched = (body.data?.summary || []).filter((s: { status: string }) => s.status === 'matched').length
                setSyncMsg(`Synced ${matched}/${(body.data?.summary || []).length} mediums.`)
                setSyncStatus('done')
                router.refresh()
              } else {
                setSyncMsg('Sync failed — check Lumaprints credentials.')
                setSyncStatus('error')
              }
            }}
            className="rounded-md border border-charcoal/20 px-3 py-1.5 font-body text-xs font-medium text-charcoal hover:bg-charcoal hover:text-cream transition-colors disabled:opacity-50"
          >
            {syncStatus === 'syncing' ? 'Syncing catalog…' : 'Sync Lumaprints'}
          </button>
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
      {syncMsg && (
        <div className={`mb-4 rounded-md border px-3 py-2 font-body text-xs ${syncStatus === 'error' ? 'bg-coral/10 border-coral/30 text-coral' : 'bg-teal/10 border-teal/30 text-deep-teal'}`}>
          {syncMsg}
        </div>
      )}

      {lastDiff && (
        <div className="mb-4 rounded-md bg-teal/10 border border-teal/30 px-3 py-2 font-body text-xs text-deep-teal">
          {lastDiff}
        </div>
      )}

      {artworkOrientation && (() => {
        const mismatched = variants.some(
          (v) => v.size_label && orientationForSize(v.size_label) !== artworkOrientation,
        )
        return (
          <div className={`mb-4 rounded-md border px-3 py-2.5 font-body text-xs ${mismatched ? 'bg-gold/10 border-gold/40 text-charcoal' : 'bg-charcoal/[0.03] border-charcoal/10 text-charcoal/60'}`}>
            <div className="flex items-start justify-between gap-3">
              <p>
                This is a <strong>{ORIENTATION_LABEL[artworkOrientation]}</strong> artwork — “Add sizes” defaults to the {ORIENTATION_LABEL[artworkOrientation]} set.
                {mismatched && (
                  <> Some current variants are a different shape and will crop the image.</>
                )}
              </p>
              {mismatched && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmFix(true)}
                  className="shrink-0 rounded-md bg-charcoal px-3 py-1.5 font-body text-[11px] font-medium text-cream hover:bg-charcoal/90 disabled:opacity-50"
                >
                  {pending ? 'Working…' : `Fix to ${ORIENTATION_LABEL[artworkOrientation]}`}
                </button>
              )}
            </div>
            {fixStatus && <p className="mt-2 font-medium text-deep-teal">{fixStatus}</p>}
          </div>
        )
      })()}

      {MEDIUMS.map((m) => {
        const cfg = catalogByMedium[m]
        const rows = grouped[m] || []
        const configured = Boolean(cfg && cfg.subcategory_id && cfg.sizes.length > 0)
        if (!configured && rows.length === 0) return null
        return (
          <div key={m} className="mb-6 last:mb-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-base font-medium text-charcoal">
                {cfg?.name || mediumLabel(m)}
                <span className="ml-2 font-body text-xs text-charcoal/40">({rows.length} variants)</span>
                {!configured && (
                  <span className="ml-2 inline-block rounded-full bg-coral/10 px-2 py-0.5 font-body text-[10px] text-coral">
                    Needs sync
                  </span>
                )}
              </h3>
              {configured && (
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
                      <th className="px-3 py-2 font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/60">Total with shipping</th>
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

      {showAdd && catalogByMedium[showAdd] && (
        <AddVariantModal
          productId={productId}
          medium={showAdd}
          mediumName={catalogByMedium[showAdd].name || mediumLabel(showAdd)}
          availableSizes={catalogByMedium[showAdd].sizes}
          defaultMargin={defaultMargin}
          orientation={artworkOrientation}
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

      <ConfirmDialog
        open={confirmFix}
        title={`Generate ${artworkOrientation ?? ''} sizes?`}
        message={`This creates the ${artworkOrientation ?? ''} size set for each configured medium — priced live through Lumaprints — and deactivates the variants that are a different shape. Off-shape variants are not deleted; they just hide from the public page, and you can re-activate or delete them by hand.`}
        confirmText="Generate & fix"
        onConfirm={fixToShape}
        onCancel={() => setConfirmFix(false)}
      />
    </section>
  )
}

function AddVariantModal({
  productId,
  medium,
  mediumName,
  availableSizes,
  defaultMargin,
  orientation,
  existingSizes,
  onClose,
  onCreated,
}: {
  productId: string
  medium: Medium
  mediumName: string
  availableSizes: Array<{ size_label: string; width: number; height: number; cost_cents?: number }>
  defaultMargin: number
  orientation: Orientation | null
  existingSizes: Set<string>
  onClose: () => void
  onCreated: () => void
}) {
  const available = availableSizes.filter((s) => !existingSizes.has(s.size_label))
  // Split by shape so the artwork-matched sizes lead and are pre-selected.
  const recommended = orientation ? available.filter((s) => orientationForSize(s.size_label) === orientation) : []
  const others = orientation ? available.filter((s) => orientationForSize(s.size_label) !== orientation) : available
  const [selected, setSelected] = useState<Set<string>>(() => new Set(recommended.map((s) => s.size_label)))
  const [marginOverride, setMarginOverride] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [showOthers, setShowOthers] = useState(!orientation)

  const toggle = (size: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(size)) next.delete(size)
      else next.add(size)
      return next
    })
  }

  const selectRecommended = () => setSelected(new Set(recommended.map((s) => s.size_label)))
  const selectAll = () => setSelected(new Set(available.map((s) => s.size_label)))
  const clearAll = () => setSelected(new Set())

  const sizeRow = (s: { size_label: string; cost_cents?: number }) => (
    <label key={s.size_label} className="flex items-center gap-2 font-body text-sm text-charcoal/80 cursor-pointer">
      <span className="ml-auto font-body text-[10px] text-charcoal/40 order-2">
        {s.cost_cents ? `$${(s.cost_cents / 100).toFixed(2)}` : ''}
      </span>
      <input type="checkbox" checked={selected.has(s.size_label)} onChange={() => toggle(s.size_label)} />
      {s.size_label}
    </label>
  )

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
          <h2 className="font-display text-xl font-light text-charcoal">Add {mediumName} variants</h2>
          <p className="mt-1 font-body text-xs text-charcoal/60">
            One variant per size. Prices pull from the live Lumaprints API + your margin.
          </p>

          <div className="flex justify-between items-center mt-5 mb-2">
            <span className="font-body text-xs uppercase tracking-wider text-charcoal/60">Sizes</span>
            <div className="flex gap-3">
              {recommended.length > 0 && (
                <button type="button" onClick={selectRecommended} className="font-body text-xs font-semibold uppercase tracking-wider text-teal hover:text-deep-teal">
                  Select recommended
                </button>
              )}
              <button type="button" onClick={selectAll} className="font-body text-xs uppercase tracking-wider text-charcoal/60 hover:text-charcoal">
                Select all
              </button>
              <button type="button" onClick={clearAll} className="font-body text-xs uppercase tracking-wider text-charcoal/60 hover:text-charcoal">
                Clear
              </button>
            </div>
          </div>

          {available.length === 0 && (
            <p className="font-body text-sm text-charcoal/50">No remaining sizes — all are already on this product.</p>
          )}

          {recommended.length > 0 && (
            <div className="mb-3">
              <p className="font-body text-[11px] uppercase tracking-wider text-deep-teal mb-1">
                Recommended — {orientation} ({recommended.length})
              </p>
              <div className="grid grid-cols-2 gap-1">{recommended.map(sizeRow)}</div>
            </div>
          )}

          {others.length > 0 && (
            <div>
              {recommended.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowOthers((v) => !v)}
                  className="font-body text-[11px] uppercase tracking-wider text-charcoal/50 hover:text-charcoal mb-1"
                >
                  {showOthers ? '− Hide' : '+ Show'} other shapes ({others.length})
                </button>
              )}
              {showOthers && <div className="grid grid-cols-2 gap-1">{others.map(sizeRow)}</div>}
            </div>
          )}

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
