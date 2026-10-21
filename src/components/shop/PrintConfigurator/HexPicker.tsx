'use client'

// Authored by DotWin
// The colour a Solid Color Wrap needs (ADR-4 `needs_hex`). The typed field is the
// record: it is what travels to the provider, so it is a labelled text input a screen
// reader and a keyboard can both work, and the native colour well beside it is a
// mirror for people who would rather point at a colour than spell one.
//
// Nothing is priced until the value is a real six digit hex, and the message saying so
// is the same sentence the server would answer with.

import { useId } from 'react'
import { HEX_PATTERN, isValidHex } from './catalog-view'

export default function HexPicker({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (next: string) => void
  label: string
}) {
  const id = useId()
  const valid = isValidHex(value)
  return (
    <div className="mt-2">
      <label htmlFor={`${id}-hex`} className="block font-body text-xs text-charcoal/70">
        {label} color
      </label>
      <div role="group" aria-label="Canvas side color" className="mt-2 flex gap-2">
        {[['Black', '#000000'], ['Grey', '#808080'], ['White', '#ffffff']].map(([name, color]) => (
          <button key={color} type="button" aria-pressed={value.toLowerCase() === color}
            onClick={() => onChange(color)}
            className={`flex items-center gap-2 rounded-sm border px-3 py-2 font-body text-sm ${value.toLowerCase() === color ? 'border-teal bg-teal/5' : 'border-charcoal/20 bg-white'}`}>
            <span aria-hidden="true" className="h-4 w-4 rounded-full border border-charcoal/20" style={{ backgroundColor: color }} />
            {name}
          </button>
        ))}
      </div>
      <details className="mt-2">
      <summary className="cursor-pointer font-body text-xs text-charcoal/60">Custom color</summary>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={`${id}-hex`}
          type="text"
          inputMode="text"
          spellCheck={false}
          autoComplete="off"
          pattern={HEX_PATTERN}
          placeholder="#1a1a1a"
          maxLength={7}
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
          aria-invalid={value.length > 0 && !valid}
          aria-describedby={`${id}-hint`}
          className="w-32 rounded-sm border border-charcoal/20 bg-white px-3 py-2 font-body text-sm text-charcoal focus-visible:outline-2 focus-visible:outline-teal"
        />
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={valid ? value : '#ffffff'}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 cursor-pointer rounded-sm border border-charcoal/20 bg-white p-1"
        />
      </div>
      <p id={`${id}-hint`} className="mt-1 font-body text-xs text-charcoal/55">
        {valid
          ? 'Your wrap color is set.'
          : 'That color is not a valid six digit hex code, for example #1a1a1a.'}
      </p>
      </details>
    </div>
  )
}
