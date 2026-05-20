'use client'

import type { EmailFieldDef as Schema } from '@/lib/page-editor/types'

interface Props {
  field: Schema
  value: string | null | undefined
  onChange: (next: string) => void
  disabled?: boolean
}

export default function EmailField({ field, value, onChange, disabled }: Props) {
  return (
    <div>
      <label className="mb-1.5 block font-body text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/55">
        {field.label}
      </label>
      <input
        type="email"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? 'name@example.com'}
        disabled={disabled}
        className="w-full rounded-sm border border-charcoal/15 bg-cream/40 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/35 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30 disabled:opacity-60"
      />
      {field.description && (
        <p className="mt-1 font-body text-xs text-charcoal/45">{field.description}</p>
      )}
    </div>
  )
}
