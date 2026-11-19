import sharp from 'sharp'

// Compare every decoded channel in sRGB. Streaming bounds memory and avoids
// multi-gigabyte temporary raw images; this is not a thumbnail comparison.
export async function measureQuality(source, delivery) {
  const decode = file => sharp(file, { limitInputPixels: false }).removeAlpha().toColourspace('srgb').raw()
  const left = decode(source), right = decode(delivery)
  const iterator = right[Symbol.asyncIterator]()
  let pending = Buffer.alloc(0), position = 0, channels = 0, squared = 0, absolute = 0, maxDifference = 0
  try {
    for await (const chunk of left) {
      let offset = 0
      while (offset < chunk.length) {
        if (position === pending.length) {
          const next = await iterator.next()
          if (next.done) throw new Error('Pixel dimensions changed')
          pending = next.value; position = 0
        }
        const count = Math.min(chunk.length - offset, pending.length - position)
        for (let i = 0; i < count; i++) {
          const d = Math.abs(chunk[offset + i] - pending[position + i])
          squared += d * d; absolute += d; maxDifference = Math.max(maxDifference, d)
        }
        offset += count; position += count; channels += count
      }
    }
    if (position !== pending.length || !(await iterator.next()).done || !channels) throw new Error('Pixel dimensions changed')
  } finally { left.destroy(); right.destroy() }
  const psnrDb = squared ? 10 * Math.log10(255 * 255 / (squared / channels)) : 100
  if (psnrDb < 48) throw new Error(`Full-resolution quality comparison failed: ${psnrDb.toFixed(2)} dB. Manual print preparation is required.`)
  return { comparedChannels: channels, psnrDb, meanAbsoluteDifference: absolute / channels, maxDifference }
}
