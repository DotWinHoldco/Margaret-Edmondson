'use client'

// Authored by DotWin
// One group of choices, drawn the way the catalog says to draw it: a swatch row, a
// radio row, or a native select.
//
// Two rules hold across all three. An option that cannot be picked at this size is
// DISABLED WITH THE REASON NEXT TO IT, never hidden and never silently accepted: a
// shopper who chose a 3 inch mat at 36 by 24 and was refused after paying is the exact
// failure this control exists to prevent. And the reason shown is always the customer
// sentence from the shared rules module, never the operator's note, which the browser
// is not given in the first place.

import { useId } from 'react'
import type { GroupAvailability, OptionAvailability } from '@/lib/catalog/availability'
import type { StorefrontGroup, StorefrontOption } from '@/lib/catalog/storefront'

function reasonFor(availability: GroupAvailability | undefined, optionId: number): OptionAvailability | null {
  return availability?.options.find((option) => option.optionId === optionId) ?? null
}

function swatchStyle(option: StorefrontOption): React.CSSProperties {
  const hex = option.swatch?.color_hex
  return { backgroundColor: hex || '#e7e1d7' }
}

/** Move focus and selection along the enabled radios of one group. */
function moveFocus(container: HTMLElement | null, key: string, onChoose: (id: number) => void) {
  if (!container) return false
  const radios = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  ).filter((radio) => radio.getAttribute('aria-disabled') !== 'true')
  if (radios.length === 0) return false
  const index = radios.indexOf(document.activeElement as HTMLButtonElement)
  const next =
    key === 'Home'
      ? 0
      : key === 'End'
        ? radios.length - 1
        : key === 'ArrowRight' || key === 'ArrowDown'
          ? (index + 1 + radios.length) % radios.length
          : key === 'ArrowLeft' || key === 'ArrowUp'
            ? (index - 1 + radios.length) % radios.length
            : null
  if (next === null) return false
  const target = radios[next]
  if (!target) return false
  target.focus()
  const id = Number(target.dataset.optionId)
  if (Number.isFinite(id)) onChoose(id)
  return true
}

export default function OptionGroupControl({
  group,
  availability,
  selectedId,
  onChoose,
}: {
  group: StorefrontGroup
  availability: GroupAvailability | undefined
  selectedId: number | null
  onChoose: (optionId: number) => void
}) {
  const id = useId()
  const options = [...group.options].sort(
    (a, b) => a.sort_order - b.sort_order || a.option_id - b.option_id,
  )
  const firstEnabled = options.find((option) => reasonFor(availability, option.option_id)?.offerable !== false)
  const isSwatchRow = group.display_kind === 'swatch'

  if (group.display_kind === 'list') {
    const unavailable = options
      .map((option) => ({ option, state: reasonFor(availability, option.option_id) }))
      .filter((entry) => entry.state?.offerable === false && entry.state.reason)
    return (
      <div className="mt-4">
        <label htmlFor={`${id}-select`} className="block font-body text-xs font-medium uppercase tracking-wide text-charcoal/60">
          {group.display_label}
        </label>
        <select
          id={`${id}-select`}
          value={selectedId === null ? '' : String(selectedId)}
          onChange={(event) => onChoose(Number(event.target.value))}
          className="mt-1.5 w-full rounded-sm border border-charcoal/20 bg-white px-3 py-2.5 font-body text-sm text-charcoal focus-visible:outline-2 focus-visible:outline-teal"
        >
          {selectedId === null && <option value="">Choose {group.display_label.toLowerCase()}</option>}
          {options.map((option) => {
            const state = reasonFor(availability, option.option_id)
            const blocked = state?.offerable === false
            return (
              <option key={option.option_id} value={option.option_id} disabled={blocked}>
                {option.display_label}
                {blocked ? ' (unavailable)' : ''}
              </option>
            )
          })}
        </select>
        {unavailable.map((entry) => (
          <p key={entry.option.option_id} className="mt-1 font-body text-xs text-charcoal/55">
            {entry.option.display_label}: {entry.state?.reason}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-4">
      <span id={`${id}-label`} className="block font-body text-xs font-medium uppercase tracking-wide text-charcoal/60">
        {group.display_label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className={isSwatchRow ? 'mt-1.5 flex flex-wrap gap-2' : 'mt-1.5 flex flex-wrap gap-2'}
        onKeyDown={(event) => {
          if (moveFocus(event.currentTarget, event.key, onChoose)) event.preventDefault()
        }}
      >
        {options.map((option) => {
          const state = reasonFor(availability, option.option_id)
          const disabled = state?.offerable === false
          const checked = option.option_id === selectedId
          const roving = checked || (selectedId === null && option.option_id === firstEnabled?.option_id)
          return (
            <div key={option.option_id} className={isSwatchRow ? 'w-[7.5rem]' : ''}>
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                aria-disabled={disabled}
                data-option-id={option.option_id}
                tabIndex={roving ? 0 : -1}
                onClick={() => { if (!disabled) onChoose(option.option_id) }}
                className={`flex w-full items-center gap-2 rounded-sm border px-2.5 py-2 text-left font-body text-sm transition-colors focus-visible:outline-2 focus-visible:outline-teal ${
                  checked ? 'border-teal bg-teal/5 text-charcoal' : 'border-charcoal/15 bg-white text-charcoal/80'
                } ${disabled ? 'cursor-not-allowed opacity-55' : 'hover:border-teal/50'}`}
              >
                {isSwatchRow && (
                  <span
                    aria-hidden="true"
                    className="h-5 w-5 flex-shrink-0 rounded-sm border border-charcoal/20"
                    style={swatchStyle(option)}
                  />
                )}
                <span className="min-w-0 leading-snug">{option.display_label}</span>
              </button>
              {disabled && state?.reason && (
                <p className="mt-1 font-body text-xs text-charcoal/55">{state.reason}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
