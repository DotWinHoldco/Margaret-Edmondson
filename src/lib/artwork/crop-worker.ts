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
import { reconcileVariantsForMaster } from '@/lib/pricing/reconcile-variants'
import type { Catalog } from '@/lib/catalog/types'
import { previewStoredPrint, uploadPrintPreview } from '@/lib/artwork/print-preview'
import type { MasterCropOutput } from '@/lib/artwork/crop-geometry.mjs'

export const MAX_CROP_SOURCE_BYTES = 100 * 1024 * 1024
// Flower Power's verified lossless crop is 441.253 MiB. The Storage project
// and print-masters bucket both allow 500 MiB; leave room below that ceiling.
export const MAX_CROP_OUTPUT_BYTES = 450 * 1024 * 1024
const MAX_INPUT_PIXELS = 180_000_000
const BUCKET = 'print-masters'
const COLUMNS = 'id, storage_path, file_size_bytes, width_px, height_px, dpi, crop_box, crop_output, border_mode, border_color, print_requested_at, print_storage_path, print_width_px, print_height_px, print_updated_at, print_preview_storage_path'
// One memory-heavy job per warm runtime; other queued jobs are picked up by cron.
let busy = false

export interface CropJob {
  id: string; storage_path: string; file_size_bytes: number | null
  width_px: number | null; height_px: number | null; dpi: number | null
  crop_box: { x: number; y: number; w: number; h: number; rotation?: 0 | 90 | 180 | 270; orient?: boolean }
  crop_output?: MasterCropOutput | null
  border_mode: string; border_color: string | null; print_requested_at: string
  /** The print file in service before this job; null for a master that never had one. */
  print_storage_path?: string | null
  print_width_px?: number | null
  print_height_px?: number | null
  print_updated_at?: string | null
  print_preview_storage_path?: string | null
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

export function cropUploadHeaders(sessionToken: string, serviceKey: string, anonKey: string): Record<string, string> {
  const session = sessionToken.trim()
  const service = serviceKey.trim()
  const apiKey = anonKey.trim() || service
  return {
    ...(session
      ? { authorization: `Bearer ${session}`, apikey: apiKey }
      : service.startsWith('sb_') ? { apikey: service } : { authorization: `Bearer ${service}`, apikey: service }),
    'x-upsert': 'false',
  }
}

export function validateCropJob(job: CropJob) {
  if (Number(job.file_size_bytes) > MAX_CROP_SOURCE_BYTES) {
    throw new Error('This master is over 100 MB. Ask support to process it, or upload a smaller lossless master. The original file has not changed.')
  }
  // Browser uploads cannot read TIFF dimensions. Missing dimensions are read
  // from the original by sharp below, with the same pixel limit enforced there.
  // Reject invalid known values without confusing missing TIFF metadata with
  // an oversized image.
  if ((job.width_px != null && !(job.width_px > 0)) || (job.height_px != null && !(job.height_px > 0))
    || (job.width_px != null && job.height_px != null && job.width_px * job.height_px > MAX_INPUT_PIXELS)) {
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
      cropOutput: job.crop_output ?? null,
      dpi: job.dpi || 300, widthPx: job.width_px, heightPx: job.height_px,
      limitInputPixels: MAX_INPUT_PIXELS, timeoutSeconds: 150, verifyDimensions: true,
    }, MAX_CROP_OUTPUT_BYTES)
    const size = (await stat(output)).size
    // A signed upload token is for the Storage REST upload endpoint. It is not a
    // TUS authorization token: sending it as `x-signature` to the resumable
    // endpoint makes Storage try to parse it as a JWT and return
    // "Invalid Compact JWS" (the error shown in the crop editor). The resumable
    // endpoint must receive the same Bearer credential as the Storage client.
    // The cron uses the service role; an in-request worker falls back to the
    // authenticated admin session. The user path is policy-checked; the cron
    // path is the explicitly authorized service worker. Both preserve versioned
    // output paths.
    // Prefer the request's admin session so an editor save remains subject to
    // the same RLS policy as the rest of the request. The cron's service-role
    // client has no user session, so it uses the service key as its legitimate
    // worker credential.
    let sessionToken = ''
    try {
      const { data: session } = await supabase.auth.getSession()
      sessionToken = session.session?.access_token || ''
    } catch {
      // Service-role clients do not have a user session; getSession can also
      // fail when a request cookie has expired. The worker can still use the
      // cron's service credential below.
    }
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
    const accessToken = sessionToken || serviceKey
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '')
    if (!accessToken || !supabaseUrl) {
      throw new Error('The print file could not be saved because storage access is not configured. Ask support to check the storage settings.')
    }
    const endpoint = `${supabaseUrl}/storage/v1/upload/resumable`
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(output)
      const finish = (error?: Error) => {
        clearTimeout(timer)
        stream.destroy()
        if (error) reject(error); else resolve()
      }
      const task = new Upload(stream, {
        endpoint, uploadSize: size,
        // Every crop gets a unique object name, so an insert-only upload is
        // sufficient and does not require a storage UPDATE policy.
        // Opaque sb_secret keys are API keys, not JWT access tokens. Sending
        // one as Bearer makes Storage reject it as an invalid compact JWS.
        headers: cropUploadHeaders(sessionToken, serviceKey, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''),
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
    let previewPath: string | null = null
    try {
      previewPath = await uploadPrintPreview(supabase, job.id, output)
    } catch {
      // A preview failure must not discard a valid print or reuse the old crop's
      // preview. The storefront renders its explicit placeholder until repaired.
      console.warn('[crop] storefront preview unavailable', { master: job.id })
    }
    return { objectName, width: dimensions.width, height: dimensions.height, previewPath }
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

type Renderer = (supabase: SupabaseClient, job: CropJob) => Promise<{
  objectName: string; width: number; height: number; previewPath?: string | null
}>

/** Atomic claim + request timestamp fence: an old crop can never replace a newer one. */
export async function processMasterCrop(supabase: SupabaseClient, id: string, requestedAt: string, render: Renderer = renderAndUpload, catalog?: Catalog) {
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
    let published = false
    try {
      // An operator can prepare an oversized file locally and leave only its
      // pricing reconciliation for the deployed worker with provider access.
      // The timestamp proves this file belongs to the current crop request.
      const preparedForRequest = Boolean(job.print_storage_path && job.print_width_px && job.print_height_px
        && job.print_updated_at && Date.parse(job.print_updated_at) >= Date.parse(requestedAt))
      let result: { objectName: string; width: number; height: number; previewPath?: string | null }
      if (preparedForRequest) {
        published = true
        let previewPath = job.print_preview_storage_path ?? null
        if (!previewPath) {
          try { previewPath = await previewStoredPrint(supabase, id, job.print_storage_path!) }
          catch { console.warn('[crop] prepared print preview unavailable', { master: id }) }
        }
        result = { objectName: job.print_storage_path!, width: job.print_width_px!, height: job.print_height_px!, previewPath }
      } else {
        validateCropJob(job)
        result = await render(supabase, job)
      }
      // Publish the new file and dimensions while the master remains processing.
      // The final ready transition happens after variants are reconciled, so the
      // storefront and editor never observe a ready crop paired with old sizes.
      const { data: prepared, error: saveError } = await supabase.from('master_artworks').update({
        print_storage_path: result.objectName, print_width_px: result.width, print_height_px: result.height,
        print_preview_storage_path: result.previewPath ?? null,
        print_error: null, print_updated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', id).eq('print_status', 'processing').eq('print_requested_at', requestedAt).select('id').maybeSingle()
      if (saveError) throw new Error('The print file was made, but its status could not be saved. Try saving the crop again.')
      if (!prepared) return 'superseded' as const
      published = true
      // Keep even superseded versioned outputs; deleting after an uncertain DB
      // response could break an order that already captured this exact path.
      let reconciliationError: string | null = null
      try {
        const reconciled = await reconcileVariantsForMaster(supabase, id, result.width, result.height, catalog, job.crop_output, requestedAt)
        console.info('[crop] reconciled print sizes', { master: id, ...reconciled })
        if (reconciled.failed > 0) {
          reconciliationError = 'The crop is saved, but some print sizes could not be updated. Save the crop again to finish preparing the sizes before selling.'
        }
      } catch (error) {
        // The new file has already replaced the old one. Do not publish it for
        // sale beside stale dimensions if the dependent size updates failed.
        console.error('[crop] could not reconcile print sizes', { master: id, error })
        reconciliationError = 'The crop is saved, but print sizes could not be updated. Save the crop again to finish preparing the sizes before selling.'
      }
      const { data: saved, error: readyError } = await supabase.from('master_artworks').update({
        print_status: reconciliationError ? 'failed' : 'ready', print_error: reconciliationError, updated_at: new Date().toISOString(),
      }).eq('id', id).eq('print_status', 'processing').eq('print_requested_at', requestedAt).select('id').maybeSingle()
      if (readyError) throw new Error('The print file was made, but its status could not be saved. Try saving the crop again.')
      return saved ? (reconciliationError ? 'failed' as const : 'ready' as const) : 'superseded' as const
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Processing failed. Try saving the crop again.'
      const { error: statusError } = await supabase.from('master_artworks')
        .update({
          ...(published ? { print_status: 'failed', print_error: message.slice(0, 500) } : failedJobState(job.print_storage_path, message)),
          updated_at: new Date().toISOString(),
        })
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
  const { data: interrupted, error } = await supabase.from('master_artworks')
    .select('id, updated_at, print_storage_path, print_width_px, print_height_px, print_updated_at, print_requested_at')
    .eq('print_status', 'processing').lt('updated_at', cutoff)
  if (error) throw new Error('Could not recover interrupted crops')
  let recovered = 0
  for (const job of interrupted ?? []) {
    const preparedForRequest = Boolean(job.print_storage_path && job.print_width_px && job.print_height_px
      && job.print_updated_at && job.print_requested_at && Date.parse(job.print_updated_at) >= Date.parse(job.print_requested_at))
    // A newly rendered file may still have stale variants. Requeue its pricing
    // step instead of exposing it as ready after a serverless hard timeout.
    const state = preparedForRequest ? { print_status: 'pending', print_error: null } : failedJobState(job.print_storage_path, message)
    const { data, error: recoveryError } = await supabase.from('master_artworks')
      .update({ ...state, updated_at: now.toISOString() })
      .eq('id', job.id).eq('print_status', 'processing').eq('updated_at', job.updated_at).select('id')
    if (recoveryError) throw new Error('Could not recover interrupted crops')
    recovered += data?.length || 0
  }
  return recovered
}
