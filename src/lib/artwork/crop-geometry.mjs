/** Shared browser/worker geometry. Every operation preserves original pixels. */
export const MAX_MASTER_PIXELS = 180_000_000

const finiteNumber = value => typeof value === 'number' && Number.isFinite(value)
const gcd = (a, b) => b === 0 ? a : gcd(b, a % b)

function validatePixels(width, height, label) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error(`${label} dimensions must be positive whole pixels.`)
  }
  if (width > MAX_MASTER_PIXELS / height) {
    throw new Error(`${label} exceeds the 180 million pixel processing limit. Choose a smaller selection or a closer shape.`)
  }
}

function hundredths(value) {
  if (!finiteNumber(value) || value < 1 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) {
    throw new Error('Output dimensions must be from 1 to 100 inches in increments of 0.01 inch.')
  }
  return Math.round(value * 100)
}

/** Absolute source-pixel extraction plus optional centered white padding. */
export function planMasterCrop({ sourceWidth, sourceHeight, cropBox, output = null }) {
  validatePixels(sourceWidth, sourceHeight, 'Source')
  if (!cropBox || ![cropBox.x, cropBox.y, cropBox.w, cropBox.h].every(finiteNumber)
    || cropBox.x < 0 || cropBox.y < 0 || cropBox.w <= 0 || cropBox.h <= 0
    || cropBox.x >= 1 || cropBox.y >= 1
    || cropBox.x + cropBox.w > 1 + 1e-9 || cropBox.y + cropBox.h > 1 + 1e-9) {
    throw new Error('The selected crop must stay inside the original artwork.')
  }
  // Preserve the established normalized-selection rounding, including a minimum
  // one-pixel selection. Browser and renderer must use this same calculation.
  const left = Math.min(sourceWidth - 1, Math.round(cropBox.x * sourceWidth))
  const top = Math.min(sourceHeight - 1, Math.round(cropBox.y * sourceHeight))
  const selection = {
    left, top,
    width: Math.max(1, Math.min(sourceWidth - left, Math.round(cropBox.w * sourceWidth))),
    height: Math.max(1, Math.min(sourceHeight - top, Math.round(cropBox.h * sourceHeight))),
  }
  const extract = { ...selection }
  const padding = { left: 0, right: 0, top: 0, bottom: 0 }
  let width = selection.width
  let height = selection.height
  if (output !== null) {
    if (typeof output !== 'object' || output.version !== 1 || !['crop', 'pad'].includes(output.fit)
      || Object.keys(output).some(key => !['version', 'fit', 'width_in', 'height_in'].includes(key))) {
      throw new Error('Choose a valid output shape and either trim or white padding.')
    }
    const w100 = hundredths(output.width_in)
    const h100 = hundredths(output.height_in)
    const divisor = gcd(w100, h100)
    const unitW = w100 / divisor
    const unitH = h100 / divisor
    const multiplier = output.fit === 'crop'
      ? Math.floor(Math.min(selection.width / unitW, selection.height / unitH))
      : Math.ceil(Math.max(selection.width / unitW, selection.height / unitH))
    if (multiplier < 1) {
      throw new Error('The selected area is too small to make that exact shape without resampling. Select more artwork or choose a simpler shape.')
    }
    width = multiplier * unitW
    height = multiplier * unitH
    validatePixels(width, height, 'Output')
    if (output.fit === 'crop') {
      extract.left += Math.floor((selection.width - width) / 2)
      extract.top += Math.floor((selection.height - height) / 2)
      extract.width = width
      extract.height = height
    } else {
      padding.left = Math.floor((width - selection.width) / 2)
      padding.right = width - selection.width - padding.left
      padding.top = Math.floor((height - selection.height) / 2)
      padding.bottom = height - selection.height - padding.top
    }
  }
  return {
    source: { width: sourceWidth, height: sourceHeight }, selection, extract, padding, width, height,
    removedPixels: selection.width * selection.height - extract.width * extract.height,
    addedPixels: width * height - extract.width * extract.height,
  }
}
