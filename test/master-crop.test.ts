// @vitest-environment node
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { applyMasterCrop, applyMasterCropFile } from '../scripts/lib/crop-transform.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('master crop transform (Phase 1 worker)', () => {
  it('processes files without resizing and rejects mismatched source dimensions', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'crop-test-'))
    try {
      const source = join(folder, 'source.tif')
      const output = join(folder, 'print.png')
      await sharp({ create: { width: 64, height: 80, channels: 3, background: '#ff0000' } }).tiff().toFile(source)
      const options = { cropBox: { x: 0, y: 0, w: 1, h: 1 }, widthPx: 64, heightPx: 80, dpi: 300, verifyDimensions: true, timeoutSeconds: 10, limitInputPixels: 180_000_000 }
      expect(await applyMasterCropFile(source, output, options, 100_000)).toMatchObject({ width: 64, height: 80 })
      expect(await sharp(output).metadata()).toMatchObject({ width: 64, height: 80, format: 'png' })
      await expect(applyMasterCropFile(source, join(folder, 'wrong.png'), { ...options, heightPx: 78 }, 100_000)).rejects.toThrow(/dimensions do not match/)
      await expect(applyMasterCropFile(source, join(folder, 'too-large.png'), options, 1)).rejects.toThrow(/too large/)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
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

describe('artist-controlled orientation', () => {
  it.each([0, 90, 180, 270] as const)('honors EXIF before rotating %s degrees and crops the displayed pixels', async rotation => {
    // Four distinct quadrants make an incorrect rotation or crop order observable.
    const colors = [[255,0,0], [0,255,0], [0,0,255], [255,255,0]]
    const pixels = Buffer.alloc(40 * 60 * 3)
    for (let y = 0; y < 60; y++) for (let x = 0; x < 40; x++) {
      pixels.set(colors[(y >= 30 ? 2 : 0) + (x >= 20 ? 1 : 0)], (y * 40 + x) * 3)
    }
    const src = await sharp(pixels, { raw: { width: 40, height: 60, channels: 3 } }).withMetadata({ orientation: 3 }).png().toBuffer()
    const out = await applyMasterCrop(src, { cropBox: { x: 0, y: 0, w: 0.5, h: 0.5, orient: true, rotation }, widthPx: 40, heightPx: 60, verifyDimensions: true })
    const expected = [colors[3], colors[1], colors[0], colors[2]][rotation / 90]
    const raw = await sharp(out.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([raw.info.width, raw.info.height]).toEqual(rotation % 180 ? [30, 20] : [20, 30])
    expect([...raw.data.subarray(0,3)]).toEqual(expected)
    expect(await sharp(out.buffer).metadata()).toMatchObject({ orientation: 1 })
    expect(await sharp(src).metadata()).toMatchObject({ orientation: 3, width: 40, height: 60 })
    const legacy = await applyMasterCrop(src, { cropBox: { x: 0, y: 0, w: 0.5, h: 0.5 }, widthPx: 40, heightPx: 60 })
    expect([...(await sharp(legacy.buffer).removeAlpha().raw().toBuffer()).subarray(0,3)]).toEqual(colors[0])
  })

  it('plans an exact output in rotated dimensions and rejects arbitrary rotations', async () => {
    const src = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#ff0000' } }).withMetadata({ orientation: 6 }).png().toBuffer()
    const cropBox = { x: 0, y: 0, w: 1, h: 1, orient: true, rotation: 90 as const }
    const out = await applyMasterCrop(src, { cropBox, cropOutput: { version: 1, fit: 'pad', width_in: 3, height_in: 2 }, widthPx: 60, heightPx: 40 })
    expect([out.width, out.height]).toEqual([60, 40])
    // @ts-expect-error Deliberately exercise untrusted stored values.
    await expect(applyMasterCrop(src, { cropBox: { ...cropBox, rotation: 45 } })).rejects.toThrow('Invalid crop orientation')
  })
})
