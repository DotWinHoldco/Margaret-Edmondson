'use client'

// Authored by DotWin
// Step two (§7.1): the refinement inside a medium, along whatever axis the catalog
// uses for it (canvas depth, paper stock, frame profile, metal surface). It is rendered
// only when the medium has more than one sellable finish, because a chip row with one
// chip is a decision nobody asked for.
//
// The chosen finish's own description sits under the row, and its `customer_note` is
// rendered as an advisory when the operator wrote one (F19).

import type { StorefrontSubcategory } from '@/lib/catalog/storefront'

export default function SubcategoryPicker({
  subcategories,
  value,
  onSelect,
}: {
  subcategories: StorefrontSubcategory[]
  value: string | null
  onSelect: (subcategoryRef: string) => void
}) {
  const chosen = subcategories.find((subcategory) => subcategory.id === value) ?? null
  return (
    <div className="mt-4">
      <span id="print-finish-label" className="block font-body text-xs font-medium uppercase tracking-wide text-charcoal/60">
        Choose a finish
      </span>
      <div
        role="radiogroup"
        aria-labelledby="print-finish-label"
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
          if (target?.dataset.subcategory) onSelect(target.dataset.subcategory)
        }}
      >
        {subcategories.map((subcategory, index) => {
          const checked = subcategory.id === value
          return (
            <button
              key={subcategory.id}
              type="button"
              role="radio"
              aria-checked={checked}
              data-subcategory={subcategory.id}
              tabIndex={checked || (value === null && index === 0) ? 0 : -1}
              onClick={() => onSelect(subcategory.id)}
              className={`rounded-sm border px-3 py-2 font-body text-sm transition-colors focus-visible:outline-2 focus-visible:outline-teal ${
                checked ? 'border-teal bg-teal/5 text-charcoal' : 'border-charcoal/15 bg-white text-charcoal/80 hover:border-teal/50'
              }`}
            >
              {subcategory.display_label}
            </button>
          )
        })}
      </div>
      {chosen?.description && (
        <p className="mt-1.5 font-body text-xs text-charcoal/55">{chosen.description}</p>
      )}
      {chosen?.customer_note && (
        <p className="mt-1 font-body text-xs text-gold">{chosen.customer_note}</p>
      )}
    </div>
  )
}
