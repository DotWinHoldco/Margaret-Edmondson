'use client'

// Authored by DotWin
// Step two (§7.1): the refinement inside a medium, along whatever axis the catalog
// uses for it (canvas depth, paper stock, frame profile, metal surface). Canvas
// depth remains visible for one finish so its explanation is always accessible.
//
// The chosen finish's own description sits under the row, and its `customer_note` is
// rendered as an advisory when the operator wrote one (F19).

import ChoiceHelp from './ChoiceHelp'
import { frameFamily, frameChoiceLabel } from './frame-choice'
import { providerFramePhoto } from './frame-photo'
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
  const paperFrame = chosen?.medium === 'framed_fine_art_paper'
  const canvas = chosen?.medium === 'canvas' || chosen?.medium === 'framed_canvas'
  const families = [...new Set(subcategories.map(s => frameFamily(s.frame_label ?? s.display_label)))].sort()
  const photo = paperFrame ? providerFramePhoto(chosen.frame_label ?? chosen.display_label, 'framed_fine_art_paper', false) : null
  return (
    <div className="mt-4">
      <span id="print-finish-label" className="block font-body text-xs font-medium uppercase tracking-wide text-charcoal/60">
        {chosen?.medium === 'canvas' || chosen?.medium === 'framed_canvas' ? 'Canvas Depth' : chosen?.medium === 'framed_fine_art_paper' ? 'Choose a frame' : 'Choose a paper'}
      </span>
      {paperFrame ? <>
        <select aria-labelledby="print-finish-label" value={value ?? ''} onChange={e => onSelect(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-charcoal/20 bg-white px-3 py-2.5 font-body text-sm text-charcoal focus-visible:outline-2 focus-visible:outline-teal">
          {families.map(family => <optgroup key={family} label={family}>
            {subcategories.filter(s => frameFamily(s.frame_label ?? s.display_label) === family).map(s => <option key={s.id} value={s.id}>{frameChoiceLabel(s.display_label)}</option>)}
          </optgroup>)}
        </select>
        {photo && <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.src} alt={`${chosen.display_label} frame sample`} className="h-16 w-16 shrink-0 object-contain" width={64} height={64} />
          <p className="font-body text-xs text-charcoal/65">{chosen.display_label}. See your selected frame around the artwork in the main preview.</p>
        </div>}
      </> : <div
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
      </div>}
      {canvas && <ChoiceHelp label="Canvas depth">
        <p>Depth is the thickness of the stretched canvas from front to back. A ¾-inch canvas has a slim profile; 1¼-inch and 1½-inch canvases project farther from the wall for a deeper gallery look. The artwork’s width and height stay the same.</p>
        {chosen?.medium === 'framed_canvas' && <p className="mt-2">A frame adds its own depth around the canvas.</p>}
      </ChoiceHelp>}
      {chosen?.description && (
        <p className="mt-1.5 font-body text-xs text-charcoal/55">{chosen.description}</p>
      )}
      {chosen?.customer_note && (
        <p className="mt-1 font-body text-xs text-gold">{chosen.customer_note}</p>
      )}
    </div>
  )
}
