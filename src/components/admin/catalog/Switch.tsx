'use client'
// Authored by DotWin
// The one switch the catalog manager uses. A button with role="switch" and an
// aria-checked state rather than a checkbox, so a screen reader announces "on"/"off"
// and the acceptance walks can find each toggle by its label.

interface Props {
  checked: boolean
  /** The accessible name — what this switch turns on, in words, e.g. "Frame Style enabled". */
  label: string
  disabled?: boolean
  onChange: (next: boolean) => void
}

/** A labelled on/off switch. Disabled when the row is blocked or a write is in flight. */
export default function Switch({ checked, label, disabled = false, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-teal' : 'bg-charcoal/25'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
