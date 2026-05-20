'use client'

import { useState } from 'react'
import Image from 'next/image'
import MediaPicker from '@/components/admin/MediaPicker'
import type { ImageField as Schema } from '@/lib/page-editor/types'

interface Props {
  field: Schema
  /** Object value for this image; we read field.key and field.altKey from it. */
  parent: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  disabled?: boolean
}

export default function ImageField({ field, parent, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const altKey = field.altKey ?? `${field.key}_alt`
  const url = (parent[field.key] as string | null | undefined) ?? null
  const alt = (parent[altKey] as string | null | undefined) ?? ''

  return (
    <div>
      <label className="mb-1.5 block font-body text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/55">
        {field.label}
      </label>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          className="group relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-sm border border-charcoal/15 bg-charcoal/[0.03] transition-colors hover:border-teal/50 disabled:opacity-60"
        >
          {url ? (
            <Image
              src={url}
              alt={alt}
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-charcoal/30">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </div>
          )}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-charcoal/40 font-body text-xs font-medium uppercase tracking-wider text-cream opacity-0 transition-opacity group-hover:opacity-100">
            {url ? 'Change' : 'Choose'}
          </span>
        </button>
        <div className="flex-1 space-y-2">
          <input
            type="text"
            value={alt}
            onChange={(e) => onChange({ ...parent, [altKey]: e.target.value })}
            placeholder="Alt text (describe the image)"
            disabled={disabled}
            className="w-full rounded-sm border border-charcoal/15 bg-cream/40 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/35 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30 disabled:opacity-60"
          />
          {url && (
            <button
              type="button"
              onClick={() => onChange({ ...parent, [field.key]: null, [altKey]: null })}
              disabled={disabled}
              className="font-body text-xs text-coral hover:underline disabled:opacity-50"
            >
              Remove image
            </button>
          )}
        </div>
      </div>
      {field.description && (
        <p className="mt-1 font-body text-xs text-charcoal/45">{field.description}</p>
      )}
      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        onPick={(picked) => {
          onChange({
            ...parent,
            [field.key]: picked.url,
            [altKey]: picked.alt_text ?? alt ?? '',
          })
          setOpen(false)
        }}
        defaultCategory={field.defaultCategory}
        initialFilter={field.defaultCategory}
        uploadBucket={field.uploadBucket}
        title={`Choose ${field.label.toLowerCase()}`}
      />
    </div>
  )
}
