'use client'

import type { BooleanFieldDef as Schema } from '@/lib/page-editor/types'

interface Props {
  field: Schema
  value: boolean | null | undefined
  onChange: (next: boolean) => void
  disabled?: boolean
}

export default function BooleanField({ field, value, onChange, disabled }: Props) {
  const checked = !!value
  return (
    <label className="flex cursor-pointer items-start gap-3 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-1 h-4 w-4 cursor-pointer accent-teal disabled:opacity-50"
      />
      <span>
        <span className="block font-body text-sm font-medium text-charcoal">{field.label}</span>
        {field.description && (
          <span className="mt-0.5 block font-body text-xs text-charcoal/50">{field.description}</span>
        )}
      </span>
    </label>
  )
}
