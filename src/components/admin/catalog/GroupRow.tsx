'use client'
// Authored by DotWin
// One option group: the question a customer is asked, or the one we answer for them.
//
// `enabled` and `customer_visible` are separate axes on purpose. A group that is enabled
// but not customer-visible is an admin-pinned default: our option still travels to the
// provider, the shopper is never asked. Turning a REQUIRED group off is the other ADR-5
// cascade that stops a subcategory selling, so it asks first.
//
// A required group with no default is a launch-blocker in waiting: an untouched
// configuration would contribute nothing for it and the provider would resolve the
// omission itself, which is how a geometry-hostile default gets sent (P15).

import { useState } from 'react'
import OptionRow from '@/components/admin/catalog/OptionRow'
import { NewBadge, RemovedBadge } from '@/components/admin/catalog/Badges'
import Switch from '@/components/admin/catalog/Switch'
import type { CatalogWriter } from '@/components/admin/catalog/shared'
import type { CatalogOptionGroup, CatalogSubcategory, DisplayKind } from '@/lib/catalog/types'

const DISPLAY_KINDS: DisplayKind[] = ['swatch', 'list', 'radio']

interface Props {
  subcategory: CatalogSubcategory
  group: CatalogOptionGroup
  writer: CatalogWriter
}

/** One option group and every option beneath it. */
export default function GroupRow({ subcategory, group, writer }: Props) {
  const label = group.display_label || group.api_group_name
  const [labelDraft, setLabelDraft] = useState(label)
  const path = `/api/admin/catalog/group/${group.id}`

  async function toggle(next: boolean) {
    if (!next && group.required && group.effective_enabled) {
      const ok = await writer.confirm(
        'Turn off a required group?',
        `${label} is required by the provider. ${subcategory.display_label || subcategory.name} will stop selling while it is off.`,
      )
      if (!ok) return
    }
    await writer.patch(path, { enabled: next })
  }

  function commitLabel() {
    const value = labelDraft.trim()
    if (value === '' || value === label) {
      setLabelDraft(label)
      return
    }
    void writer.patch(path, { display_label: value })
  }

  const sortedOptions = [...group.options].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <section className="rounded-sm border border-charcoal/15 bg-white/60">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <Switch
          checked={group.enabled}
          label={`${label} enabled`}
          disabled={writer.busy}
          onChange={(next) => void toggle(next)}
        />
        <input
          type="text"
          value={labelDraft}
          aria-label={`Label for group ${label}`}
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className="min-w-40 flex-1 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-sm font-medium text-charcoal"
        />

        <label className="flex items-center gap-2 font-body text-xs text-charcoal/70">
          <Switch
            checked={group.customer_visible}
            label={`${label} shown to customers`}
            disabled={writer.busy}
            onChange={(next) => void writer.patch(path, { customer_visible: next })}
          />
          Shown to customers
        </label>

        <label className="font-body text-[11px] text-charcoal/60">
          Display
          <select
            value={group.display_kind}
            aria-label={`Display style for ${label}`}
            disabled={writer.busy}
            onChange={(event) => void writer.patch(path, { display_kind: event.target.value })}
            className="ml-1 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
          >
            {DISPLAY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>

        {group.required ? (
          <span className="rounded-sm bg-charcoal/10 px-1.5 py-0.5 font-body text-[11px] tracking-wide text-charcoal/70 uppercase">
            Required
          </span>
        ) : null}
        {group.depends_on_group ? (
          <span className="font-body text-[11px] text-charcoal/50">depends on {group.depends_on_group}</span>
        ) : null}
        {group.acknowledged_at === null ? (
          <NewBadge
            busy={writer.busy}
            label={`group ${label}`}
            onAcknowledge={() => void writer.patch(path, { acknowledged: true })}
          />
        ) : null}
        {group.removed_from_api ? <RemovedBadge /> : null}
      </header>

      {group.default_option_id === null ? (
        <p className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 font-body text-[11px] text-amber-800">
          No default set {'—'} pick one. Until then an untouched configuration sends nothing for this group.
        </p>
      ) : null}

      <div>
        {sortedOptions.map((option) => (
          <OptionRow
            key={option.id}
            subcategory={subcategory}
            group={group}
            option={option}
            writer={writer}
          />
        ))}
      </div>
    </section>
  )
}
