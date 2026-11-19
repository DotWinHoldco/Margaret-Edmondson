// Provider delivery encoding is separate from archival originals and crop geometry.
import sharp from 'sharp'
import { measureQuality } from './image-quality.mjs'
import { stat } from 'node:fs/promises'

// Lumaprints documents 100 MB, not 100 MiB. Never round this up.
export const MAX_PROVIDER_IMAGE_BYTES = 100_000_000

export function providerImageProblem({ bytes, mimeType, path = '' }) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return 'The print file size could not be verified.'
  if (bytes > MAX_PROVIDER_IMAGE_BYTES) return 'The print file exceeds the print provider’s 100 MB limit. Prepare a smaller delivery file before retrying.'
  if (!['image/jpeg', 'image/png'].includes(mimeType) || !/\.(jpe?g|png)$/i.test(path)) {
    return 'The print provider requires a JPEG or PNG delivery file.'
  }
  return null
}

/** Keep compliant files byte-for-byte. Oversize crops get a separate full-resolution
 * high-quality JPEG, with 4:4:4 color and their original ICC/EXIF/DPI metadata. Never
 * resize, overwrite the input, discard transparency, or accept a copy below 48 dB PSNR. */
export async function prepareProviderImage(inputPath, jpegPath, maxBytes = MAX_PROVIDER_IMAGE_BYTES) {
  if (inputPath === jpegPath) throw new Error('The delivery file must not overwrite its source.')
  const source = await sharp(inputPath, { limitInputPixels: false }).metadata()
  const bytes = (await stat(inputPath)).size
  if (!['jpeg', 'png'].includes(source.format)) throw new Error('A JPEG or PNG crop is required.')
  if (bytes <= maxBytes) return { path: inputPath, bytes, format: source.format, mimeType: `image/${source.format}`, converted: false }
  if (source.hasAlpha && !(await sharp(inputPath, { limitInputPixels: false }).stats()).isOpaque) {
    throw new Error('This oversized artwork has transparency. Prepare an approved opaque delivery file; its pixels have not been changed.')
  }
  let jpegQuality = 100
  for (; jpegQuality >= 95; jpegQuality--) {
    await sharp(inputPath, { limitInputPixels: false }).keepMetadata()
      .jpeg({ quality: jpegQuality, chromaSubsampling: '4:4:4', optimiseCoding: true }).toFile(jpegPath)
    if ((await stat(jpegPath)).size <= maxBytes) break
  }
  const delivery = await sharp(jpegPath, { limitInputPixels: false }).metadata()
  const deliveryBytes = (await stat(jpegPath)).size
  if (delivery.width !== source.width || delivery.height !== source.height
    || (source.density && Math.abs((delivery.density ?? 0) - source.density) > 1)
    || !Buffer.from(source.icc ?? []).equals(Buffer.from(delivery.icc ?? []))
    || delivery.orientation !== source.orientation) {
    throw new Error('The delivery file did not preserve the crop dimensions, orientation, or color profile.')
  }
  if (deliveryBytes > maxBytes) throw new Error('A full-resolution delivery file could not meet the provider limit at the permitted quality. Manual print preparation is required.')
  const quality = await measureQuality(inputPath, jpegPath)
  return { jpegQuality, quality, path: jpegPath, bytes: deliveryBytes, format: 'jpeg', mimeType: 'image/jpeg', converted: true }
}
