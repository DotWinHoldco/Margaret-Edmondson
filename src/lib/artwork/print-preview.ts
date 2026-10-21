import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import sharp from 'sharp'

export const PRINT_PREVIEW_MAX_EDGE = 1600
export const PRINT_PREVIEW_RECOVERY_MAX_BYTES = 100 * 1024 * 1024

/** Only a small derivative of the exact saved print is made public. */
export async function uploadPrintPreview(supabase: SupabaseClient, masterId: string, print: string | Buffer): Promise<string> {
  const preview = await sharp(print, { limitInputPixels: 180_000_000, sequentialRead: true })
    .rotate().resize({ width: PRINT_PREVIEW_MAX_EDGE, height: PRINT_PREVIEW_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 }).timeout({ seconds: 30 }).toBuffer()
  const path = `print-previews/${masterId}/${randomUUID()}.webp`
  const { error } = await supabase.storage.from('product-images').upload(path, preview, {
    contentType: 'image/webp', cacheControl: '31536000', upsert: false,
  })
  if (error) throw new Error('Could not save the storefront print preview')
  return path
}

/** Prepared jobs have no local output left. Bound this optional recovery step. */
export async function previewStoredPrint(supabase: SupabaseClient, masterId: string, printPath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('print-masters').createSignedUrl(printPath, 90)
  if (error || !data) throw new Error('Could not read the saved print for its preview')
  const signal = AbortSignal.timeout(35_000)
  const response = await fetch(data.signedUrl, { signal, redirect: 'error' })
  if (!response.ok || !response.body) throw new Error('Could not download the saved print for its preview')
  if (Number(response.headers.get('content-length')) > PRINT_PREVIEW_RECOVERY_MAX_BYTES) {
    await response.body.cancel()
    throw new Error('Saved print preview recovery exceeds its download limit')
  }
  const folder = await mkdtemp(join(tmpdir(), 'artbyme-preview-'))
  try {
    let bytes = 0
    const limiter = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > PRINT_PREVIEW_RECOVERY_MAX_BYTES ? new Error('Saved print preview recovery exceeds its download limit') : null, chunk)
    } })
    const input = join(folder, 'saved-print')
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), limiter, createWriteStream(input, { flags: 'wx' }), { signal })
    return await uploadPrintPreview(supabase, masterId, input)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}
