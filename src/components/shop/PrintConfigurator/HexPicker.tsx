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
    </div>
  )
}
