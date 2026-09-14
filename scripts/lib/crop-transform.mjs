// Pure master-crop transform (shared by the worker + its test). Given the source
// image bytes + a normalized crop box, it region-extracts the crop, optionally
// pads an aspect-preserving matte border, and re-encodes a LOSSLESS PNG with the
// DPI carried through. A pure crop resamples nothing → zero quality loss.
// PNG (not TIFF): the LumaPrints order API rejects TIFF file URLs outright —
// "not a valid file type. Please use a JPEG or PNG file." (sandbox-verified
// 2026-07-07 against a real master .tif). PNG is equally lossless.
import sharp from 'sharp'
import { createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline as streamPipeline } from 'node:stream/promises'

export const MATTE_FRACTION = 0.05 // per-side border = 5% of each axis (preserves aspect)

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)))

async function prepareMasterCrop(
  srcBuffer,
  { cropBox, borderMode = 'full_bleed', borderColor = '#ffffff', dpi = 300, widthPx, heightPx, matteFraction = MATTE_FRACTION, limitInputPixels = false, timeoutSeconds = 0, verifyDimensions = false },
) {
  const meta = await sharp(srcBuffer, { limitInputPixels }).metadata()
  if (verifyDimensions && ((widthPx && widthPx !== meta.width) || (heightPx && heightPx !== meta.height))) {
    throw new Error('The master file dimensions do not match its saved dimensions. Check the master artwork before retrying.')
  }
  const W = widthPx || meta.width
  const H = heightPx || meta.height
  if (!W || !H) throw new Error('could not determine source dimensions')

  const left = clampInt(cropBox.x * W, 0, W - 1)
  const top = clampInt(cropBox.y * H, 0, H - 1)
  const width = clampInt(cropBox.w * W, 1, W - left)
  const height = clampInt(cropBox.h * H, 1, H - top)

  let pipeline = sharp(srcBuffer, { limitInputPixels }).extract({ left, top, width, height })
  let outW = width
  let outH = height
  if (borderMode === 'matte') {
    const bx = Math.round(width * matteFraction)
    const by = Math.round(height * matteFraction)
    pipeline = pipeline.extend({ top: by, bottom: by, left: bx, right: bx, background: borderColor })
    outW = width + 2 * bx
    outH = height + 2 * by
  }

  const d = dpi && dpi > 0 ? Math.round(dpi) : 300
  if (timeoutSeconds) pipeline = pipeline.timeout({ seconds: timeoutSeconds })
  pipeline = pipeline
    .withMetadata({ density: d })
    .png({ compressionLevel: 9 })
  return { pipeline, width: outW, height: outH, dpi: d }
}

// Keep the small-image/manual-worker interface intact.
export async function applyMasterCrop(source, options) {
  const { pipeline, ...dimensions } = await prepareMasterCrop(source, options)
  return { ...dimensions, buffer: await pipeline.toBuffer() }
}

// Serverless path uses source/output FILES and caps disk use while writing.
export async function applyMasterCropFile(sourcePath, outputPath, options, maxOutputBytes) {
  const { pipeline, ...dimensions } = await prepareMasterCrop(sourcePath, options)
  let written = 0
  const limit = new Transform({
    transform(chunk, encoding, callback) {
      written += chunk.length
      callback(written > maxOutputBytes ? new Error('The cropped print file is too large for automatic processing. Ask support to process this master.') : null, chunk)
    },
  })
  await streamPipeline(pipeline, limit, createWriteStream(outputPath, { flags: 'wx' }))
  return dimensions
}
