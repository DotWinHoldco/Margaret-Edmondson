'use client'

// Authored by DotWin
// Step three (§7.1): the Live sizes this finish can take, smallest first, each showing
// the price of its DEFAULT configuration. The number here is the variant's own stored
// price and never a computed one; the configured price comes from the server and is
// shown once, on the button.
//
// Sizes outside the finish's bounds are absent rather than disabled: a size that cannot
// be printed at all is not a choice a shopper needs explained.

import { printSizeLabel } from '@/lib/pricing/print-size-label'
import type { PrintVariant } from './catalog-view'

export default function SizePicker({
  variants,
  value,
  onSelect,
}: {
  variants: PrintVariant[]
  value: string | null
  onSelect: (variantId: string) => void
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
              <span className="block font-body text-xs text-charcoal/55">${variant.price.toFixed(2)}</span>
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
