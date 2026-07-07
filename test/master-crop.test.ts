// @vitest-environment node
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { applyMasterCrop } from '../scripts/lib/crop-transform.mjs'

describe('master crop transform (Phase 1 worker)', () => {
  // Output is lossless PNG (not TIFF): the LumaPrints order API rejects TIFF
  // file URLs — sandbox-verified 2026-07-07. Source scans may still be TIFF.
  it('full_bleed: lossless PNG, exact crop dims, DPI preserved, original untouched', async () => {
    const src = await sharp({ create: { width: 1000, height: 800, channels: 3, background: { r: 120, g: 60, b: 200 } } })
      .withMetadata({ density: 600 })
      .tiff({ compression: 'deflate' })
      .toBuffer()

    const out = await applyMasterCrop(src, {
      cropBox: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      borderMode: 'full_bleed',
      dpi: 600,
      widthPx: 1000,
      heightPx: 800,
    })

    const meta = await sharp(out.buffer).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(500) // 0.5 × 1000
    expect(meta.height).toBe(400) // 0.5 × 800
    expect(out.width).toBe(500)
    expect(out.height).toBe(400)
    // PNG stores density as integer pixels-per-metre (pHYs), so round-trip can
    // be off by <0.5 DPI — assert to the nearest whole DPI.
    expect(meta.density).toBeCloseTo(600, 0) // DPI carried through

    // The source buffer is never mutated.
    const srcMeta = await sharp(src).metadata()
    expect(srcMeta.width).toBe(1000)
    expect(srcMeta.height).toBe(800)
  })

  it('matte: pads a border that preserves the crop aspect', async () => {
    const src = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 10, g: 10, b: 10 } } })
      .tiff()
      .toBuffer()

    const out = await applyMasterCrop(src, {
      cropBox: { x: 0, y: 0, w: 0.6, h: 0.6 },
      borderMode: 'matte',
      borderColor: '#ffffff',
      dpi: 300,
      widthPx: 1000,
      heightPx: 1000,
      matteFraction: 0.05,
    })

    // crop 600×600, +5% per side → 600 + 60 = 660, aspect preserved (1:1)
    expect(out.width).toBe(660)
    expect(out.height).toBe(660)
    expect(out.width / out.height).toBeCloseTo(1, 6)
    expect((await sharp(out.buffer).metadata()).format).toBe('png')
  })

  it('losslessness: a flat-color crop round-trips to the exact source color', async () => {
    const src = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 33, g: 99, b: 200 } } })
      .tiff()
      .toBuffer()

    const out = await applyMasterCrop(src, {
      cropBox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      borderMode: 'full_bleed',
      dpi: 300,
      widthPx: 400,
      heightPx: 400,
    })

    // Compare the output crop's center pixel to the SOURCE pixel at the same
    // location (both decoded identically) — a pure crop resamples nothing, so
    // they must be byte-identical (immune to any uniform decode color mgmt).
    const srcRaw = await sharp(src).raw().toBuffer({ resolveWithObject: true })
    const outRaw = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true })
    expect(outRaw.info.width).toBe(200)
    // crop is x∈[100,300), y∈[100,300); center of crop in source = (200,200).
    const sIdx = (200 * srcRaw.info.width + 200) * srcRaw.info.channels
    const oIdx = (100 * outRaw.info.width + 100) * outRaw.info.channels
    expect([outRaw.data[oIdx], outRaw.data[oIdx + 1], outRaw.data[oIdx + 2]]).toEqual([
      srcRaw.data[sIdx],
      srcRaw.data[sIdx + 1],
      srcRaw.data[sIdx + 2],
    ])
  })
})
