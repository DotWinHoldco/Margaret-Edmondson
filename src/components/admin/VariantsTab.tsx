'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { MEDIUMS, mediumLabel, type Medium } from '@/lib/pricing/mediums'
import { customerPriceCents, grossMarginPct } from '@/lib/pricing/variant-pricing'
import {
  aspectFromMaster,
  partnerDimension,
  validateCustomSize,
  DEFAULT_SIZE_STEP,
  type SizeBounds,
  type SizeTier,
} from '@/lib/pricing/size-tiers'
import { boundsOf } from '@/lib/pricing/subcategory-tiers'
import { boundsForSubcategory } from '@/lib/pricing/subcategory-bounds'
import { printSizeLabel } from '@/lib/pricing/print-size-label'
import MarkupMarginFields, { PricingRelationship } from '@/components/admin/MarkupMarginFields'
import type { Catalog, CatalogSubcategory } from '@/lib/catalog/types'
import { defaultSubcategoryForMedium, offerableSubcategories, sizeFits } from '@/lib/catalog/availability'

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
  /** Print types (provider subcategory ids) this size is NOT sold in; the "Sold in" chips. */
  excluded_subcategory_ids?: number[] | null
}

export interface MasterPrintInfo {
  print_width_px: number | null
  print_height_px: number | null
  width_px: number | null
  height_px: number | null
  border_mode: 'full_bleed' | 'matte' | null
  print_error?: string | null
  print_status: string | null
}

interface Props {
  productId: string
  productDefaultMargin: number
  variants: Variant[]
  mediumCatalog: MediumCatalogEntry[]
  /**
   * Every catalog subcategory row (the admin tree's `subcategories`), sellable or not.
   * It decides which mediums get a section, what each section's print types publish for
   * bounds and DPI, and which of them a given size actually fits. Empty (the catalog read
   * failed, or an older caller) falls back to the legacy medium switch so the tab keeps
   * working rather than showing nothing.
   */
  catalog?: CatalogSubcategory[]
  master: MasterPrintInfo | null
  /** Gross-margin threshold for the green/amber colouring. */
  targetGrossMarginPct?: number
  /** Opens the master crop tool (wired by the editor). */
  onEditCrop?: (aspectRatio?: number) => void
}

export const COMMON_PRINT_SIZES = ['5x7', '7x5', '8x10', '10x8', '8x8', '11x14', '14x11', '12x12', '12x16', '16x12', '16x20', '20x16', '16x16', '18x24', '24x18', '20x24', '24x20', '20x20', '24x30', '30x24'] as const

/** Keep browser sizing aligned with loadBuilderContext; pending crops have stale dimensions. */
export function builderPrintGeometry(master: MasterPrintInfo | null) {
  const hasPrintMaster = master?.print_status === 'ready' && Boolean(master?.print_width_px && master?.print_height_px)
  return { hasPrintMaster, printW: hasPrintMaster ? master!.print_width_px : master?.width_px ?? null, printH: hasPrintMaster ? master!.print_height_px : master?.height_px ?? null }
}

/**
 * Turn the pixel ratio into copy an artist can use.  The ratio is still used by
 * the sizing rules, but exposing a decimal such as "0.714" in the editor made
 * the owner think she had to understand an implementation detail.  Familiar
 * print proportions get their usual names; unusual artwork is described by its
 * orientation and a simple "wide for every tall" comparison.
 */
export function artworkShapeCopy(printW: number, printH: number): string {
  if (!(printW > 0) || !(printH > 0) || !Number.isFinite(printW) || !Number.isFinite(printH)) return 'the artwork shape'
  const ratio = printW / printH
  const known: Array<[number, string]> = [
    [1, 'square'],
    [4 / 5, 'portrait (4 × 5)'],
    [3 / 4, 'portrait (3 × 4)'],
    [5 / 7, 'portrait (5 × 7)'],
    [5 / 4, 'landscape (5 × 4)'],
    [4 / 3, 'landscape (4 × 3)'],
    [7 / 5, 'landscape (7 × 5)'],
  ]
  const match = known.find(([value]) => Math.abs(ratio / value - 1) <= 0.01)
  if (match) return match[1]
  if (ratio > 1) return `landscape (${trimIn(ratio)} wide for every 1 tall)`
  return `portrait (1 wide for every ${trimIn(1 / ratio)} tall)`
}

const TIER_NAME: Record<SizeTier, string> = { S: 'Small', M: 'Medium', L: 'Large' }

function fmtCents(c: number | null | undefined): string {
  if (c == null) return '—'
  return `$${(c / 100).toFixed(2)}`
}

/** 12 -> "12", 3.875 -> "3.875". */
function trimIn(n: number): string {
  return Number(Number(n).toFixed(4)).toString()
}

/** What the generate route reports it could not derive, per print type. */
interface DroppedTierLine {
  tier: SizeTier
  reason: string
  subcategoryLabel?: string
}

interface GenerateResult {
  text: string
  dropped: DroppedTierLine[]
}

type MasterPx = { printWidthPx: number; printHeightPx: number } | undefined

/** The print types of this medium a size can be ordered in right now. */
function fittingSubcategories(
  subcategories: CatalogSubcategory[],
  size: { widthIn: number; heightIn: number } | null,
  master: MasterPx,
): CatalogSubcategory[] {
  if (!size) return []
  return subcategories.filter((subcategory) => sizeFits(subcategory, size, master))
}

/**
 * "Sold in": one chip per switched-on print type of the family. Green = the size is
 * sold in that print type; outlined = the owner unticked it for this size; grey = the
 * print type cannot take the size (bounds, DPI, shape), with the reason in the title.
 * With `onToggle` the green/outlined chips are buttons; without it (a size that does not
 * exist yet) they only report. A single red chip says nothing sells the size at all,
 * which is also what blocks the Live toggle.
 */
function FitsChips({
  subcategories,
  size,
  master,
  excluded = [],
  onToggle,
}: {
  subcategories: CatalogSubcategory[]
  size: { widthIn: number; heightIn: number } | null
  master: MasterPx
  /** Provider subcategory ids the owner unticked for this size. */
  excluded?: readonly number[]
  /** Called with the next exclusion list when a chip is clicked. */
  onToggle?: (nextExcluded: number[]) => void
}) {
  if (subcategories.length === 0) return <span className="font-body text-[10px] text-charcoal/35">—</span>
  const fitting = new Set(fittingSubcategories(subcategories, size, master).map((s) => s.id))
  const soldIn = subcategories.filter((s) => fitting.has(s.id) && !excluded.includes(s.subcategory_id))
  return (
    <div className="flex flex-wrap items-center gap-1">
      {fitting.size === 0 && (
        <span className="rounded-full bg-coral/15 px-1.5 py-0.5 font-body text-[9px] font-semibold uppercase tracking-wider text-coral">
          Not sellable
        </span>
      )}
      {fitting.size > 0 && soldIn.length === 0 && (
        <span className="rounded-full bg-coral/15 px-1.5 py-0.5 font-body text-[9px] font-semibold uppercase tracking-wider text-coral">
          Not sold in any print type
        </span>
      )}
      {subcategories.map((subcategory) => {
        const fits = fitting.has(subcategory.id)
        const off = excluded.includes(subcategory.subcategory_id)
        const label = subcategory.display_label
        const chipClass = `inline-block max-w-[8rem] truncate whitespace-nowrap rounded-full px-1.5 py-0.5 font-body text-[9px] ${
          !fits
            ? 'bg-charcoal/8 text-charcoal/45'
            : off
              ? 'border border-charcoal/30 bg-white text-charcoal/55 line-through'
              : 'bg-teal/15 text-deep-teal'
        }`
        if (!fits || !onToggle) {
          return (
            <span
              key={subcategory.id}
              title={!fits ? `does not fit ${label}` : off ? `not sold in ${label}` : `sold in ${label}`}
              className={chipClass}
            >
              {label}
            </span>
          )
        }
        const next = off
          ? excluded.filter((id) => id !== subcategory.subcategory_id)
          : [...excluded, subcategory.subcategory_id]
        return (
          <button
            key={subcategory.id}
            type="button"
            role="switch"
            aria-checked={!off}
            aria-label={`Sold in ${label}`}
            title={off ? `not sold in ${label} — click to sell this size in it` : `sold in ${label} — click to stop selling this size in it`}
            onClick={() => onToggle(next)}
            className={`${chipClass} cursor-pointer hover:ring-1 hover:ring-teal/50`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** A medium nothing is turned on for keeps its sizes reachable, but folded away. */
function Collapsible({ collapsed, summary, children }: { collapsed: boolean; summary: string; children: ReactNode }) {
  if (!collapsed) return <>{children}</>
  return (
    <details>
      <summary className="cursor-pointer font-body text-[11px] text-teal">{summary}</summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

export default function VariantsTab({
  productId,
  productDefaultMargin,
  variants: initial,
  mediumCatalog,
  catalog = [],
  master,
  targetGrossMarginPct = 50,
  onEditCrop,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const catalogByMedium = useMemo(() => {
    const out: Record<string, MediumCatalogEntry> = {}
    for (const c of mediumCatalog) out[c.medium] = c
    return out
  }, [mediumCatalog])

  // The availability helpers read a tree; the tab is handed the subcategory rows, which
  // is all of it that matters here (host and load stamp are server bookkeeping).
  const catalogLoaded = catalog.length > 0
  const catalogTree = useMemo<Catalog>(
    () => ({ host: '', loaded_at: '', subcategories: catalog }),
    [catalog],
  )
  /** Per medium: the print types that can be sold right now, in sort order. */
  const sellableByMedium = useMemo(() => {
    const out: Record<string, CatalogSubcategory[]> = {}
    if (!catalogLoaded) return out
    for (const m of MEDIUMS) {
      out[m] = offerableSubcategories(catalogTree, m).sort(
        (a, b) => a.sort_order - b.sort_order || a.subcategory_id - b.subcategory_id,
      )
    }
    return out
  }, [catalogTree, catalogLoaded])

  const [variants, setVariants] = useState(initial)
  useEffect(() => { setVariants(initial) }, [initial])
  const defaultMargin = productDefaultMargin
  const [pending, startTransition] = useTransition()
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [lastDiff, setLastDiff] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [genMsg, setGenMsg] = useState<Record<string, GenerateResult | null>>({})
  const [genBusy, setGenBusy] = useState<Medium | null>(null)
  const [customModal, setCustomModal] = useState<{ medium: Medium; prefill?: { name: string; width_in: number; height_in: number } } | null>(null)

  // Print master geometry (prefers the cropped print master, falls back to the raw scan).
  const { printW, printH, hasPrintMaster } = builderPrintGeometry(master)
  // A variant can only go Live once the print master is READY (cropped/processed).
  const masterReady = master?.print_status === 'ready' && hasPrintMaster
  const aspect = printW && printH ? aspectFromMaster(printW, printH) : null
  const repDpi = 200 // canvas required DPI, used for the banner's max-size readout
  const maxPrintIn = printW && printH
    ? { w: Math.floor(printW / repDpi * 100) / 100, h: Math.floor(printH / repDpi * 100) / 100 }
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

  // A crop is processed outside this component. When the master becomes ready,
  // the worker may have resized and repriced existing variants; reload them so the
  // owner sees the production sizes without refreshing the whole page.
  const previousMaster = useRef({
    status: master?.print_status ?? null,
    width: master?.print_width_px ?? null,
    height: master?.print_height_px ?? null,
  })
  useEffect(() => {
    const next = {
      status: master?.print_status ?? null,
      width: master?.print_width_px ?? null,
      height: master?.print_height_px ?? null,
    }
    const changed = next.status !== previousMaster.current.status || next.width !== previousMaster.current.width || next.height !== previousMaster.current.height
    previousMaster.current = next
    if (changed && next.status === 'ready' && next.width && next.height) void reload()
  }, [master?.print_status, master?.print_width_px, master?.print_height_px, reload])

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

  const debouncedSave = useDebouncedSave(toast)

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
  const onSoldInChange = (id: string, excluded: number[]) => {
    updateVariantField(id, { excluded_subcategory_ids: excluded })
    debouncedSave(id, { excluded_subcategory_ids: excluded })
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
        toast.success('Prices refreshed.')
        await reload()
      } else {
        setRefreshStatus('error')
        toast.error('Could not refresh prices. Please try again.')
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
        const dropped: DroppedTierLine[] = body.data?.dropped ?? []
        const from: string[] = body.data?.fromSubcategories ?? []
        const fromMsg = from.length ? ` Derived from ${from.join(', ')}.` : ''
        setGenMsg((m) => ({
          ...m,
          [medium]: {
            text: `Created ${created} draft size${created === 1 ? '' : 's'}.${fromMsg}`,
            dropped,
          },
        }))
        await reload()
      } else {
        setGenMsg((m) => ({
          ...m,
          [medium]: { text: body.error || 'Could not generate sizes.', dropped: [] },
        }))
      }
      setGenBusy(null)
    })
  }

  const deleteVariant = async (id: string) => {
    try {
      await apiSend(`/api/admin/variants/${id}`, 'DELETE')
      setVariants((prev) => prev.filter((v) => v.id !== id))
      setConfirmDelete(null)
      toast.success('Size deleted.')
      await reload()
    } catch (err) {
      setConfirmDelete(null)
      toast.error(errorMessage(err))
    }
  }

  // Configured mediums = those Lumaprints has priced (subcategory + sizes).
  const cropProcessing = master?.print_status === 'pending' || master?.print_status === 'processing'
  // A raw scan is useful while the crop editor is open, but it is not the file
  // Lumaprints will print.  Do not let a failed/uncropped master create sizes that
  // will immediately fail at checkout; the owner can always open Crop and retry.
  const sizeActionsDisabled = !printW || !printH || !masterReady || cropProcessing

  return (
    <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-charcoal">Print sizes</h2>
          <p className="mt-1 font-body text-xs text-charcoal/50">
            Add printing and stored shipping to find your cost. Markup is the extra amount you add to that cost. Gross margin is the share of the selling price left after that cost. Edit either percentage and the other updates. For a $20 cost at 50% markup: 50 ÷ 100 = 0.5; $20 × 0.5 = $10 extra; $20 + $10 = $30 selling price. Drafts aren&apos;t shown on the site until flipped Live.
          </p>
          <Link href="/admin/help/09-understand-margins" className="mt-2 inline-block text-xs text-teal underline">See every pricing step and try the calculator →</Link>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-body text-xs text-charcoal/50">
            Default markup <strong className="text-charcoal/80">{defaultMargin}%</strong>
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

      <p className="mb-4 text-xs leading-relaxed text-charcoal/65">A standard 16 × 20 print must have a 4:5 shape. A differently shaped file can produce a custom size such as 16 × 19.5. Use Add print size to select exact standard dimensions and prepare the right crop. Generate S/M/L follows the file’s shape with long sides of 12, 20, and 30 inches when supported.</p>
      {cropProcessing && <p role="status" className="mb-4 rounded bg-amber-50 p-3 text-sm text-charcoal">Your new print file is processing. Wait until it is ready before adding sizes. Old crop dimensions will not be used.</p>}
      {/* Master banner */}
      <div className={`mb-5 rounded-md border px-4 py-3 ${hasPrintMaster || (printW && printH) ? 'border-charcoal/10 bg-charcoal/[0.03]' : 'border-amber-300 bg-amber-50'}`}>
        {printW && printH && aspect && maxPrintIn ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-body text-xs text-charcoal/80">
              {hasPrintMaster ? 'Print master ready' : 'Original artwork'}: <strong>{artworkShapeCopy(printW, printH)}</strong>
              {' · '}largest supported print: <strong>{maxPrintIn.w} × {maxPrintIn.h} in</strong>
              {' · '}{master?.border_mode === 'matte' ? 'matte border' : 'full bleed'}
              {master?.print_status === 'pending' && ' · preparing the new print file'}
              {master?.print_status === 'processing' && ' · preparing the new print file'}
              {master?.print_status === 'failed' && ' · crop needs another try'}
            </p>
            {onEditCrop && (
              <button type="button" onClick={() => onEditCrop()} className="shrink-0 rounded-md border border-charcoal/20 px-3 py-1.5 font-body text-[11px] font-medium text-charcoal hover:bg-charcoal hover:text-cream transition-colors">
                {hasPrintMaster ? 'Edit crop' : 'Crop master'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-body text-xs text-amber-800">
              Your print file is not ready yet. Open Crop, review the artwork, and save the print area before adding sizes.
            </p>
            {onEditCrop && (
              <button type="button" onClick={() => onEditCrop()} className="shrink-0 rounded-md border border-amber-400 px-3 py-1.5 font-body text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors">
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
        const sellable = sellableByMedium[m] ?? []
        const legacyConfigured = Boolean(cfg && cfg.enabled && cfg.subcategory_id)
        // With a catalog the print types decide; without one (a failed read, an older
        // caller) the legacy medium switch still drives the section.
        const configured = catalogLoaded ? sellable.length > 0 : legacyConfigured
        if (!configured && rows.length === 0) return null
        const hasDefaults = rows.some((r) => !r.is_custom_size)
        const defaultSubcategory = catalogLoaded
          ? defaultSubcategoryForMedium(catalogTree, m, cfg?.subcategory_id ?? null)
          : null
        // The tightest DPI decides the largest print the master can carry across this
        // medium's print types, so that is the one the readout has to name.
        const strictest = sellable.length
          ? sellable.reduce((a, b) => (b.required_dpi > a.required_dpi ? b : a))
          : null
        const largest =
          strictest && printW && printH
            ? {
                w: Math.floor((printW / strictest.required_dpi) * 100) / 100,
                h: Math.floor((printH / strictest.required_dpi) * 100) / 100,
              }
            : null
        const masterPx: MasterPx = printW && printH ? { printWidthPx: printW, printHeightPx: printH } : undefined
        const darkMedium = catalogLoaded && sellable.length === 0
        return (
          <div key={m} data-testid={`medium-${m}`} className="mb-6 last:mb-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="font-display text-base font-medium text-charcoal">
                {/* The family, never one print type's name: the print types are listed beneath. */}
                {mediumLabel(m)}
                <span className="ml-2 font-body text-xs text-charcoal/40">({rows.length})</span>
                {!configured && !darkMedium && (
                  <span className="ml-2 inline-block rounded-full bg-charcoal/10 px-2 py-0.5 font-body text-[10px] text-charcoal/50">Run Lumaprints sync to enable</span>
                )}
              </h3>
              {configured && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={sizeActionsDisabled || genBusy === m}
                    onClick={() => generateDefaults(m)}
                    title={cropProcessing ? 'Wait for the new print file to finish processing' : sizeActionsDisabled ? 'Crop the master first' : ''}
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
                    title={cropProcessing ? 'Wait for the new print file to finish processing' : sizeActionsDisabled ? 'Crop the master first' : ''}
                    className="font-body text-xs font-semibold uppercase tracking-wider text-teal hover:text-deep-teal transition-colors disabled:opacity-40"
                  >
                    + Add print size
                  </button>
                </div>
              )}
            </div>

            {sellable.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {sellable.map((subcategory) => (
                  <span key={subcategory.id} className="font-body text-[11px] text-charcoal/60">
                    <strong className="font-medium text-charcoal/80">{subcategory.display_label}</strong>
                    {' · '}
                    {trimIn(subcategory.min_width_in)}–{trimIn(subcategory.max_width_in)} in wide ×{' '}
                    {trimIn(subcategory.min_height_in)}–{trimIn(subcategory.max_height_in)} in tall
                    {' · '}
                    {subcategory.required_dpi} DPI
                    {defaultSubcategory?.id === subcategory.id && (
                      <span className="ml-1.5 inline-block rounded-full bg-teal/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-deep-teal">default</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {strictest && largest && (
              <p className="mb-2 font-body text-[11px] text-charcoal/55">
                Largest print at {strictest.required_dpi} DPI: <strong>{largest.w} × {largest.h} in</strong> (limited by {strictest.display_label})
              </p>
            )}

            {darkMedium && (
              <p role="status" className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 font-body text-[11px] text-amber-800">
                No print type of this medium is turned on in Print Catalog; existing sizes stay but cannot go Live
              </p>
            )}

            {genMsg[m] && (
              <div className="mb-2">
                <p className="font-body text-[11px] text-deep-teal">{genMsg[m]!.text}</p>
                {genMsg[m]!.dropped.map((d, i) => (
                  <p key={`${d.tier}-${d.subcategoryLabel ?? ''}-${i}`} className="font-body text-[11px] text-charcoal/60">
                    {TIER_NAME[d.tier]}{d.subcategoryLabel ? ` on ${d.subcategoryLabel}` : ''}: {d.reason}
                  </p>
                ))}
              </div>
            )}

            {rows.length > 0 && (
              <Collapsible collapsed={darkMedium} summary={`Show ${rows.length} existing size${rows.length === 1 ? '' : 's'}`}>
              <div className="rounded-md border border-charcoal/10 overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-charcoal/[0.03]">
                    <tr>
                      {['Live', 'Label', 'Size', ...(sellable.length > 0 ? ['Sold in'] : []), 'Cost', 'Markup / Gross margin', 'Price', 'Gross profit', ''].map((h, i) => (
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
                      const hasKnownCost = v.lumaprints_cost_cents != null
                      const gm = grossMarginPct(price, cost, ship)
                      const gmColor = gm <= 0 ? 'text-coral' : gm < targetGrossMarginPct ? 'text-amber-600' : 'text-teal'
                      const sizeDisplay = printSizeLabel(v)
                      const size =
                        v.width_in && v.height_in ? { widthIn: v.width_in, heightIn: v.height_in } : null
                      // A size no print type of this medium can take cannot be sold,
                      // whatever the medium switch says.
                      const fitsNone =
                        sellable.length > 0 && fittingSubcategories(sellable, size, masterPx).length === 0
                      const variantAspect = size ? size.widthIn / size.heightIn : null
                      const masterAspect = printW && printH ? printW / printH : null
                      const shapeMismatch = Boolean(
                        variantAspect && masterAspect && Math.abs(variantAspect / masterAspect - 1) > 0.01,
                      )
                      const liveBlocked = !(masterReady && configured) || fitsNone || shapeMismatch
                      return (
                        <tr key={v.id} className={!v.is_active ? 'bg-charcoal/[0.015]' : ''}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={v.is_active}
                              disabled={!v.is_active && liveBlocked}
                              onChange={(e) => onActiveChange(v.id, e.target.checked)}
                              title={
                                !v.is_active && liveBlocked
                                  ? !masterReady
                                    ? 'Crop the master / set the print area before going Live.'
                                    : darkMedium
                                      ? 'Turn on a print type of this medium in Print Catalog first.'
                                      : shapeMismatch
                                        ? 'This size no longer follows the artwork shape. Save a new crop or choose a size that follows the artwork.'
                                        : fitsNone
                                        ? 'No print type of this medium takes this size.'
                                        : 'Run the Lumaprints sync to enable this medium first.'
                                  : v.is_active
                                    ? 'Live on the site'
                                    : 'Draft — not shown on the site'
                              }
                            />
                          </td>
                          <td className="px-3 py-2 font-body text-sm text-charcoal">
                            {/* Every label is editable — rename any size (S/M/L too). */}
                            <input
                              type="text"
                              defaultValue={v.name ?? (v.size_tier ? TIER_NAME[v.size_tier] : '')}
                              onBlur={(e) => { if (e.target.value.trim() && e.target.value !== v.name) onNameChange(v.id, e.target.value) }}
                              className="w-36 rounded border border-charcoal/15 px-2 py-1 font-body text-sm"
                            />
                          </td>
                          <td className="px-3 py-2 font-body text-sm text-charcoal/70 whitespace-nowrap">
                            {sizeDisplay.dimensions}
                            <span className="ml-1.5 inline-block rounded-full bg-charcoal/8 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-charcoal/55">{v.size_tier || 'Custom'}</span>
                            {sizeDisplay.actualNote && <span className="block text-[9px] leading-4 text-charcoal/70">{sizeDisplay.actualNote}</span>}
                            {shapeMismatch && (
                              <span className="block text-[10px] leading-4 text-coral" title="This size no longer matches the current print crop">
                                Update this size to match the artwork
                              </span>
                            )}
                          </td>
                          {sellable.length > 0 && (
                            <td className="px-3 py-2">
                              <FitsChips
                                subcategories={sellable}
                                size={size}
                                master={masterPx}
                                excluded={v.excluded_subcategory_ids ?? []}
                                onToggle={(next) => onSoldInChange(v.id, next)}
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 font-body text-sm text-charcoal/70 whitespace-nowrap" title={`base ${fmtCents(cost)} + shipping ${fmtCents(ship)}`}>
                            {cost + ship > 0 ? fmtCents(cost + ship) : <span className="text-amber-600">Set cost</span>}
                            {cost + ship > 0 && v.last_priced_at && (
                              <span className="block text-[9px] text-charcoal/35">as of {new Date(v.last_priced_at).toLocaleDateString()}</span>
                            )}
                          </td>
                          <td className="min-w-48 px-3 py-2">
                            {hasManual && (!hasKnownCost || cost + ship <= 0) ? (
                              <p className="text-xs text-charcoal/65">Set costs to calculate markup and gross margin.</p>
                            ) : <MarkupMarginFields
                              key={`${v.id}-${hasManual ? 'manual' : 'automatic'}`}
                              value={hasManual ? String((price / (cost + ship) - 1) * 100) : v.margin_override_pct == null ? '' : String(v.margin_override_pct)}
                              inheritedMarkup={defaultMargin}
                              onChange={(value) => { if (!hasManual) onMarginChange(v.id, value === '' ? null : Number(value)) }}
                              readOnly={hasManual}
                              labelPrefix={v.name || v.id}
                              compact
                            />}
                            {hasManual && <p className="mt-1 text-[10px] text-charcoal/65">Manual price is fixed. Clear its price override to edit percentages.</p>}
                            {(!hasManual || hasKnownCost) && <details className="mt-1"><summary className="cursor-pointer font-body text-[11px] text-teal">See price math</summary><PricingRelationship landedCostCents={hasKnownCost ? cost + ship : undefined} priceCents={price} markupPct={v.margin_override_pct ?? defaultMargin} /></details>}
                          </td>
                          <td className="px-3 py-2 font-body text-sm font-medium text-charcoal whitespace-nowrap">
                            {fmtCents(price)}
                            <button type="button" onClick={() => onManualOverride(v.id, v.manual_price_override_cents)} className="ml-1.5 text-charcoal/40 hover:text-charcoal" title="Manual price override">✎</button>
                            {hasManual && <span className="ml-0.5 text-gold" title="Manual override">★</span>}
                          </td>
                          <td
                            className={`px-3 py-2 font-body text-sm font-medium ${gmColor}`}
                            title="Gross profit is the selling price minus printing and stored shipping costs, before payment fees, taxes, and other expenses."
                          >
                            {hasKnownCost ? fmtCents(price - cost - ship) : '—'}
                          </td>
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
              </Collapsible>
            )}
          </div>
        )
      })}

      {customModal && printW && printH && (
        <CustomSizeModal
          productId={productId}
          medium={customModal.medium}
          mediumName={mediumLabel(customModal.medium)}
          subcategoryId={catalogByMedium[customModal.medium]?.subcategory_id ?? null}
          subcategories={sellableByMedium[customModal.medium] ?? []}
          defaultSubcategory={
            catalogLoaded
              ? defaultSubcategoryForMedium(
                  catalogTree,
                  customModal.medium,
                  catalogByMedium[customModal.medium]?.subcategory_id ?? null,
                )
              : null
          }
          printW={printW}
          printH={printH}
          defaultMargin={defaultMargin}
          targetGrossMarginPct={targetGrossMarginPct}
          prefill={customModal.prefill}
          onPrepareCrop={onEditCrop ? (ratio) => { setCustomModal(null); onEditCrop(ratio) } : undefined}
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
  subcategories,
  defaultSubcategory,
  printW,
  printH,
  defaultMargin,
  targetGrossMarginPct,
  prefill,
  onClose,
  onCreated,
  onPrepareCrop,
}: {
  productId: string
  medium: Medium
  mediumName: string
  subcategoryId: number | null
  /** Every sellable print type of the medium, for the fits chips. */
  subcategories: CatalogSubcategory[]
  /** The print type this medium prices and orders by default; null = no catalog yet. */
  defaultSubcategory: CatalogSubcategory | null
  printW: number
  printH: number
  defaultMargin: number
  targetGrossMarginPct: number
  prefill?: { name: string; width_in: number; height_in: number }
  onClose: () => void
  onCreated: () => void
  onPrepareCrop?: (aspectRatio: number) => void
}) {
  // The catalog publishes the real bounds and DPI per print type; the seeded table is
  // the fallback for a medium whose rows have not been synced yet. The server gates
  // the save against these same numbers (loadBuilderContext, given the tree).
  const legacyBounds = boundsForSubcategory(subcategoryId)
  const bounds: SizeBounds = defaultSubcategory
    ? boundsOf(defaultSubcategory)
    : { minW: legacyBounds.minW, maxW: legacyBounds.maxW, minH: legacyBounds.minH, maxH: legacyBounds.maxH }
  const dpi = defaultSubcategory ? Number(defaultSubcategory.required_dpi) : legacyBounds.requiredDPI
  const { ratio, orientation } = aspectFromMaster(printW, printH)
  const maxW = Math.floor(printW / dpi * 100) / 100
  const maxH = Math.floor(printH / dpi * 100) / 100
  const initialStandard = orientation === 'landscape' ? '20x16' : '16x20'
  const initialDimensions = initialStandard.split('x').map(Number)
  const [sizeChoice, setSizeChoice] = useState(prefill ? 'custom' : initialStandard)
  const [name, setName] = useState(prefill?.name ?? `${initialDimensions[0]} × ${initialDimensions[1]} in`)
  const [nameEdited, setNameEdited] = useState(Boolean(prefill?.name))
  const [widthIn, setWidthIn] = useState<number>(prefill?.width_in ?? initialDimensions[0])
  const [heightIn, setHeightIn] = useState<number>(prefill?.height_in ?? initialDimensions[1])
  function chooseSize(value: string) {
    setSizeChoice(value)
    if (value === 'custom') {
      const height = partnerDimension(widthIn, 'width', ratio)
      setHeightIn(height)
      if (!nameEdited) setName(`${widthIn} × ${height} in`)
      return
    }
    const [width, height] = value.split('x').map(Number)
    setWidthIn(width); setHeightIn(height)
    setName(`${width} × ${height} in`)
    setNameEdited(false)
  }
  const [marginPct, setMarginPct] = useState<string>('')
  const [markupValid, setMarkupValid] = useState(true)
  const [manualOverride, setManualOverride] = useState<string>('')
  const [useManual, setUseManual] = useState(false)
  const [preview, setPreview] = useState<{ cost_cents?: number; shipping_cents?: number; price_cents?: number; gross_margin_pct?: number; error?: string } | null>(null)
  const [loadingPrice, setLoadingPrice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  // Aspect-locked auto-fill — editing one dimension drives the other.
  const setHeight = (h: number) => { const w = partnerDimension(h, 'height', ratio); setHeightIn(h); setWidthIn(w); if (!nameEdited) setName(`${w} × ${h} in`) }
  const setWidth = (w: number) => { const h = partnerDimension(w, 'width', ratio); setWidthIn(w); setHeightIn(h); if (!nameEdited) setName(`${w} × ${h} in`) }

  const check = validateCustomSize({ widthIn, heightIn }, { ratio, bounds, printPx: { width: printW, height: printH }, dpi })

  // Debounced price preview after a size change.
  useEffect(() => {
    if (!check.ok) { setPreview(null); setLoadingPrice(false); return }
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
  }, [productId, medium, widthIn, heightIn, check.ok])

  // Customer price recomputed locally when margin changes (over the landed cost).
  const landed = (preview?.cost_cents ?? 0) + (preview?.shipping_cents ?? 0)
  const effMargin = marginPct === '' ? defaultMargin : Number(marginPct)
  const computedPrice = useManual && manualOverride !== ''
    ? Math.round(Number(manualOverride) * 100)
    : Math.round(landed * (1 + (Number.isFinite(effMargin) ? effMargin : defaultMargin) / 100))
  const gm = grossMarginPct(computedPrice, preview?.cost_cents ?? 0, preview?.shipping_cents ?? 0)
  const gmColor = gm <= 0 ? 'text-coral' : gm < targetGrossMarginPct ? 'text-amber-600' : 'text-teal'

  const manualPriceValid = manualOverride.trim() !== '' && Number.isFinite(Number(manualOverride)) && Number(manualOverride) >= 0
  const pricingValid = useManual ? manualPriceValid : markupValid
  const blocked = !check.ok || loadingPrice || !pricingValid
  const blockingReason = !check.boundsOk
    ? 'Choose a size within the available print limits.'
    : !check.resolutionOk
      ? `Choose a smaller size (up to ${maxW} × ${maxH} inches) so the print stays clear.`
      : !check.aspectOk
        ? 'Choose “Custom — follow the artwork shape” or prepare a crop for this frame size.'
        : null

  async function save(publish: boolean) {
    if (!name.trim()) { setError('Give the size a name.'); return }
    if (!pricingValid) { setError('Enter valid pricing before saving.'); return }
    if (!check.ok) { setError(blockingReason || 'Fix the size before saving.'); return }
    setSaving(true)
    setError(null)
    try {
      const result = await apiSend<{ live_blocked?: boolean; reason?: string }>(
        `/api/admin/products/${productId}/variants/custom`,
        'POST',
        {
          medium,
          name: name.trim(),
          width_in: widthIn,
          height_in: heightIn,
          margin_override_pct: marginPct === '' ? null : Number(marginPct),
          manual_price_override_cents: useManual && manualOverride !== '' ? Math.round(Number(manualOverride) * 100) : null,
          is_active: publish,
        },
      )
      // A publish request can succeed at the DB layer but still fail the
      // fulfillability gate — the size is saved as a Draft, not Live. Surface
      // the reason loudly instead of silently closing as if it published.
      if (result?.live_blocked) {
        toast.error(`Saved as a draft — it can't go live yet. ${result.reason ?? ''}`.trim())
      } else if (publish) {
        toast.success('Size published and live on the site.')
      } else {
        toast.success('Size saved as a draft.')
      }
      onCreated()
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const Checkline = ({ ok, text }: { ok: boolean; text: string }) => (
    <p className={`font-body text-[11px] ${ok ? 'text-teal' : 'text-coral'}`}>{ok ? '✓' : '✗'} {text}</p>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-lg bg-cream shadow-2xl">
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          <h2 className="font-display text-xl font-light text-charcoal">Add {mediumName} print size</h2>
          <p className="mt-1 font-body text-xs leading-relaxed text-charcoal/60">Choose a familiar frame size, or let the measurements follow this artwork. A familiar size may require a crop so no part of the print is stretched or cut off.</p>
          <label className="mt-4 block text-sm">Print size
            <select aria-label="Print size" value={sizeChoice} onChange={event => chooseSize(event.target.value)} className="mt-1 block w-full rounded border border-charcoal/15 bg-white px-3 py-2">
              {COMMON_PRINT_SIZES.map(size => <option key={size} value={size}>{size.replace('x', ' × ')} in</option>)}
              <option value="custom">Custom — follow the artwork shape</option>
            </select>
          </label>
          {sizeChoice !== 'custom' && !check.aspectOk && <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-charcoal">
            <p>Your selected size is <strong>{widthIn} × {heightIn} inches</strong>, but the artwork has a different shape. Save a crop for this size, or choose “Custom — follow the artwork shape.” The image will never be stretched.</p>
            {onPrepareCrop && <button type="button" onClick={() => onPrepareCrop(widthIn / heightIn)} className="mt-2 font-semibold text-teal underline">Prepare crop for {widthIn} × {heightIn}</button>}
            <p className="mt-2">You will review the crop before saving. After it finishes processing, return here, choose this size again, and review its price. A change to a shared master can affect other print options.</p>
          </div>}

          <label className="block mt-4">
            <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Variant name</span>
            <input type="text" value={name} onChange={(e) => { setName(e.target.value); setNameEdited(true) }} placeholder="e.g. Life Size" className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm" />
          </label>

          <div className="mt-4 flex items-end gap-2">
            <label className="block flex-1">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Height (in)</span>
              <input type="number" disabled={sizeChoice !== 'custom'} step={DEFAULT_SIZE_STEP} value={heightIn} onChange={(e) => setHeight(Number(e.target.value))} className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm" />
            </label>
            <span className="pb-2.5 font-body text-[11px] text-charcoal/50">{sizeChoice === 'custom' ? 'Follows artwork shape' : 'Exact frame size'}</span>
            <label className="block flex-1">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Width (in)</span>
              <input type="number" disabled={sizeChoice !== 'custom'} step={DEFAULT_SIZE_STEP} value={widthIn} onChange={(e) => setWidth(Number(e.target.value))} className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm" />
            </label>
          </div>

          {/* Validation row */}
          <div className="mt-3 space-y-1 rounded-md bg-charcoal/[0.03] px-3 py-2">
            <Checkline ok={check.resolutionOk} text={check.resolutionOk ? `The artwork has enough detail for prints up to ${maxW} × ${maxH} inches` : `This is larger than the artwork can print clearly. Try a smaller size (up to ${maxW} × ${maxH} inches).`} />
            <Checkline ok={check.boundsOk} text={check.boundsOk ? 'Within the available print size limits' : check.reasons.find((r) => /exceeds|below/.test(r)) || 'This size is outside the available print size limits.'} />
            <Checkline ok={check.aspectOk} text={check.aspectOk ? 'The shape matches the artwork' : 'This size has a different shape. Choose a custom size or prepare a matching crop.'} />
            {subcategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="font-body text-[10px] uppercase tracking-wider text-charcoal/50">Fits</span>
                <FitsChips
                  subcategories={subcategories}
                  size={{ widthIn, heightIn }}
                  master={{ printWidthPx: printW, printHeightPx: printH }}
                />
              </div>
            )}
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

            <div className="mt-3 space-y-2">
              {useManual && (!manualPriceValid || landed <= 0) ? <p className="text-xs text-charcoal/65">{!manualPriceValid ? 'Enter a valid manual price to calculate percentages.' : 'Set costs to calculate markup and gross margin.'}</p> : <MarkupMarginFields
                key={useManual ? 'manual' : 'automatic'}
                value={useManual ? String((computedPrice / landed - 1) * 100) : marginPct}
                inheritedMarkup={defaultMargin}
                onChange={setMarginPct}
                onValidityChange={useManual ? undefined : setMarkupValid}
                readOnly={useManual}
                disabled={useManual && !manualPriceValid}
                labelPrefix="Print size"
                compact
              />}
              <label className="flex items-center gap-1.5 font-body text-[11px] text-charcoal/60">
                <input type="checkbox" checked={useManual} onChange={(e) => { setUseManual(e.target.checked); if (e.target.checked && manualOverride === '') setManualOverride((computedPrice / 100).toFixed(2)) }} /> Manual price
              </label>
              {useManual && <p className="text-[10px] text-charcoal/65">Percentages describe this fixed manual price. Turn off Manual price to edit percentages.</p>}
            </div>
            {useManual && (
              <label className="mt-2 flex items-center gap-2 font-body text-[11px] text-charcoal/65">
                Manual price ($)
                <input aria-label="Manual price ($)" type="number" min="0" step="0.01" value={manualOverride} onChange={(e) => setManualOverride(e.target.value)} className="w-28 rounded border border-charcoal/15 px-2 py-1 font-body text-sm" />
              </label>
            )}
            {pricingValid && (!useManual || preview?.cost_cents != null) && <PricingRelationship landedCostCents={preview?.cost_cents == null ? undefined : landed} priceCents={computedPrice} markupPct={effMargin} />}

            <div className="mt-3 flex items-center justify-between border-t border-charcoal/10 pt-2">
              <span className="font-body text-xs text-charcoal/60">Customer price</span>
              <span className="font-display text-lg font-semibold text-charcoal">{pricingValid ? fmtCents(computedPrice) : '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-body text-[11px] text-charcoal/50" title="$40 price − $20 costs = $20 gross profit. $20 ÷ $40 = 0.5. 0.5 × 100 = 50% gross margin, before other expenses.">Gross margin</span>
              <span className={`font-body text-xs font-medium ${gmColor}`}>{pricingValid && computedPrice > 0 ? `${Math.round(gm)}%` : '—'}</span>
            </div>

          </div>

          {error && <p className="mt-3 font-body text-xs text-coral">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 bg-white/40 p-4 rounded-b-lg">
          {blocked && blockingReason && <span className="mr-auto font-body text-[11px] text-coral">{blockingReason}</span>}
          <button type="button" onClick={onClose} className="rounded-sm px-4 py-2 font-body text-sm text-charcoal/70 hover:text-charcoal">Cancel</button>
          <button type="button" disabled={saving || !check.ok || !pricingValid} onClick={() => save(true)} className="rounded-sm border border-teal px-4 py-2 font-body text-sm font-medium text-teal hover:bg-teal/5 disabled:opacity-40">Save &amp; Publish</button>
          <button type="button" disabled={saving || !pricingValid || (!check.boundsOk || !check.resolutionOk || !check.aspectOk)} onClick={() => save(false)} className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-40">{saving ? 'Saving…' : 'Save as Draft'}</button>
        </div>
      </div>
    </div>
  )
}

function useDebouncedSave(toast: ReturnType<typeof useToast>) {
  const [timeouts] = useState(() => new Map<string, ReturnType<typeof setTimeout>>())
  return (id: string, patch: Partial<Variant>) => {
    if (timeouts.has(id)) clearTimeout(timeouts.get(id))
    const t = setTimeout(async () => {
      try {
        // Silent on success: this fires per debounced field edit, so a toast per
        // keystroke would pile up when adjusting margins/prices across sizes.
        // Failures still surface (the value would otherwise be silently lost).
        await apiSend(`/api/admin/variants/${id}`, 'PATCH', patch)
      } catch (err) {
        toast.error(errorMessage(err))
      }
    }, 500)
    timeouts.set(id, t)
  }
}
