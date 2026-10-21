// Operator fallback for saved master crops, including originals/output files
// outside serverless limits. Originals and all earlier print versions stay intact.
// Usage (Node 22+):
//   node --experimental-transform-types scripts/process-master-crop.mjs --failed
//   node --experimental-transform-types scripts/process-master-crop.mjs --id <uuid>
//   node --experimental-transform-types scripts/process-master-crop.mjs [--all]
// Without a selector, only pending jobs are selected. Processing jobs are skipped.

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { Upload } from 'tus-js-client'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { applyMasterCropFile } from './lib/crop-transform.mjs'

sharp.cache(false)
sharp.concurrency(1)
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUCKET = 'print-masters'
const DIRECT_UPLOAD_MAX = 40 * 1024 * 1024
const MAX_BYTES = 2 * 1024 * 1024 * 1024

function loadEnv() {
  const file = path.join(REPO, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const key = t.slice(0, i)
    if (process.env[key] === undefined) process.env[key] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
}

function uploadHeaders(key) {
  return { apikey: key, ...(key.startsWith('sb_') ? {} : { authorization: `Bearer ${key}` }), 'x-upsert': 'false' }
}

async function uploadOutput(sb, url, key, filePath, objectName) {
  const size = fs.statSync(filePath).size
  if (size < DIRECT_UPLOAD_MAX) {
    const { error } = await sb.storage.from(BUCKET).upload(objectName, fs.readFileSync(filePath), {
      contentType: 'image/png', upsert: false,
    })
    if (!error) return 'direct'
    console.warn(`  direct upload failed (${error.message}); retrying resumable`)
  }
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    const finish = (error) => { clearTimeout(timer); stream.destroy(); if (error) reject(error); else resolve() }
    const upload = new Upload(stream, {
      endpoint: `${url.replace(/\/$/, '')}/storage/v1/upload/resumable`, uploadSize: size,
      retryDelays: [0, 1000, 3000, 5000], headers: uploadHeaders(key),
      metadata: { bucketName: BUCKET, objectName, contentType: 'image/png', cacheControl: '3600' },
      chunkSize: 6 * 1024 * 1024, storeFingerprintForResuming: false,
      onError: (error) => finish(new Error(`Upload failed (${error.originalResponse?.getStatus?.() || 'network'}): ${error.originalResponse?.getBody?.()?.slice(0, 200) || 'storage connection failed'}`)),
      onSuccess: () => finish(),
    })
    const timer = setTimeout(() => {
      void upload.abort().catch(() => {})
      finish(new Error('Upload exceeded ten minutes'))
    }, 600_000)
    upload.start()
  })
  return 'resumable'
}

async function processOne(sb, url, key, reconcile, master, deferReconcile) {
  const label = `${master.title} (${master.id})`
  const c = master.crop_box
  if (!c || ![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.x < 0 || c.y < 0 || c.w <= 0 || c.h <= 0 || c.x + c.w > 1.000001 || c.y + c.h > 1.000001) {
    console.error(`FAIL ${label}: missing or invalid saved crop`)
    return false
  }
  if (master.print_status === 'processing') { console.log(`SKIP ${label}: another worker is processing this master`); return true }
  const stamp = new Date().toISOString()
  const oldFence = (query) => master.print_requested_at ? query.eq('print_requested_at', master.print_requested_at) : query.is('print_requested_at', null)
  const { data: claimed, error: claimError } = await oldFence(sb.from('master_artworks')
    .update({ print_status: 'processing', print_error: null, print_requested_at: stamp, updated_at: stamp })
    .eq('id', master.id).eq('print_status', master.print_status)).select('id').maybeSingle()
  if (claimError) throw claimError
  if (!claimed) { console.log(`SKIP ${label}: a newer crop request owns this job`); return true }
  const fence = (query) => query.eq('id', master.id).eq('print_status', 'processing').eq('print_requested_at', stamp)
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'artbyme-operator-crop-'))
  let published = false
  try {
    const source = path.join(folder, 'source')
    const output = path.join(folder, 'print.png')
    const { data: signed, error: signError } = await sb.storage.from(BUCKET).createSignedUrl(master.storage_path, 600)
    if (signError || !signed) throw new Error('Could not read the original master')
    const response = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(300_000), redirect: 'error' })
    if (!response.ok || !response.body) throw new Error(`Original download returned ${response.status}`)
    let bytes = 0
    const limiter = new Transform({ transform(chunk, _encoding, done) {
      bytes += chunk.length
      done(bytes > MAX_BYTES ? new Error('Original exceeds 2 GB operator limit') : null, chunk)
    } })
    await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(source, { flags: 'wx' }))
    console.log(`  ${master.title}: rendering saved crop from ${(bytes / 1e6).toFixed(1)} MB original`)
    const dimensions = await applyMasterCropFile(source, output, {
      cropBox: c, borderMode: master.border_mode, borderColor: master.border_color || '#ffffff',
      cropOutput: master.crop_output ?? null,
      dpi: master.dpi, widthPx: master.width_px, heightPx: master.height_px,
      verifyDimensions: true, limitInputPixels: 500_000_000, timeoutSeconds: 600,
    }, MAX_BYTES)
    const objectName = `print/${master.id}-${randomUUID()}.png`
    const via = await uploadOutput(sb, url, key, output, objectName)
    const { data: prepared, error: prepareError } = await fence(sb.from('master_artworks').update({
      print_storage_path: objectName, print_width_px: dimensions.width, print_height_px: dimensions.height,
      print_preview_storage_path: null,
      print_updated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })).select('id').maybeSingle()
    if (prepareError) throw prepareError
    if (!prepared) { console.log(`SKIP ${label}: crop was superseded before publication`); return true }
    published = true
    if (deferReconcile) {
      // Requires the deployed worker's prepared-output resume support. The
      // version timestamp is later than the request stamp, so it will price
      // this exact output without rendering/downloading the large file again.
      const { data: queued, error: queueError } = await fence(sb.from('master_artworks').update({
        print_status: 'pending', print_error: null, updated_at: new Date().toISOString(),
      })).select('id').maybeSingle()
      if (queueError) throw queueError
      console.log(`${queued ? 'QUEUED' : 'SUPERSEDED'} ${label}: ${dimensions.width}x${dimensions.height}, ${(fs.statSync(output).size / 1e6).toFixed(1)} MB ${via}; deployed worker will reconcile prices`)
      return true
    }
    const reconciliation = await reconcile(sb, master.id, dimensions.width, dimensions.height, undefined, master.crop_output, stamp)
    if (reconciliation.failed > 0) throw new Error(`${reconciliation.failed} print sizes could not be updated; retry the saved crop before selling`)
    const { data: ready, error: readyError } = await fence(sb.from('master_artworks').update({
      print_status: 'ready', print_error: null, updated_at: new Date().toISOString(),
    })).select('id').maybeSingle()
    if (readyError) throw readyError
    if (!ready) { console.log(`SKIP ${label}: a newer crop request owns this job`); return true }
    console.log(`OK ${label}: ${dimensions.width}x${dimensions.height}, ${(fs.statSync(output).size / 1e6).toFixed(1)} MB ${via}; ${reconciliation.updated} sizes updated, ${reconciliation.skipped} unchanged`)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const keepPrevious = !published && Boolean(master.print_storage_path)
    const { error: statusError } = await fence(sb.from('master_artworks').update({
      print_status: keepPrevious ? 'ready' : 'failed',
      print_error: `${keepPrevious ? 'Last crop failed; previous print file remains in use. ' : ''}${message}`.slice(0, 500),
      updated_at: new Date().toISOString(),
    }))
    console.error(`FAIL ${label}: ${message}${statusError ? '; failure status could not be saved' : ''}`)
    return false
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log('node --experimental-transform-types scripts/process-master-crop.mjs [--failed | --id <uuid> | --all] [--defer-reconcile]\nDefault: pending crops only. --failed retries saved crop selections with print_error. --defer-reconcile queues the prepared file for the deployed worker; deploy resume support first. No original file or crop selection is changed.')
    return
  }
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase URL or service key')
  // Resolve/import the real quote and geometry rules BEFORE any database writes.
  await import('./lib/register-ts.mjs')
  const { reconcileVariantsForMaster } = await import('../src/lib/pricing/reconcile-variants.ts')
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  let query = sb.from('master_artworks').select('id,title,storage_path,crop_box,crop_output,border_mode,border_color,width_px,height_px,dpi,print_status,print_requested_at,print_storage_path')
  if (args.includes('--id')) {
    const id = args[args.indexOf('--id') + 1]
    if (!id || id.startsWith('--')) throw new Error('--id requires a master ID')
    query = query.eq('id', id)
  } else if (args.includes('--failed')) query = query.not('print_error', 'is', null).not('crop_box', 'is', null)
  else if (args.includes('--all')) query = query.not('crop_box', 'is', null)
  else query = query.eq('print_status', 'pending')
  const { data: rows, error } = await query
  if (error) throw error
  console.log(`Processing ${rows?.length || 0} master(s) using saved crop selections`)
  let failed = 0
  for (const master of rows || []) if (!await processOne(sb, url, key, reconcileVariantsForMaster, master, args.includes('--defer-reconcile'))) failed++
  console.log(`Finished: ${(rows?.length || 0) - failed} completed/skipped; ${failed} failed`)
  if (failed) process.exitCode = 1
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Operator crop failed'); process.exitCode = 1 })
