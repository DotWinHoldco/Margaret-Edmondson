import type { SupabaseClient } from '@supabase/supabase-js'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import sharp from 'sharp'
import { Upload } from 'tus-js-client'
import { applyMasterCropFile } from '../../../scripts/lib/crop-transform.mjs'

export const MAX_CROP_SOURCE_BYTES = 100 * 1024 * 1024
const MAX_OUTPUT_BYTES = 350 * 1024 * 1024
const MAX_INPUT_PIXELS = 180_000_000
const BUCKET = 'print-masters'
const COLUMNS = 'id, storage_path, file_size_bytes, width_px, height_px, dpi, crop_box, border_mode, border_color, print_requested_at, print_storage_path'
// One memory-heavy job per warm runtime; other queued jobs are picked up by cron.
let busy = false

export interface CropJob {
  id: string; storage_path: string; file_size_bytes: number | null
  width_px: number; height_px: number; dpi: number | null
  crop_box: { x: number; y: number; w: number; h: number }
  border_mode: string; border_color: string | null; print_requested_at: string
  /** The print file in service before this job; null for a master that never had one. */
  print_storage_path?: string | null
}

/**
 * What a failed job leaves behind. A master that already has a print file KEEPS it in
 * service (`print_status` back to `ready`, the failure recorded in `print_error`), because
 * every consumer — the storefront listing, the quote route, checkout, fulfillment — reads
 * `print_status = 'ready'` and a failed re-crop used to take the product off the shelf until
 * someone noticed (2026-09-17: two artworks unsellable for days over an upload that never
 * touched the old file). A master with no file yet is simply `failed`.
 */
export function failedJobState(previousPrintPath: string | null | undefined, message: string) {
  const text = message.slice(0, 500)
  return previousPrintPath
    ? { print_status: 'ready', print_error: `Last crop failed: ${text} The previous print file is still in use.`.slice(0, 500) }
    : { print_status: 'failed', print_error: text }
}

/**
 * The upload library reports every failure as one callback; the storage service's own
 * answer (413 for a file over the project's upload limit, 401 for an expired token) is
 * the part worth reading, so it is pulled out of the error and put in the log and the
 * message the admin sees.
 */
export function uploadErrorDetail(err: unknown, sizeBytes: number): string {
  const e = err as { message?: string; originalResponse?: { getStatus?: () => number; getBody?: () => string } | null } | null
  const status = e?.originalResponse?.getStatus?.()
  const body = (e?.originalResponse?.getBody?.() ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
  const mb = (sizeBytes / 1048576).toFixed(0)
  if (status) return `the storage service answered ${status}${body ? ` (${body})` : ''} for a ${mb} MB file`
  const message = (e?.message ?? (err == null ? '' : String(err))).slice(0, 160)
  return `${message || 'unknown error'} for a ${mb} MB file`
}

export function validateCropJob(job: CropJob) {
  if (Number(job.file_size_bytes) > MAX_CROP_SOURCE_BYTES) {
    throw new Error('This master is over 100 MB. Ask support to process it, or upload a smaller lossless master. The original file has not changed.')
  }
  if (!(job.width_px > 0 && job.height_px > 0) || job.width_px * job.height_px > MAX_INPUT_PIXELS) {
    throw new Error('Automatic crops support master files up to 180 million pixels. Check the master dimensions or ask support.')
  }
  const c = job.crop_box
  if (!c || ![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.x < 0 || c.y < 0 || c.w <= 0 || c.h <= 0 || c.x + c.w > 1.000001 || c.y + c.h > 1.000001) {
    throw new Error('The crop extends outside the artwork. Open Crop and save a new crop.')
  }
}

async function renderAndUpload(supabase: SupabaseClient, job: CropJob) {
  validateCropJob(job)
  const folder = await mkdtemp(join(tmpdir(), 'artbyme-crop-'))
  const source = join(folder, 'source')
  const output = join(folder, 'print.png')
  const objectName = `print/${job.id}-${randomUUID()}.png`
  try {
    const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(job.storage_path, 300)
    if (error || !signed) throw new Error('Could not read the original master. Try saving the crop again.')
    const signal = AbortSignal.timeout(45_000)
    const response = await fetch(signed.signedUrl, { signal, redirect: 'error' })
    if (!response.ok || !response.body) throw new Error('Could not download the original master. Try saving the crop again.')
    let bytes = 0
    const limiter = new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length
      callback(bytes > MAX_CROP_SOURCE_BYTES ? new Error('This master is over 100 MB. Ask support to process this file.') : null, chunk)
    } })
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), limiter, createWriteStream(source, { flags: 'wx' }), { signal })
    sharp.cache(false)
    sharp.concurrency(1)
    const dimensions = await applyMasterCropFile(source, output, {
      cropBox: job.crop_box, borderMode: job.border_mode, borderColor: job.border_color || '#ffffff',
      dpi: job.dpi || 300, widthPx: job.width_px, heightPx: job.height_px,
      limitInputPixels: MAX_INPUT_PIXELS, timeoutSeconds: 150, verifyDimensions: true,
    }, MAX_OUTPUT_BYTES)
    // Signed upload tokens preserve admin RLS for the immediate worker. The cron
    // obtains its token with its legitimate service-role client, never a user key.
    const { data: upload, error: uploadError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(objectName)
    if (uploadError || !upload) throw new Error('Could not save the print file. Try saving the crop again.')
    const size = (await stat(output)).size
    const storageUrl = new URL(upload.signedUrl)
    if (storageUrl.hostname.endsWith('.supabase.co') && !storageUrl.hostname.endsWith('.storage.supabase.co')) {
      storageUrl.hostname = storageUrl.hostname.replace('.supabase.co', '.storage.supabase.co')
    }
    storageUrl.pathname = '/storage/v1/upload/resumable'
    storageUrl.search = ''
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(output)
      const finish = (error?: Error) => {
        clearTimeout(timer)
        stream.destroy()
        if (error) reject(error); else resolve()
      }
      const task = new Upload(stream, {
        endpoint: storageUrl.toString(), uploadSize: size,
        headers: { 'x-signature': upload.token },
        metadata: { bucketName: BUCKET, objectName, contentType: 'image/png', cacheControl: '3600' },
        chunkSize: 6 * 1024 * 1024, retryDelays: [0, 1000, 3000], storeFingerprintForResuming: false,
        onError: (err) => {
          const detail = uploadErrorDetail(err, size)
          console.error('[crop] upload failed', JSON.stringify({ master: job.id, objectName, sizeBytes: size, detail }))
          finish(new Error(`Could not upload the cropped print file: ${detail}. Try saving the crop again.`))
        },
        onSuccess: () => finish(),
      })
      const timer = setTimeout(() => {
        void task.abort().catch(() => {})
        finish(new Error('Saving the print file took too long. Try saving the crop again.'))
      }, 70_000)
      task.start()
    })
    return { objectName, width: dimensions.width, height: dimensions.height }
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

type Renderer = typeof renderAndUpload

/** Atomic claim + request timestamp fence: an old crop can never replace a newer one. */
export async function processMasterCrop(supabase: SupabaseClient, id: string, requestedAt: string, render: Renderer = renderAndUpload) {
  if (busy) return 'queued' as const
  busy = true
  try {
    const { data, error } = await supabase.from('master_artworks')
      .update({ print_status: 'processing', print_error: null, updated_at: new Date().toISOString() })
      .eq('id', id).eq('print_status', 'pending').eq('print_requested_at', requestedAt)
      .select(COLUMNS).maybeSingle()
    if (error) throw new Error('Could not claim the crop job')
    if (!data) return 'skipped' as const
    const job = data as CropJob
    try {
      validateCropJob(job)
      const result = await render(supabase, job)
      const { data: saved, error: saveError } = await supabase.from('master_artworks').update({
        print_storage_path: result.objectName, print_width_px: result.width, print_height_px: result.height,
        print_status: 'ready', print_error: null, print_updated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', id).eq('print_status', 'processing').eq('print_requested_at', requestedAt).select('id').maybeSingle()
      if (saveError) throw new Error('The print file was made, but its status could not be saved. Try saving the crop again.')
      // Keep even superseded versioned outputs; deleting after an uncertain DB
      // response could break an order that already captured this exact path.
      return saved ? 'ready' as const : 'superseded' as const
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Processing failed. Try saving the crop again.'
      const { error: statusError } = await supabase.from('master_artworks')
        .update({ ...failedJobState(job.print_storage_path, message), updated_at: new Date().toISOString() })
        .eq('id', id).eq('print_status', 'processing').eq('print_requested_at', requestedAt)
      if (statusError) throw new Error('Could not save crop failure status')
      return 'failed' as const
    }
  } finally {
    busy = false
  }
}

export async function recoverInterruptedCrops(supabase: SupabaseClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - 10 * 60_000).toISOString()
  const message = 'Processing was interrupted. Open Crop and save the crop again to retry.'
  // Two updates, one per outcome: a master with a print file keeps it in service.
  const { data: kept, error: keptError } = await supabase.from('master_artworks').update({
    ...failedJobState('previous', message), updated_at: now.toISOString(),
  }).eq('print_status', 'processing').lt('updated_at', cutoff).not('print_storage_path', 'is', null).select('id')
  if (keptError) throw new Error('Could not recover interrupted crops')
  const { data: failed, error: failedError } = await supabase.from('master_artworks').update({
    ...failedJobState(null, message), updated_at: now.toISOString(),
  }).eq('print_status', 'processing').lt('updated_at', cutoff).is('print_storage_path', null).select('id')
  if (failedError) throw new Error('Could not recover interrupted crops')
  return (kept?.length || 0) + (failed?.length || 0)
}
