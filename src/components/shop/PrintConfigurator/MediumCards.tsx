'use client'

// Authored by DotWin
// Step one of the purchase panel (§7.1): the mediums this artwork is actually sold in,
// each with the cheapest size it starts at. A medium only appears when the catalog can
// sell at least one of its finishes AND the artwork has a Live variant in it, so a card
// is never a door into an empty configurator.

export interface MediumCard {
  medium: string
  label: string
  /** Cheapest Live variant price in this medium, default configuration. */
  fromPrice: number
}

export default function MediumCards({
  cards,
  value,
  onSelect,
}: {
  cards: MediumCard[]
  value: string | null
  onSelect: (medium: string) => void
}) {
  return (
    <div>
      <span id="print-medium-label" className="block font-body text-xs font-medium uppercase tracking-wide text-charcoal/60">
        Choose a print
      </span>
      <div
        role="radiogroup"
        aria-labelledby="print-medium-label"
        className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3"
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
          if (target?.dataset.medium) onSelect(target.dataset.medium)
        }}
      >
        {cards.map((card, index) => {
          const checked = card.medium === value
          return (
            <button
              key={card.medium}
              type="button"
              role="radio"
              aria-checked={checked}
              data-medium={card.medium}
              tabIndex={checked || (value === null && index === 0) ? 0 : -1}
              onClick={() => onSelect(card.medium)}
              className={`rounded-sm border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-teal ${
                checked ? 'border-teal bg-teal/5' : 'border-charcoal/15 bg-white hover:border-teal/50'
              }`}
            >
              <span className="block font-body text-sm font-medium text-charcoal">{card.label}</span>
              <span className="mt-0.5 block font-body text-xs text-charcoal/55">
                from ${card.fromPrice.toFixed(2)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
