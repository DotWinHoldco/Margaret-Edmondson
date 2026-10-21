// Authored by DotWin
// Build a reusable, private paper derivative BEFORE payment. The snapshot freezes its
// immutable path; fulfillment never changes the paid file or modifies the canvas master.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import sharp from 'sharp'
import { PAPER_BORDER_IN, paperBorderLayout } from './paper-border'

const BUCKET = 'print-masters'
const MAX_BYTES = 350 * 1024 * 1024
const MAX_PIXELS = 180_000_000

/** Limit bytes while streaming; a malformed source cannot fill the runtime's disk. */
function byteLimit() {
  let bytes = 0
  return new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length
    callback(bytes > MAX_BYTES ? new Error('Paper print file exceeds processing limit') : null, chunk)
  } })
}

/** Lossless output, exact paper aspect, white on all four sides, no artwork distortion. */
export async function renderPaperPrint(source: string, output: string, widthIn: number, heightIn: number) {
  const metadata = await sharp(source, { limitInputPixels: MAX_PIXELS }).metadata()
  const box = paperBorderLayout(metadata.width ?? 0, metadata.height ?? 0, widthIn, heightIn)
  const transform = sharp(source, { limitInputPixels: MAX_PIXELS })
    .resize(box.width - 2 * box.border, box.height - 2 * box.border, { fit: 'contain', background: '#ffffff' })
    .extend({ top: box.border, bottom: box.border, left: box.border, right: box.border, background: '#ffffff' })
    .withMetadata({ density: Math.max(1, Math.round(box.density)) })
    .png({ compressionLevel: 6 }).timeout({ seconds: 90 })
  await pipeline(transform, byteLimit(), createWriteStream(output, { flags: 'wx' }))
  return box
}

/** Create once per immutable cropped master and paper size; failed preparation stops checkout. */
export async function preparePaperPrint(client: SupabaseClient, sourcePath: string, widthIn: number, heightIn: number): Promise<string> {
  paperBorderLayout(1000, 1000, widthIn, heightIn)
  const hash = createHash('sha256').update(JSON.stringify(['paper-border-v1', sourcePath, widthIn, heightIn, PAPER_BORDER_IN])).digest('hex')
  const destination = `paper/${hash}.png`
  const bucket = client.storage.from(BUCKET)
  const { data: exists, error: existsError } = await bucket.exists(destination)
  // Storage HEAD returns an error alongside data=false for a missing object.
  // Auth/network failures still stop checkout; a validated hash path may be created.
  if (existsError && !('status' in existsError && [400, 404].includes(Number(existsError.status)))) {
    throw new Error('Could not check the paper print file')
  }
  if (exists) return destination
  const folder = await mkdtemp(join(tmpdir(), 'artbyme-paper-'))
  try {
    const { data: signed, error } = await bucket.createSignedUrl(sourcePath, 300)
    if (error || !signed) throw new Error('Could not read the cropped artwork')
    const source = join(folder, 'source'), output = join(folder, 'paper.png')
    const signal = AbortSignal.timeout(90_000)
    const response = await fetch(signed.signedUrl, { signal, redirect: 'error' })
    if (!response.ok || !response.body) throw new Error('Could not load the cropped artwork')
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), byteLimit(), createWriteStream(source, { flags: 'wx' }), { signal })
    await renderPaperPrint(source, output, widthIn, heightIn)
    const stream = createReadStream(output)
    try {
      const { error: uploadError } = await bucket.upload(destination, stream, {
        contentType: 'image/png', upsert: false, duplex: 'half',
        cacheControl: '31536000', headers: { 'Content-Length': String((await stat(output)).size) },
      })
      if (uploadError) {
        // A concurrent checkout may have finished the exact same immutable file.
        const check = await bucket.exists(destination)
        if (check.error || !check.data) throw new Error('Could not save the paper print file')
      }
    } finally { stream.destroy() }
    return destination
  } finally { await rm(folder, { recursive: true, force: true }) }
}
