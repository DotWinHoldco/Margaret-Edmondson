'use client'
// Authored by DotWin
// One option: the leaf the provider is actually sent.
//
// Three things here are not ordinary form fields:
//   - BLOCKED (ADR-4). When the tree carries a `blocked_reason` the switch is disabled and
//     the reason sits beside it. The RPC refuses the ON transition as well, so this is the
//     courtesy, not the guard.
//   - DEFAULT. Exactly one option per group is ours, and it is what an untouched
//     configuration sends. It moves by POST, never by a patch, because the move has to be
//     atomic across two rows.
//   - The last live option of a REQUIRED group. Switching it off stops the whole
//     subcategory selling (ADR-5), so it asks first, through the shared dialog.

import { useState } from 'react'
import SwatchEditor from '@/components/admin/catalog/SwatchEditor'
import { BlockedBadge, NeedsSwatchBadge, NewBadge, RemovedBadge } from '@/components/admin/catalog/Badges'
import Switch from '@/components/admin/catalog/Switch'
import { optionNeedsSwatch, type CatalogWriter } from '@/components/admin/catalog/shared'
import type { CatalogOption, CatalogOptionGroup, CatalogSubcategory } from '@/lib/catalog/types'

interface Props {
  subcategory: CatalogSubcategory
  group: CatalogOptionGroup
  option: CatalogOption
  writer: CatalogWriter
}

/** One option row: toggle, default, label, order, swatch and its flags. */
export default function OptionRow({ subcategory, group, option, writer }: Props) {
  const label = option.display_label || option.api_option_name
  const [labelDraft, setLabelDraft] = useState(label)
  const path = `/api/admin/catalog/option/${option.id}`
  const blocked = option.blocked_reason !== null
  const isDefault = group.default_option_id === option.option_id
  const liveSiblings = group.options.filter((candidate) => candidate.effective_enabled).length

  async function toggle(next: boolean) {
    if (!next && group.required && option.effective_enabled && liveSiblings <= 1) {
      const ok = await writer.confirm(
        'Turn off the last available option?',
        `${group.display_label || group.api_group_name} is required, and this is its last available option. ` +
          `${subcategory.display_label || subcategory.name} will stop selling until another one is turned on.`,
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

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-charcoal/10 px-3 py-2">
      <Switch
        checked={option.enabled}
        label={`${label} enabled`}
        disabled={blocked || writer.busy}
        onChange={(next) => void toggle(next)}
      />

      <label className="flex items-center gap-1.5 font-body text-xs text-charcoal/70">
        <input
          type="radio"
          name={`catalog-default-${group.id}`}
          checked={isDefault}
          disabled={blocked || writer.busy}
          aria-label={`Make ${label} the default for ${group.display_label || group.api_group_name}`}
          onChange={() => {
            if (!isDefault) void writer.post(`${path}/default`)
          }}
          className="accent-teal"
        />
        Default
      </label>

      <input
        type="text"
        value={labelDraft}
        aria-label={`Label for ${label}`}
        onChange={(event) => setLabelDraft(event.target.value)}
        onBlur={commitLabel}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="min-w-40 flex-1 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-sm text-charcoal"
      />

      <label className="font-body text-[11px] text-charcoal/60">
        Order
        <input
          type="number"
          defaultValue={option.sort_order}
          aria-label={`Sort order for ${label}`}
          onBlur={(event) => {
            const value = Number(event.target.value)
            if (Number.isInteger(value) && value !== option.sort_order) {
              void writer.patch(path, { sort_order: value })
            }
          }}
          className="ml-1 w-16 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
        />
      </label>

      <span className="font-body text-[11px] text-charcoal/40">id {option.option_id}</span>

      <div className="flex flex-wrap items-center gap-2">
        {option.acknowledged_at === null ? (
          <NewBadge
            busy={writer.busy}
            label={label}
            onAcknowledge={() => void writer.patch(path, { acknowledged: true })}
          />
        ) : null}
        {option.removed_from_api ? <RemovedBadge /> : null}
        {blocked ? <BlockedBadge reason={option.blocked_reason ?? ''} /> : null}
        {optionNeedsSwatch(group, option) ? <NeedsSwatchBadge /> : null}
      </div>

      <div className="w-full">
        <SwatchEditor group={group} option={option} writer={writer} />
      </div>
    </div>
  )
}
