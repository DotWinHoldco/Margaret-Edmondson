'use client'
// Authored by DotWin
// The Print Catalog manager: medium -> subcategory -> group -> option, with every write
// going through the catalog admin RPCs behind /api/admin/catalog.
//
// Two decisions shape the whole component:
//
//  1. The server owns the cascade. After EVERY accepted write the tree is refetched and
//     the screen re-renders from the answer. `effective_enabled` and `blocked_reason` are
//     read, never computed here: switching a medium off changes the verdict on dozens of
//     rows at once, and a browser that tried to predict that would be wrong in exactly the
//     cases that matter (a required group emptying out, a tombstone, a blocked geometry).
//
//  2. Confirmation is in-page. The ADR-5 cascade warnings use the shared ConfirmDialog
//     rather than window.confirm, which blocks the browser automation the acceptance walks
//     drive this screen with.
//
// A refused write (409) arrives as our own sentence from the RPC and is shown verbatim,
// because "option blocked: this finish needs a print file with extra bleed" is the answer,
// and a generic failure toast would send an admin looking for a bug instead.

import { useCallback, useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import SubcategoryRow from '@/components/admin/catalog/SubcategoryRow'
import SyncPanel from '@/components/admin/catalog/SyncPanel'
import Switch from '@/components/admin/catalog/Switch'
import {
  countOptionsNeedingSwatch,
  shortDate,
  type AdminCatalogPayload,
  type CatalogWriter,
  type MediumRow,
} from '@/components/admin/catalog/shared'
import { apiFetch, apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { MEDIUMS, mediumLabel, type Medium } from '@/lib/pricing/mediums'
import type { CatalogSubcategory } from '@/lib/catalog/types'

interface PendingConfirm {
  title: string
  message: string
  resolve: (answer: boolean) => void
}

/** A friendly medium name even for a key the pricing enum has not heard of. */
function labelForMedium(medium: string): string {
  return (MEDIUMS as readonly string[]).includes(medium) ? mediumLabel(medium as Medium) : medium
}

/** The admin Print Catalog tree, its sync panel and its launch-gate summary. */
export default function CatalogManager() {
  const toast = useToast()
  const [payload, setPayload] = useState<AdminCatalogPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const load = useCallback(async () => {
    try {
      const answer = await apiFetch<AdminCatalogPayload>('/api/admin/catalog')
      setPayload(answer)
      setFailure(null)
    } catch (err) {
      setFailure(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const send = useCallback(
    async (path: string, method: 'PATCH' | 'POST', body?: unknown) => {
      setBusy(true)
      try {
        await apiSend(path, method, body)
        await load()
        toast.success('Saved.')
        return true
      } catch (err) {
        // A 409 carries the RPC's own sentence; the fetch wrapper passes it through.
        toast.error(errorMessage(err))
        return false
      } finally {
        setBusy(false)
      }
    },
    [load, toast],
  )

  const confirm = useCallback(
    (title: string, message: string) =>
      new Promise<boolean>((resolve) => {
        setPending({ title, message, resolve })
      }),
    [],
  )

  const writer = useMemo<CatalogWriter>(
    () => ({
      patch: (path, body) => send(path, 'PATCH', body),
      post: (path) => send(path, 'POST'),
      confirm,
      busy,
    }),
    [send, confirm, busy],
  )

  const catalog = payload?.catalog ?? null
  const needSwatch = catalog ? countOptionsNeedingSwatch(catalog) : 0

  const mediums = useMemo<MediumRow[]>(() => {
    const rows = payload?.mediums ?? []
    const known = new Set(rows.map((row) => row.medium))
    const extra = (catalog?.subcategories ?? [])
      .map((subcategory) => subcategory.medium as string)
      .filter((medium) => !known.has(medium))
    const seen = new Set<string>()
    const fromTree: MediumRow[] = []
    for (const medium of extra) {
      if (seen.has(medium)) continue
      seen.add(medium)
      fromTree.push({ medium, name: null, enabled: false, subcategory_id: null, last_synced_at: null })
    }
    return [...rows, ...fromTree]
  }, [payload, catalog])

  const byMedium = useMemo(() => {
    const map = new Map<string, CatalogSubcategory[]>()
    for (const subcategory of catalog?.subcategories ?? []) {
      const list = map.get(subcategory.medium) ?? []
      list.push(subcategory)
      map.set(subcategory.medium, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order)
    return map
  }, [catalog])

  if (loading) {
    return <p className="font-body text-sm text-charcoal/50">Loading the print catalog…</p>
  }

  if (failure && !payload) {
    return (
      <p role="alert" className="font-body text-sm text-coral">
        {failure}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <SyncPanel onFinished={() => void load()} />

      <p className="font-body text-sm text-charcoal/70">
        {needSwatch} enabled frame/mat {needSwatch === 1 ? 'option needs' : 'options need'} a swatch
      </p>

      <div className="space-y-6">
        {mediums.map((row) => {
          const subcategories = byMedium.get(row.medium) ?? []
          const live = subcategories.filter((subcategory) => subcategory.effective_enabled).length
          return (
            <section key={row.medium} className="space-y-3">
              <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Switch
                  checked={row.enabled}
                  label={`${labelForMedium(row.medium)} enabled`}
                  disabled={busy}
                  onChange={(next) =>
                    void writer.patch(`/api/admin/catalog/medium/${row.medium}`, { enabled: next })
                  }
                />
                <h2 className="font-display text-xl font-light text-charcoal">{labelForMedium(row.medium)}</h2>
                <span className="rounded-sm bg-teal/10 px-2 py-0.5 font-body text-[11px] text-teal">
                  {live} of {subcategories.length} subcategories on
                </span>
                <span className="font-body text-[11px] text-charcoal/50">
                  last synced {shortDate(row.last_synced_at)}
                </span>
              </header>

              {subcategories.length === 0 ? (
                <p className="font-body text-xs text-charcoal/50">Nothing synced for this medium yet.</p>
              ) : (
                <div className="space-y-2">
                  {subcategories.map((subcategory) => (
                    <SubcategoryRow key={subcategory.id} subcategory={subcategory} writer={writer} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        message={pending?.message}
        variant="danger"
        confirmText="Turn it off"
        onConfirm={() => {
          pending?.resolve(true)
          setPending(null)
        }}
        onCancel={() => {
          pending?.resolve(false)
          setPending(null)
        }}
      />
    </div>
  )
}
