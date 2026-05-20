'use client'

import PlainTextField from './PlainTextField'
import RichTextField from './RichTextField'
import EmailField from './EmailField'
import BooleanField from './BooleanField'
import SelectField from './SelectField'
import ImageField from './ImageField'
import SortableList from './SortableList'
import ProductPickerField from './ProductPickerField'
import type { FieldSchema } from '@/lib/page-editor/types'

interface Props {
  field: FieldSchema
  parent: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  disabled?: boolean
}

export default function FieldRenderer({ field, parent, onChange, disabled }: Props) {
  if (field.kind === 'group') {
    // When the group has a key, scope its children into parent[key].
    // Used to edit nested JSON like page_blocks.config without
    // flattening it on the wire.
    const groupKey = field.key
    const scopedParent = groupKey
      ? ((parent[groupKey] as Record<string, unknown> | undefined) ?? {})
      : parent
    const scopedOnChange = groupKey
      ? (next: Record<string, unknown>) => onChange({ ...parent, [groupKey]: next })
      : onChange
    return (
      <div className="rounded-sm border border-charcoal/10 bg-cream/30 p-4">
        {field.label && (
          <h4 className="mb-1 font-body text-sm font-semibold text-charcoal">{field.label}</h4>
        )}
        {field.description && (
          <p className="mb-3 font-body text-xs text-charcoal/45">{field.description}</p>
        )}
        <div className="space-y-4">
          {field.fields.map((f, i) => (
            <FieldRenderer
              key={`${('key' in f ? f.key : 'group')}-${i}`}
              field={f}
              parent={scopedParent}
              onChange={scopedOnChange}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    )
  }

  const setValue = (next: unknown) => {
    onChange({ ...parent, [field.key]: next })
  }

  const current = parent[field.key]

  switch (field.kind) {
    case 'plain-text':
      return <PlainTextField field={field} value={current as string | null | undefined} onChange={setValue} disabled={disabled} />
    case 'rich-text':
      return <RichTextField field={field} value={current as string | null | undefined} onChange={setValue} disabled={disabled} />
    case 'email':
      return <EmailField field={field} value={current as string | null | undefined} onChange={setValue} disabled={disabled} />
    case 'boolean':
      return <BooleanField field={field} value={current as boolean | null | undefined} onChange={setValue} disabled={disabled} />
    case 'select':
      return <SelectField field={field} value={current as string | null | undefined} onChange={setValue} disabled={disabled} />
    case 'image':
      return <ImageField field={field} parent={parent} onChange={onChange} disabled={disabled} />
    case 'product-picker':
      return <ProductPickerField field={field} parent={parent} onChange={onChange} disabled={disabled} />
    case 'sortable-list':
      return (
        <SortableList
          field={field}
          value={current as Array<Record<string, unknown>> | null | undefined}
          onChange={(next) => setValue(next)}
          disabled={disabled}
        />
      )
  }
}
