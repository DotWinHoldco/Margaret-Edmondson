'use client'

import RichTextEditor from '@/components/admin/RichTextEditor'
import type { RichTextField as Schema } from '@/lib/page-editor/types'

interface Props {
  field: Schema
  value: string | null | undefined
  onChange: (next: string) => void
  disabled?: boolean
}

export default function RichTextField({ field, value, onChange, disabled }: Props) {
  return (
    <div>
      <label className="mb-1.5 block font-body text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/55">
        {field.label}
      </label>
      <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
        <RichTextEditor
          content={value ?? ''}
          onChange={onChange}
          minHeight={field.minHeight ?? '140px'}
          placeholder={field.placeholder}
        />
      </div>
      {field.description && (
        <p className="mt-1 font-body text-xs text-charcoal/45">{field.description}</p>
      )}
    </div>
  )
}
