'use client'
// Authored by DotWin
// The preview material for one option (ADR-6): a colour, an image, and — for a frame
// style — the two measurements the PDP draws the moulding with.
//
// Every save sends the WHOLE swatch object, merged from what is already stored, because
// the RPC replaces the column rather than merging into it: sending only `color_hex` on an
// option that has an image would drop the image. The hex is validated here as well as in
// SQL so a typo never leaves the field, and an emptied field clears that key instead of
// storing an empty string.

import { useState } from 'react'
import MediaPicker from '@/components/admin/MediaPicker'
import type { CatalogOption, CatalogOptionGroup, Swatch } from '@/lib/catalog/types'
import { isFrameStyleGroup, type CatalogWriter } from '@/components/admin/catalog/shared'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

interface Props {
  group: CatalogOptionGroup
  option: CatalogOption
  writer: CatalogWriter
}

/** Merge one field into the stored swatch, dropping the keys that were cleared. */
function mergedSwatch(current: Swatch | null, change: Partial<Swatch>): Swatch {
  const next: Swatch = { ...(current ?? {}), ...change }
  for (const key of Object.keys(next) as Array<keyof Swatch>) {
    const value = next[key]
    if (value === undefined || value === null || value === '') delete next[key]
  }
  return next
}

/** The colour / image / frame-geometry editor for one option's swatch. */
export default function SwatchEditor({ group, option, writer }: Props) {
  const swatch = option.swatch ?? null
  const [hex, setHex] = useState(swatch?.color_hex ?? '')
  const [hexError, setHexError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const label = option.display_label || option.api_option_name

  async function save(change: Partial<Swatch>) {
    await writer.patch(`/api/admin/catalog/option/${option.id}`, {
      swatch: mergedSwatch(swatch, change),
    })
  }

  function commitHex() {
    const value = hex.trim()
    if (value === '') {
      setHexError(null)
      if (swatch?.color_hex) void save({ color_hex: undefined })
      return
    }
    if (!HEX_RE.test(value)) {
      setHexError('Use a colour like #1b2a3c.')
      return
    }
    setHexError(null)
    if (value.toLowerCase() === (swatch?.color_hex ?? '').toLowerCase()) return
    void save({ color_hex: value })
  }

  function commitNumber(field: 'frame_face_in' | 'frame_depth_in', raw: string) {
    const text = raw.trim()
    if (text === '') {
      if (swatch?.[field] !== undefined) void save({ [field]: undefined })
      return
    }
    const value = Number(text)
    if (!Number.isFinite(value) || value <= 0) return
    if (value === swatch?.[field]) return
    void save({ [field]: value })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        {swatch?.color_hex ? (
          <span
            aria-hidden
            className="inline-block h-5 w-5 rounded-sm border border-charcoal/20"
            style={{ backgroundColor: swatch.color_hex }}
          />
        ) : null}
        <input
          type="text"
          value={hex}
          aria-label={`Swatch colour for ${label}`}
          aria-invalid={hexError ? 'true' : undefined}
          placeholder="#rrggbb"
          onChange={(event) => {
            setHex(event.target.value)
            setHexError(null)
          }}
          onBlur={commitHex}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitHex()
          }}
          className="w-28 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
        />
        {hexError ? (
          <span role="alert" className="font-body text-[11px] text-coral">
            {hexError}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={writer.busy}
          className="rounded-sm border border-charcoal/15 px-2 py-1 font-body text-xs text-charcoal/70 transition-colors hover:bg-teal/5 disabled:opacity-40"
        >
          {swatch?.image_path ? 'Replace image' : 'Add image'}
        </button>
        {swatch?.image_path ? (
          <button
            type="button"
            onClick={() => void save({ image_path: undefined })}
            disabled={writer.busy}
            aria-label={`Remove swatch image for ${label}`}
            className="font-body text-[11px] text-charcoal/50 underline underline-offset-2 hover:text-coral disabled:opacity-40"
          >
            Remove image
          </button>
        ) : null}
      </div>

      {isFrameStyleGroup(group) ? (
        <div className="flex items-center gap-2">
          <label className="font-body text-[11px] text-charcoal/60">
            Face (in)
            <input
              type="number"
              step="0.01"
              min="0"
              defaultValue={swatch?.frame_face_in ?? ''}
              aria-label={`Frame face inches for ${label}`}
              onBlur={(event) => commitNumber('frame_face_in', event.target.value)}
              className="ml-1 w-16 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
            />
          </label>
          <label className="font-body text-[11px] text-charcoal/60">
            Depth (in)
            <input
              type="number"
              step="0.01"
              min="0"
              defaultValue={swatch?.frame_depth_in ?? ''}
              aria-label={`Frame depth inches for ${label}`}
              onBlur={(event) => commitNumber('frame_depth_in', event.target.value)}
              className="ml-1 w-16 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
            />
          </label>
        </div>
      ) : null}

      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(picked) => {
          setPicking(false)
          void save({ image_path: picked.url })
        }}
        defaultCategory="library"
        title="Choose a swatch image"
      />
    </div>
  )
}
