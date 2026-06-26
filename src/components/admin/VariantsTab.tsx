'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { MEDIUMS, mediumLabel, type Medium } from '@/lib/pricing/mediums'
import { customerPriceCents } from '@/lib/pricing/variant-pricing'
import {
  aspectFromMaster,
  partnerDimension,
  validateCustomSize,
  DEFAULT_SIZE_STEP,
  type SizeTier,
} from '@/lib/pricing/size-tiers'
import { boundsForSubcategory } from '@/lib/pricing/subcategory-bounds'

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
  name: string | null
  medium: Medium | null
  size_label: string | null
  width_in: number | null
  height_in: number | null
  is_custom_size: boolean
  size_tier: SizeTier | null
  lumaprints_cost_cents: number | null
  shipping_cost_cents: number | null
  margin_override_pct: number | null
  manual_price_override_cents: number | null
  is_active: boolean
  is_lumaprints_available: boolean
  last_priced_at: string | null
}

export interface MasterPrintInfo {
  print_width_px: number | null
  print_height_px: number | null
  width_px: number | null
  height_px: number | null
  border_mode: 'full_bleed' | 'matte' | null
  print_status: string | null
}

interface Props {
  productId: string
  productDefaultMargin: number
  variants: Variant[]
  mediumCatalog: MediumCatalogEntry[]
  master: MasterPrintInfo | null
  /** Gross-margin threshold for the green/amber colouring. */
  targetGrossMarginPct?: number
  /** Opens the master crop tool (wired by the editor). */
  onEditCrop?: () => void
}

const TIER_NAME: Record<SizeTier, string> = { S: 'Small', M: 'Medium', L: 'Large' }

function fmtCents(c: number | null | undefined): string {
  if (c == null) return '—'
  return `$${(c / 100).toFixed(2)}`
}

function grossMarginPct(priceCents: number, costCents: number, shipCents: number): number {
  if (priceCents <= 0) return 0
  return ((priceCents - costCents - shipCents) / priceCents) * 100
}

export default function VariantsTab({
  productId,
  productDefaultMargin,
  variants: initial,
  mediumCatalog,
  master,
  targetGrossMarginPct = 50,
  onEditCrop,
}: Props) {
  const router = useRouter()
  const catalogByMedium = useMemo(() => {
    const out: Record<string, MediumCatalogEntry> = {}
    for (const c of mediumCatalog) out[c.medium] = c
    return out
  }, [mediumCatalog])

  const [variants, setVariants] = useState(initial)
  useEffect(() => { setVariants(initial) }, [initial])
  const defaultMargin = productDefaultMargin
  const [pending, startTransition] = useTransition()
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [lastDiff, setLastDiff] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [genMsg, setGenMsg] = useState<Record<string, string | null>>({})
  const [genBusy, setGenBusy] = useState<Medium | null>(null)
  const [customModal, setCustomModal] = useState<{ medium: Medium; prefill?: { name: string; width_in: number; height_in: number } } | null>(null)

  // Print master geometry (prefers the cropped print master, falls back to the raw scan).
  const printW = master?.print_width_px ?? master?.width_px ?? null
  const printH = master?.print_height_px ?? master?.height_px ?? null
  const hasPrintMaster = Boolean(master?.print_width_px && master?.print_height_px)
  const aspect = printW && printH ? aspectFromMaster(printW, printH) : null
  const repDpi = 200 // canvas required DPI, used for the banner's max-size readout
  const maxPrintIn = printW && printH
    ? { w: Math.floor(printW / repDpi), h: Math.floor(printH / repDpi) }
    : null

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/products/${productId}/variants`, { cache: 'no-store' })
      if (res.ok) {
        const body = await res.json()
        if (Array.isArray(body.data?.variants)) setVariants(body.data.variants as Variant[])
      }
    } catch { /* keep optimistic state */ }
    router.refresh()
  }, [productId, router])

  const grouped = useMemo(() => {
    const out: Record<string, Variant[]> = {}
    for (const v of variants) {
      const key = v.medium || 'other'
      if (!out[key]) out[key] = []
      out[key].push(v)
    }
    const area = (v: Variant) => (v.width_in || 0) * (v.height_in || 0)
    const tierRank = (v: Variant) => (v.size_tier ? { S: 0, M: 1, L: 2 }[v.size_tier] : 3)
    for (const key of Object.keys(out)) {
      out[key].sort((a, b) => {
        const ta = tierRank(a)
        const tb = tierRank(b)
        if (ta !== tb) return ta - tb
        return area(a) - area(b)
      })
    }
    return out
  }, [variants])

  const updateVariantField = (id: string, patch: Partial<Variant>) =>
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  const debouncedSave = useDebouncedSave()

  const onMarginChange = (id: string, value: number | null) => {
    updateVariantField(id, { margin_override_pct: value })
    debouncedSave(id, { margin_override_pct: value })
  }
  const onActiveChange = (id: string, value: boolean) => {
    updateVariantField(id, { is_active: value })
    debouncedSave(id, { is_active: value })
  }
  const onNameChange = (id: string, value: string) => {
    updateVariantField(id, { name: value })
    if (value.trim()) debouncedSave(id, { name: value.trim() })
  }
  const onManualOverride = (id: string, cur: number | null) => {
    const next = window.prompt(
      'Manual price override (USD). Refreshes will not change this until cleared. Blank to clear.',
      cur != null ? (cur / 100).toFixed(2) : '',
    )
    if (next === null) return
    const t = next.trim()
    if (t === '') {
      updateVariantField(id, { manual_price_override_cents: null })
      debouncedSave(id, { manual_price_override_cents: null })
      return
    }
    const cents = Math.round(Number(t) * 100)
    if (!Number.isFinite(cents) || cents < 0) return
    updateVariantField(id, { manual_price_override_cents: cents })
    debouncedSave(id, { manual_price_override_cents: cents })
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
        setLastDiff(
          changes.length === 0
            ? `${diffs.length} variant${diffs.length === 1 ? '' : 's'} refreshed — no price changes`
            : `${changes.length} updated — ${changes.slice(0, 3).map((d) => `${d.medium} ${d.size_label}: ${fmtCents(d.cost_before)} → ${fmtCents(d.cost_after)}`).join(', ')}${changes.length > 3 ? `, +${changes.length - 3} more` : ''}`,
        )
        setRefreshStatus('done')
        await reload()
      } else {
        setRefreshStatus('error')
      }
    })
  }

  const generateDefaults = (medium: Medium) => {
    setGenBusy(medium)
    setGenMsg((m) => ({ ...m, [medium]: null }))
    startTransition(async () => {
      const res = await fetch(`/api/admin/products/${productId}/variants/generate-defaults`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ medium }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        const created = body.data?.created?.length ?? 0
        const dropped: SizeTier[] = body.data?.droppedTiers ?? []
        const droppedMsg = dropped.length
          ? ` ${dropped.map((t) => TIER_NAME[t]).join(' & ')} skipped — exceeds master resolution.`
          : ''
        setGenMsg((m) => ({ ...m, [medium]: `Created ${created} draft size${created === 1 ? '' : 's'}.${droppedMsg}` }))
        await reload()
      } else {
        setGenMsg((m) => ({ ...m, [medium]: body.error || 'Could not generate sizes.' }))
      }
      setGenBusy(null)
    })
  }

  const deleteVariant = async (id: string) => {
    await fetch(`/api/admin/variants/${id}`, { method: 'DELETE' })
    setVariants((prev) => prev.filter((v) => v.id !== id))
    setConfirmDelete(null)
    await reload()
  }

  // Configured mediums = those Lumaprints has priced (subcategory + sizes).
  const sizeActionsDisabled = !printW || !printH

  return (
    <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-charcoal">Print sizes</h2>
          <p className="mt-1 font-body text-xs text-charcoal/50">
            Customer price = (Lumaprints cost + shipping) × (1 + margin / 100). Drafts aren&apos;t shown on the site until flipped Live.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-body text-xs text-charcoal/50">
            Default margin <strong className="text-charcoal/80">{defaultMargin}%</strong>
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

      {/* Master banner */}
      <div className={`mb-5 rounded-md border px-4 py-3 ${hasPrintMaster || (printW && printH) ? 'border-charcoal/10 bg-charcoal/[0.03]' : 'border-amber-300 bg-amber-50'}`}>
        {printW && printH && aspect && maxPrintIn ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-body text-xs text-charcoal/80">
              {hasPrintMaster ? 'Print master' : 'Master (uncropped)'}: <strong>{printW}×{printH}px</strong>
              {' · '}aspect <strong>{aspect.ratio.toFixed(3)}</strong> ({aspect.orientation})
              {' · '}max at {repDpi} DPI: <strong>{maxPrintIn.w}×{maxPrintIn.h} in</strong>
              {' · '}border: {master?.border_mode === 'matte' ? 'Matte' : 'Full bleed'}
              {master?.print_status && master.print_status !== 'none' ? ` · ${master.print_status}` : ''}
            </p>
            {onEditCrop && (
              <button type="button" onClick={onEditCrop} className="shrink-0 rounded-md border border-charcoal/20 px-3 py-1.5 font-body text-[11px] font-medium text-charcoal hover:bg-charcoal hover:text-cream transition-colors">
                {hasPrintMaster ? 'Edit crop' : 'Crop master'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-body text-xs text-amber-800">
              No print-ready master yet — crop the master / set the print area before generating print sizes.
            </p>
            {onEditCrop && (
              <button type="button" onClick={onEditCrop} className="shrink-0 rounded-md border border-amber-400 px-3 py-1.5 font-body text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors">
                Crop master
              </button>
            )}
          </div>
        )}
      </div>

      {lastDiff && (
        <div className="mb-4 rounded-md bg-teal/10 border border-teal/30 px-3 py-2 font-body text-xs text-deep-teal">{lastDiff}</div>
      )}

      {MEDIUMS.map((m) => {
        const cfg = catalogByMedium[m]
        const rows = grouped[m] || []
        const configured = Boolean(cfg && cfg.enabled && cfg.subcategory_id)
        if (!configured && rows.length === 0) return null
        const hasDefaults = rows.some((r) => !r.is_custom_size)
        return (
          <div key={m} className="mb-6 last:mb-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="font-display text-base font-medium text-charcoal">
                {cfg?.name || mediumLabel(m)}
                <span className="ml-2 font-body text-xs text-charcoal/40">({rows.length})</span>
                {!configured && (
                  <span className="ml-2 inline-block rounded-full bg-charcoal/10 px-2 py-0.5 font-body text-[10px] text-charcoal/50">Run Lumaprints sync to enable</span>
                )}
              </h3>
              {configured && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={sizeActionsDisabled || genBusy === m}
                    onClick={() => generateDefaults(m)}
                    title={sizeActionsDisabled ? 'Crop the master first' : ''}
                    className={`rounded-md px-3 py-1.5 font-body text-[11px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-40 ${
                      hasDefaults ? 'border border-charcoal/20 text-charcoal hover:bg-charcoal hover:text-cream' : 'bg-teal text-cream hover:bg-deep-teal'
                    }`}
                  >
                    {genBusy === m ? 'Generating…' : 'Generate S/M/L'}
                  </button>
                  <button
                    type="button"
                    disabled={sizeActionsDisabled}
                    onClick={() => setCustomModal({ medium: m })}
                    title={sizeActionsDisabled ? 'Crop the master first' : ''}
                    className="font-body text-xs font-semibold uppercase tracking-wider text-teal hover:text-deep-teal transition-colors disabled:opacity-40"
                  >
                    + Add custom size
                  </button>
                </div>
              )}
            </div>

            {genMsg[m] && <p className="mb-2 font-body text-[11px] text-deep-teal">{genMsg[m]}</p>}

            {rows.length > 0 && (
              <div className="rounded-md border border-charcoal/10 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-charcoal/[0.03]">
                    <tr>
                      {['Live', 'Label', 'Size', 'Cost', 'Margin %', 'Price', 'Gross', ''].map((h, i) => (
                        <th key={i} className="px-3 py-2 font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/60">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-charcoal/5">
                    {rows.map((v) => {
                      const cost = v.lumaprints_cost_cents ?? 0
                      const ship = v.shipping_cost_cents ?? 0
                      const price = customerPriceCents(
                        { lumaprints_cost_cents: cost, shipping_cost_cents: ship, margin_override_pct: v.margin_override_pct, manual_price_override_cents: v.manual_price_override_cents },
                        defaultMargin,
                      )
                      const hasManual = v.manual_price_override_cents != null
                      const gm = grossMarginPct(price, cost, ship)
                      const gmColor = gm <= 0 ? 'text-coral' : gm < targetGrossMarginPct ? 'text-amber-600' : 'text-teal'
                      return (
                        <tr key={v.id} className={!v.is_active ? 'bg-charcoal/[0.015]' : ''}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={v.is_active} onChange={(e) => onActiveChange(v.id, e.target.checked)} title={v.is_active ? 'Live on the site' : 'Draft — not shown on the site'} />
                          </td>
                          <td className="px-3 py-2 font-body text-sm text-charcoal">
                            {v.is_custom_size ? (
                              <input
                                type="text"
                                defaultValue={v.name ?? ''}
                                onBlur={(e) => { if (e.target.value.trim() && e.target.value !== v.name) onNameChange(v.id, e.target.value) }}
                                className="w-36 rounded border border-charcoal/15 px-2 py-1 font-body text-sm"
                              />
                            ) : (
                              <span className="text-charcoal/80">{v.name || (v.size_tier ? TIER_NAME[v.size_tier] : '')}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-body text-sm text-charcoal/70 whitespace-nowrap">
                            {v.width_in != null && v.height_in != null ? `${v.width_in} × ${v.height_in} in` : v.size_label}
                            <span className="ml-1.5 inline-block rounded-full bg-charcoal/8 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-charcoal/55">{v.size_tier || 'Custom'}</span>
                          </td>
                          <td className="px-3 py-2 font-body text-sm text-charcoal/70 whitespace-nowrap" title={`base ${fmtCents(cost)} + shipping ${fmtCents(ship)}`}>
                            {cost + ship > 0 ? fmtCents(cost + ship) : <span className="text-amber-600">Set cost</span>}
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
                          <td className="px-3 py-2 font-body text-sm font-medium text-charcoal whitespace-nowrap">
                            {fmtCents(price)}
                            <button type="button" onClick={() => onManualOverride(v.id, v.manual_price_override_cents)} className="ml-1.5 text-charcoal/40 hover:text-charcoal" title="Manual price override">✎</button>
                            {hasManual && <span className="ml-0.5 text-gold" title="Manual override">★</span>}
                          </td>
                          <td className={`px-3 py-2 font-body text-sm font-medium ${gmColor}`}>{Math.round(gm)}%</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setCustomModal({ medium: m, prefill: { name: `${v.name || v.size_label || 'Size'} copy`, width_in: v.width_in ?? 0, height_in: v.height_in ?? 0 } })}
                              className="font-body text-[10px] uppercase tracking-wider text-charcoal/60 hover:text-charcoal mr-2"
                            >
                              Duplicate
                            </button>
                            <button type="button" onClick={() => setConfirmDelete(v.id)} className="font-body text-[10px] uppercase tracking-wider text-coral hover:text-coral/80">Delete</button>
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

      {customModal && catalogByMedium[customModal.medium] && printW && printH && (
        <CustomSizeModal
          productId={productId}
          medium={customModal.medium}
          mediumName={catalogByMedium[customModal.medium].name || mediumLabel(customModal.medium)}
          subcategoryId={catalogByMedium[customModal.medium].subcategory_id}
          printW={printW}
          printH={printH}
          defaultMargin={defaultMargin}
          targetGrossMarginPct={targetGrossMarginPct}
          prefill={customModal.prefill}
          onClose={() => setCustomModal(null)}
          onCreated={() => { setCustomModal(null); reload() }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this size?"
        message="The variant will be permanently removed. Public pages stop showing it immediately."
        variant="danger"
        confirmText="Delete"
        onConfirm={() => confirmDelete && deleteVariant(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Custom-size creator (aspect-locked height/width + live validation + price)
// ---------------------------------------------------------------------------
function CustomSizeModal({
  productId,
  medium,
  mediumName,
  subcategoryId,
  printW,
  printH,
  defaultMargin,
  targetGrossMarginPct,
  prefill,
  onClose,
  onCreated,
}: {
  productId: string
  medium: Medium
  mediumName: string
  subcategoryId: number | null
  printW: number
  printH: number
  defaultMargin: number
  targetGrossMarginPct: number
  prefill?: { name: string; width_in: number; height_in: number }
  onClose: () => void
  onCreated: () => void
}) {
  const bounds = boundsForSubcategory(subcategoryId)
  const dpi = bounds.requiredDPI
  const { ratio, orientation } = aspectFromMaster(printW, printH)
  const maxW = Math.floor(printW / dpi)
  const maxH = Math.floor(printH / dpi)

  // Seed: prefill, else a Medium-ish default (long edge 20").
  const seed = useMemo(() => {
    if (prefill && prefill.width_in > 0 && prefill.height_in > 0) {
      return { w: prefill.width_in, h: prefill.height_in }
    }
    if (orientation === 'portrait') {
      const h = Math.min(20, maxH)
      return { w: partnerDimension(h, 'height', ratio), h }
    }
    const w = Math.min(20, maxW)
    return { w, h: partnerDimension(w, 'width', ratio) }
  }, [prefill, orientation, ratio, maxW, maxH])

  const [name, setName] = useState(prefill?.name ?? '')
  const [widthIn, setWidthIn] = useState<number>(seed.w)
  const [heightIn, setHeightIn] = useState<number>(seed.h)
  const [marginPct, setMarginPct] = useState<string>('')
  const [manualOverride, setManualOverride] = useState<string>('')
  const [useManual, setUseManual] = useState(false)
  const [preview, setPreview] = useState<{ cost_cents?: number; shipping_cents?: number; price_cents?: number; gross_margin_pct?: number; error?: string } | null>(null)
  const [loadingPrice, setLoadingPrice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Aspect-locked auto-fill — editing one dimension drives the other.
  const setHeight = (h: number) => { setHeightIn(h); setWidthIn(partnerDimension(h, 'height', ratio)) }
  const setWidth = (w: number) => { setWidthIn(w); setHeightIn(partnerDimension(w, 'width', ratio)) }

  const check = validateCustomSize({ widthIn, heightIn }, { ratio, bounds, printPx: { width: printW, height: printH }, dpi })

  // Debounced price preview after a size change.
  useEffect(() => {
    if (!check.boundsOk || !check.resolutionOk) { setPreview(null); return }
    let cancelled = false
    setLoadingPrice(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/products/${productId}/variants/price-preview`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ medium, width_in: widthIn, height_in: heightIn }),
        })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && body.data) {
          setPreview({
            cost_cents: body.data.cost_cents,
            shipping_cents: body.data.shipping_cents,
            price_cents: body.data.price_cents,
            gross_margin_pct: body.data.gross_margin_pct,
            error: body.data.error,
          })
        } else {
          setPreview({ error: body.error || 'Price unavailable' })
        }
      } catch {
        if (!cancelled) setPreview({ error: 'Price unavailable' })
      } finally {
        if (!cancelled) setLoadingPrice(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [productId, medium, widthIn, heightIn, check.boundsOk, check.resolutionOk])

  // Customer price recomputed locally when margin changes (over the landed cost).
  const landed = (preview?.cost_cents ?? 0) + (preview?.shipping_cents ?? 0)
  const effMargin = marginPct === '' ? defaultMargin : Number(marginPct)
  const computedPrice = useManual && manualOverride !== ''
    ? Math.round(Number(manualOverride) * 100)
    : Math.round(landed * (1 + (Number.isFinite(effMargin) ? effMargin : defaultMargin) / 100))
  const gm = grossMarginPct(computedPrice, preview?.cost_cents ?? 0, preview?.shipping_cents ?? 0)
  const gmColor = gm <= 0 ? 'text-coral' : gm < targetGrossMarginPct ? 'text-amber-600' : 'text-teal'

  const blocked = !check.ok || loadingPrice
  const blockingReason = !check.boundsOk
    ? check.reasons.find((r) => /exceeds|below/.test(r))
    : !check.resolutionOk
      ? check.reasons.find((r) => /Too large/.test(r))
      : !check.aspectOk
        ? check.reasons.find((r) => /shape/.test(r))
        : null

  async function save(publish: boolean) {
    if (!name.trim()) { setError('Give the size a name.'); return }
    if (!check.ok) { setError(blockingReason || 'Fix the size before saving.'); return }
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/admin/products/${productId}/variants/custom`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        medium,
        name: name.trim(),
        width_in: widthIn,
        height_in: heightIn,
        margin_override_pct: marginPct === '' ? null : Number(marginPct),
        manual_price_override_cents: useManual && manualOverride !== '' ? Math.round(Number(manualOverride) * 100) : null,
        is_active: publish,
      }),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) onCreated()
    else setError(body.error || 'Could not save the size.')
  }

  const Checkline = ({ ok, text }: { ok: boolean; text: string }) => (
    <p className={`font-body text-[11px] ${ok ? 'text-teal' : 'text-coral'}`}>{ok ? '✓' : '✗'} {text}</p>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-lg bg-cream shadow-2xl">
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          <h2 className="font-display text-xl font-light text-charcoal">Add custom {mediumName} size</h2>
          <p className="mt-1 font-body text-xs text-charcoal/60">Aspect-locked to the artwork ({ratio.toFixed(3)}, {orientation}).</p>

          <label className="block mt-4">
            <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Variant name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Life Size" className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm" />
          </label>

          <div className="mt-4 flex items-end gap-2">
            <label className="block flex-1">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Height (in)</span>
              <input type="number" step={DEFAULT_SIZE_STEP} value={heightIn} onChange={(e) => setHeight(Number(e.target.value))} className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm" />
            </label>
            <span className="pb-2.5 font-mono text-[11px] text-charcoal/50">🔒 {ratio.toFixed(3)}</span>
            <label className="block flex-1">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Width (in)</span>
              <input type="number" step={DEFAULT_SIZE_STEP} value={widthIn} onChange={(e) => setWidth(Number(e.target.value))} className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm" />
            </label>
          </div>

          {/* Validation row */}
          <div className="mt-3 space-y-1 rounded-md bg-charcoal/[0.03] px-3 py-2">
            <Checkline ok={check.resolutionOk} text={check.resolutionOk ? `Master supports up to ${maxW}×${maxH} in` : `Too large — master supports up to ${maxW}×${maxH} in at ${dpi} DPI.`} />
            <Checkline ok={check.boundsOk} text={check.boundsOk ? `Within Lumaprints limits (${bounds.minW}–${bounds.maxW} × ${bounds.minH}–${bounds.maxH} in)` : check.reasons.find((r) => /exceeds|below/.test(r)) || 'Outside Lumaprints limits.'} />
            <Checkline ok={check.aspectOk} text={check.aspectOk ? `Matches the artwork (${check.aspectDeltaPct.toFixed(1)}% off)` : `${check.aspectDeltaPct.toFixed(1)}% off the artwork's shape — adjust a dimension.`} />
          </div>

          {/* Pricing panel */}
          <div className="mt-4 rounded-md border border-charcoal/10 p-3">
            {loadingPrice ? (
              <p className="font-body text-xs text-charcoal/50">Fetching Lumaprints price…</p>
            ) : preview?.error ? (
              <p className="font-body text-xs text-coral">{preview.error} — you can still Save as Draft (cost not set).</p>
            ) : preview ? (
              <div className="space-y-1 font-body text-xs text-charcoal/75">
                <div className="flex justify-between"><span>Lumaprints cost</span><span>{fmtCents(preview.cost_cents)}</span></div>
                <div className="flex justify-between"><span>Shipping (worst case)</span><span>{fmtCents(preview.shipping_cents)}</span></div>
                <div className="flex justify-between border-t border-charcoal/10 pt-1"><span>Landed cost</span><span>{fmtCents(landed)}</span></div>
              </div>
            ) : (
              <p className="font-body text-xs text-charcoal/40">Enter a valid size to price it.</p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <label className="font-body text-[11px] uppercase tracking-wider text-charcoal/60">Margin %</label>
              <input type="number" value={marginPct} disabled={useManual} onChange={(e) => setMarginPct(e.target.value)} placeholder={String(defaultMargin)} className="w-20 rounded border border-charcoal/15 px-2 py-1 font-body text-sm disabled:opacity-50" />
              <label className="ml-auto flex items-center gap-1.5 font-body text-[11px] text-charcoal/60">
                <input type="checkbox" checked={useManual} onChange={(e) => setUseManual(e.target.checked)} /> Manual price
              </label>
            </div>
            {useManual && (
              <div className="mt-2 flex items-center gap-2">
                <span className="font-body text-[11px] text-charcoal/50">$</span>
                <input type="number" step="0.01" value={manualOverride} onChange={(e) => setManualOverride(e.target.value)} className="w-28 rounded border border-charcoal/15 px-2 py-1 font-body text-sm" />
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-charcoal/10 pt-2">
              <span className="font-body text-xs text-charcoal/60">Customer price</span>
              <span className="font-display text-lg font-semibold text-charcoal">{fmtCents(computedPrice)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-body text-[11px] text-charcoal/50">Gross margin</span>
              <span className={`font-body text-xs font-medium ${gmColor}`}>{Math.round(gm)}%</span>
            </div>
          </div>

          {error && <p className="mt-3 font-body text-xs text-coral">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 bg-white/40 p-4 rounded-b-lg">
          {blocked && blockingReason && <span className="mr-auto font-body text-[11px] text-coral">{blockingReason}</span>}
          <button type="button" onClick={onClose} className="rounded-sm px-4 py-2 font-body text-sm text-charcoal/70 hover:text-charcoal">Cancel</button>
          <button type="button" disabled={saving || !check.ok} onClick={() => save(true)} className="rounded-sm border border-teal px-4 py-2 font-body text-sm font-medium text-teal hover:bg-teal/5 disabled:opacity-40">Save &amp; Publish</button>
          <button type="button" disabled={saving || (!check.boundsOk || !check.resolutionOk || !check.aspectOk)} onClick={() => save(false)} className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-40">{saving ? 'Saving…' : 'Save as Draft'}</button>
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
