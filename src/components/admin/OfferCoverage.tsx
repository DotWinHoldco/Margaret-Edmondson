'use client'

// Authored by DotWin
// The storewide print-coverage grid: every artwork against every print type, and the
// one button that fills the gaps (plan P3, F25).
//
// Generating storewide costs real provider calls, so the route bounds each invocation
// and hands back a cursor; this component is the thing that keeps calling it. It shows
// what has been processed while it runs and can be stopped between calls, because an
// owner watching 39 artworks price themselves needs to see progress and needs a way out
// that does not involve closing the tab mid-write.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { mediumLabel, type Medium } from '@/lib/pricing/mediums'

export interface CoverageSubcategory {
  id: string
  medium: Medium
  subcategory_id: number
  display_label: string
  effective_enabled: boolean
  blocked_reason: string | null
}

export interface CoverageCell {
  live: number
  draft: number
  fits: number
  status: 'live' | 'draft' | 'none' | 'blocked'
  reason: string | null
}

export interface CoverageProduct {
  id: string
  title: string | null
  slug: string | null
  masterReady: boolean
  cells: Record<string, CoverageCell>
}

export interface CoverageReport {
  generatedAt: string
  subcategories: CoverageSubcategory[]
  products: CoverageProduct[]
  totals: { live: number; draft: number; none: number; blocked: number }
}

interface RunProgress {
  calls: number
  products: number
  cells: number
  created: number
}

interface CreatedRow {
  product_id: string
  medium: Medium
  size_label: string
}

const CELL_STYLE: Record<CoverageCell['status'], string> = {
  live: 'text-deep-teal',
  draft: 'text-gold',
  none: 'text-charcoal/35',
  blocked: 'text-coral',
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The print-type columns, grouped into their medium so the header can span them. */
function groupColumns(subcategories: CoverageSubcategory[]): Array<{ medium: Medium; columns: CoverageSubcategory[] }> {
  const groups: Array<{ medium: Medium; columns: CoverageSubcategory[] }> = []
  for (const subcategory of subcategories) {
    const last = groups[groups.length - 1]
    if (last && last.medium === subcategory.medium) last.columns.push(subcategory)
    else groups.push({ medium: subcategory.medium, columns: [subcategory] })
  }
  return groups
}

export default function OfferCoverage({ pauseMs = 3000 }: { pauseMs?: number }) {
  const toast = useToast()
  const [report, setReport] = useState<CoverageReport | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<'idle' | 'generate' | 'dry'>('idle')
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [wouldCreate, setWouldCreate] = useState<CreatedRow[] | null>(null)
  const stopped = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/variants/coverage')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setLoadError(body.error || 'Could not load print coverage.')
      return
    }
    setLoadError(null)
    setReport(body.data as CoverageReport)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = useCallback(
    async (dryRun: boolean) => {
      stopped.current = false
      setMode(dryRun ? 'dry' : 'generate')
      setWouldCreate(dryRun ? [] : null)
      const totals: RunProgress = { calls: 0, products: 0, cells: 0, created: 0 }
      const planned: CreatedRow[] = []
      let cursor: { productIndex: number } | null = null
      let finished = false

      try {
        for (;;) {
          const payload: Record<string, unknown> = {}
          if (cursor) payload.cursor = cursor
          if (dryRun) payload.dryRun = true
          const res = await fetch('/api/admin/variants/coverage', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) {
            toast.error(body.error || 'Could not generate the missing sizes.')
            break
          }
          const data = body.data as {
            done: boolean
            cursor: { productIndex: number } | null
            processed: { products: number; cells: number }
            created: CreatedRow[]
          }
          totals.calls += 1
          totals.products += data.processed?.products ?? 0
          totals.cells += data.processed?.cells ?? 0
          totals.created += data.created?.length ?? 0
          planned.push(...(data.created || []))
          setProgress({ ...totals })
          if (dryRun) setWouldCreate([...planned])
          if (data.done || !data.cursor) {
            finished = true
            break
          }
          cursor = data.cursor
          if (stopped.current) break
          if (pauseMs > 0) await sleep(pauseMs)
          if (stopped.current) break
        }
      } finally {
        setMode('idle')
      }

      if (!dryRun && totals.created > 0) {
        toast.success(`Created ${totals.created} draft size${totals.created === 1 ? '' : 's'}.`)
      } else if (!dryRun && finished) {
        toast.success('Every artwork already has its default sizes.')
      }
      if (!dryRun) await load()
    },
    [load, pauseMs, toast],
  )

  const running = mode !== 'idle'
  const groups = report ? groupColumns(report.subcategories) : []

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => void run(false)}
          className="rounded-full bg-teal px-4 py-2 font-body text-sm font-semibold text-white hover:bg-deep-teal disabled:opacity-50"
        >
          {mode === 'generate' ? 'Generating…' : 'Generate missing sizes'}
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => void run(true)}
          className="rounded-full border border-charcoal/20 px-4 py-2 font-body text-sm font-semibold text-charcoal hover:border-charcoal/40 disabled:opacity-50"
        >
          {mode === 'dry' ? 'Checking…' : 'Dry run'}
        </button>
        {running ? (
          <button
            type="button"
            onClick={() => {
              stopped.current = true
            }}
            className="rounded-full border border-coral/40 px-4 py-2 font-body text-sm font-semibold text-coral hover:border-coral"
          >
            Stop
          </button>
        ) : null}
        {report ? (
          <span className="font-body text-xs text-charcoal/50">
            {report.totals.live} live · {report.totals.draft} draft · {report.totals.none} empty ·{' '}
            {report.totals.blocked} blocked
          </span>
        ) : null}
      </div>

      {progress ? (
        <p className="mt-3 font-body text-sm text-charcoal/70">
          {progress.products} artwork{progress.products === 1 ? '' : 's'} checked · {progress.cells} print lane
          {progress.cells === 1 ? '' : 's'} · {progress.created} size{progress.created === 1 ? '' : 's'}{' '}
          {mode === 'dry' || wouldCreate ? 'would be created' : 'created'}
        </p>
      ) : null}

      {wouldCreate && wouldCreate.length > 0 ? (
        <ul className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-charcoal/10 p-3 font-body text-xs text-charcoal/70">
          {wouldCreate.map((row) => (
            <li key={`${row.product_id}-${row.medium}-${row.size_label}`}>
              {mediumLabel(row.medium)} · {row.size_label}
            </li>
          ))}
        </ul>
      ) : null}

      {loadError ? <p className="mt-4 font-body text-sm text-coral">{loadError}</p> : null}

      {report ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-charcoal/10">
          <table className="w-full border-collapse font-body text-sm">
            <caption className="sr-only">Print coverage by artwork and print type</caption>
            <thead>
              <tr>
                <th scope="col" rowSpan={2} className="px-3 py-2 text-left font-semibold text-charcoal">
                  Artwork
                </th>
                {groups.map((group) => (
                  <th
                    key={group.medium}
                    scope="colgroup"
                    colSpan={group.columns.length}
                    className="border-l border-charcoal/10 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-charcoal/60"
                  >
                    {mediumLabel(group.medium)}
                  </th>
                ))}
              </tr>
              <tr>
                {report.subcategories.map((subcategory) => (
                  <th
                    key={subcategory.id}
                    scope="col"
                    className="border-l border-charcoal/10 px-3 py-2 text-left text-xs font-medium text-charcoal/60"
                  >
                    {subcategory.display_label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.products.map((product) => (
                <tr key={product.id} className="border-t border-charcoal/10">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-charcoal">
                    <Link href={`/admin/products/${product.id}/edit`} className="hover:text-teal">
                      {product.title || product.slug || product.id}
                    </Link>
                  </th>
                  {report.subcategories.map((subcategory) => {
                    const cell = product.cells[subcategory.id]
                    if (!cell) {
                      return (
                        <td key={subcategory.id} className="border-l border-charcoal/10 px-3 py-2 text-charcoal/35">
                          —
                        </td>
                      )
                    }
                    const label =
                      cell.status === 'live'
                        ? `Live ${cell.live}`
                        : cell.status === 'draft'
                          ? `Draft ${cell.draft}`
                          : cell.status === 'blocked'
                            ? 'Blocked'
                            : '—'
                    return (
                      <td
                        key={subcategory.id}
                        title={cell.reason ?? undefined}
                        className={`border-l border-charcoal/10 px-3 py-2 ${CELL_STYLE[cell.status]}`}
                      >
                        {label}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-charcoal/20">
                <th scope="row" className="px-3 py-2 text-left font-semibold text-charcoal">
                  Totals
                </th>
                <td
                  colSpan={Math.max(report.subcategories.length, 1)}
                  className="border-l border-charcoal/10 px-3 py-2 text-charcoal/70"
                >
                  {report.totals.live} live · {report.totals.draft} draft · {report.totals.none} empty ·{' '}
                  {report.totals.blocked} blocked
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        !loadError && <p className="mt-4 font-body text-sm text-charcoal/50">Loading print coverage…</p>
      )}
    </div>
  )
}
