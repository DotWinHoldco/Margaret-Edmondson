'use client'

// Authored by DotWin
// Step three (§7.1): the Live sizes this finish can take, smallest first. A chip shows a
// price only when that price is TRUE for the finish on screen: the size's stored price
// belongs to the depth it was priced for, so under another depth the chip says nothing
// until the size is selected and the server has quoted it (2026-09-17: a 1.25in price sat
// on a chip under the 1.50in finish). The configured price is always the server's.
//
// Sizes outside the finish's bounds are absent rather than disabled: a size that cannot
// be printed at all is not a choice a shopper needs explained.

import { printSizeLabel } from '@/lib/pricing/print-size-label'
import type { PrintVariant } from './catalog-view'

export const PRICED_ON_SELECT = 'priced when selected'

export default function SizePicker({
  variants,
  value,
  onSelect,
  priceFor,
}: {
  variants: PrintVariant[]
  value: string | null
  onSelect: (variantId: string) => void
  /** Dollars to show on a chip, or null when no honest number exists yet. Default: the stored price. */
  priceFor?: (variant: PrintVariant) => number | null
}) {
  return (
    <div className="mt-4">
      <span id="print-size-label" className="block font-body text-xs font-medium uppercase tracking-wide text-charcoal/60">
        Choose a size
      </span>
      <div
        role="radiogroup"
        aria-labelledby="print-size-label"
        className="mt-1.5 flex flex-wrap gap-2"
        onKeyDown={(event) => {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
          if (buttons.length === 0) return
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : event.key === 'ArrowRight' || event.key === 'ArrowDown'
                  ? (index + 1 + buttons.length) % buttons.length
                  : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                    ? (index - 1 + buttons.length) % buttons.length
                    : null
          if (next === null) return
          event.preventDefault()
          const target = buttons[next]
          target?.focus()
          if (target?.dataset.variant) onSelect(target.dataset.variant)
        }}
      >
        {variants.map((variant, index) => {
          const label = printSizeLabel(variant)
          const checked = variant.id === value
          const price = priceFor ? priceFor(variant) : variant.price
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={checked}
              data-variant={variant.id}
              tabIndex={checked || (value === null && index === 0) ? 0 : -1}
              onClick={() => onSelect(variant.id)}
              className={`rounded-sm border px-3 py-2 text-left font-body text-sm transition-colors focus-visible:outline-2 focus-visible:outline-teal ${
                checked ? 'border-teal bg-teal/5 text-charcoal' : 'border-charcoal/15 bg-white text-charcoal/80 hover:border-teal/50'
              }`}
            >
              <span className="block">{label.title}</span>
              <span className="block font-body text-xs text-charcoal/55">
                {price === null ? PRICED_ON_SELECT : `$${price.toFixed(2)}`}
              </span>
              {label.actualNote && (
                <span className="block font-body text-[10px] leading-4 text-charcoal/45">{label.actualNote}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
