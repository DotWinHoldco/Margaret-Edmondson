'use client'
// Authored by DotWin
// One subcategory: the thing a customer actually buys, and the level the pricing cache,
// the bounds and the sellable check all hang off.
//
// The header carries everything that can be wrong with it even while the row is collapsed,
// because an admin scanning the page for a problem should not have to open thirty rows to
// find it: the flags, and the ADR-5 banner that explains an `enabled` subcategory which is
// not effectively enabled (its medium is off, the provider dropped it, or a required group
// has no live option left). `effective_enabled` is the server's verdict and is never
// recomputed here.

import { useState } from 'react'
import GroupRow from '@/components/admin/catalog/GroupRow'
import SellableCheck from '@/components/admin/catalog/SellableCheck'
import { NewBadge, RemovedBadge } from '@/components/admin/catalog/Badges'
import Switch from '@/components/admin/catalog/Switch'
import { shortDate, type CatalogWriter } from '@/components/admin/catalog/shared'
import type { CatalogSubcategory } from '@/lib/catalog/types'

/** One subcategory row: its own fields, its groups, and its sellable check. */
export default function SubcategoryRow({
  subcategory,
  writer,
}: {
  subcategory: CatalogSubcategory
  writer: CatalogWriter
}) {
  const label = subcategory.display_label || subcategory.name
  const [open, setOpen] = useState(false)
  const [labelDraft, setLabelDraft] = useState(label)
  const path = `/api/admin/catalog/subcategory/${subcategory.id}`
  const showBanner = subcategory.enabled && !subcategory.effective_enabled && subcategory.blocked_reason

  function commitLabel() {
    const value = labelDraft.trim()
    if (value === '' || value === label) {
      setLabelDraft(label)
      return
    }
    void writer.patch(path, { display_label: value })
  }

  function commitNote(field: 'description' | 'customer_note', raw: string) {
    const value = raw.trim()
    const current = subcategory[field] ?? ''
    if (value === current) return
    void writer.patch(path, { [field]: value === '' ? null : value })
  }

  const sortedGroups = [...subcategory.groups].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <article className="rounded-sm border border-charcoal/15 bg-cream/60">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
        <Switch
          checked={subcategory.enabled}
          label={`${label} enabled`}
          disabled={writer.busy}
          onChange={(next) => void writer.patch(path, { enabled: next })}
        />
        <input
          type="text"
          value={labelDraft}
          aria-label={`Label for ${label}`}
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className="min-w-48 flex-1 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-sm font-medium text-charcoal"
        />
        <span className="font-body text-[11px] text-charcoal/50">
          {subcategory.name} {'·'} id {subcategory.subcategory_id}
        </span>
        <span className="rounded-sm bg-charcoal/10 px-1.5 py-0.5 font-body text-[11px] text-charcoal/70">
          {subcategory.pricing_mode === 'whole_config' ? 'whole configuration' : 'additive'}
        </span>
        {subcategory.acknowledged_at === null ? (
          <NewBadge
            busy={writer.busy}
            label={label}
            onAcknowledge={() => void writer.patch(path, { acknowledged: true })}
          />
        ) : null}
        {subcategory.removed_from_api ? <RemovedBadge /> : null}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="ml-auto rounded-sm border border-charcoal/15 px-2 py-1 font-body text-xs text-charcoal/70 transition-colors hover:bg-teal/5"
        >
          {open ? 'Hide' : 'Edit'} {label}
        </button>
      </header>

      {showBanner ? (
        <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 font-body text-xs text-amber-800">
          {subcategory.blocked_reason}
        </p>
      ) : null}

      {open ? (
        <div className="space-y-3 border-t border-charcoal/10 px-3 py-3">
          <div className="flex flex-wrap items-center gap-4 font-body text-[11px] text-charcoal/60">
            <span>
              {subcategory.min_width_in}
              {'–'}
              {subcategory.max_width_in} in {'×'} {subcategory.min_height_in}
              {'–'}
              {subcategory.max_height_in} in
            </span>
            <span>{subcategory.required_dpi} DPI</span>
            <span>last synced {shortDate(subcategory.last_synced_at)}</span>
            <label>
              Order
              <input
                type="number"
                defaultValue={subcategory.sort_order}
                aria-label={`Sort order for ${label}`}
                onBlur={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isInteger(value) && value !== subcategory.sort_order) {
                    void writer.patch(path, { sort_order: value })
                  }
                }}
                className="ml-1 w-16 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="font-body text-[11px] text-charcoal/60">
              Description
              <textarea
                rows={2}
                defaultValue={subcategory.description ?? ''}
                aria-label={`Description for ${label}`}
                onBlur={(event) => commitNote('description', event.target.value)}
                className="mt-1 w-full rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
              />
            </label>
            <label className="font-body text-[11px] text-charcoal/60">
              Customer note
              <textarea
                rows={2}
                defaultValue={subcategory.customer_note ?? ''}
                aria-label={`Customer note for ${label}`}
                onBlur={(event) => commitNote('customer_note', event.target.value)}
                className="mt-1 w-full rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
              />
            </label>
          </div>

          <div className="space-y-3">
            {sortedGroups.map((group) => (
              <GroupRow key={group.id} subcategory={subcategory} group={group} writer={writer} />
            ))}
          </div>

          <SellableCheck subcategory={subcategory} />
        </div>
      ) : null}
    </article>
  )
}
