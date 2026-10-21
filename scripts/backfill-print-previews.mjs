// Authorized operator backfill: derive only the CURRENT ready print output.
// No crop, original, production file, selection, price, or status is changed.
// Node 22+: node scripts/backfill-print-previews.mjs --apply
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { uploadPrintPreview } from '../src/lib/artwork/print-preview.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.loadEnvFile(join(root, '.env.local'))
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || new URL(url).hostname !== 'klwkajukicsoiwpsgftt.supabase.co') throw new Error('Expected production project credentials are unavailable')
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const audit = join(root, 'audit/launch-2026-10-09')
const selected = JSON.parse(await readFile(join(audit, 'print-previews-before.json'), 'utf8'))
const jobs = [...new Map(selected.map(row => [row.master_id, row])).values()]
const results = []
const MAX_BYTES = 450 * 1024 * 1024
sharp.cache(false)
sharp.concurrency(1)

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ dryRun: true, eligibleMasters: jobs.length, concurrency: 2, maxBytes: MAX_BYTES, maxPixels: 500_000_000 }))
  process.exit(0)
}

async function run(job) {
  const record = { master_id: job.master_id, product_id: job.product_id, slug: job.slug, source_print_storage_path: job.print_storage_path, before_preview_storage_path: job.print_preview_storage_path }
  const folder = await mkdtemp(join(tmpdir(), 'artbyme-preview-backfill-'))
  let previewPath
  try {
    const { data: current, error: currentError } = await sb.from('master_artworks').select('id,print_storage_path,print_status,print_preview_storage_path').eq('id', job.master_id).single()
    if (currentError) throw new Error('Could not re-read current print')
    if (current.print_status !== 'ready' || current.print_storage_path !== job.print_storage_path || current.print_preview_storage_path) {
      record.result = 'skipped-current-state'; return record
    }
    const { data: product, error: productError } = await sb.from('products').select('id,master_artwork_id,status,prints_enabled').eq('id',job.product_id).single()
    if (productError || !product || !['active','sold'].includes(product.status) || product.prints_enabled !== true || product.master_artwork_id !== job.master_id) {
      record.result = 'skipped-product-ineligible'; return record
    }
    const { data: signed, error: signError } = await sb.storage.from('print-masters').createSignedUrl(job.print_storage_path, 600)
    if (signError || !signed) throw new Error('Could not read current print output')
    const signal = AbortSignal.timeout(300_000)
    const response = await fetch(signed.signedUrl, { signal, redirect: 'error' })
    if (!response.ok || !response.body) throw new Error(`Print download HTTP ${response.status}`)
    if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body.cancel(); throw new Error('Print exceeds operator byte limit') }
    const source = join(folder, 'current-print')
    const hash = createHash('sha256')
    let bytes = 0
    const limiter = new Transform({ transform(chunk, _encoding, done) {
      bytes += chunk.length; hash.update(chunk)
      done(bytes > MAX_BYTES ? new Error('Print exceeds operator byte limit') : null, chunk)
    } })
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(source, { flags: 'wx' }), { signal })
    const metadata = await sharp(source, { limitInputPixels: 500_000_000, sequentialRead: true }).metadata()
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > 500_000_000) throw new Error('Print exceeds operator pixel limit')
    record.source_bytes = bytes
    record.source_sha256 = hash.digest('hex')
    record.source_dimensions = { width: metadata.width, height: metadata.height }
    previewPath = await uploadPrintPreview(sb, job.master_id, source)
    const { data: updated, error: updateError } = await sb.from('master_artworks')
      .update({ print_preview_storage_path: previewPath })
      .eq('id', job.master_id).eq('print_status', 'ready').eq('print_storage_path', job.print_storage_path)
      .is('print_preview_storage_path', null).select('id,print_storage_path,print_status,print_preview_storage_path').maybeSingle()
    if (updateError) throw new Error('Preview field update failed')
    if (!updated) {
      await sb.storage.from('product-images').remove([previewPath])
      previewPath = undefined; record.result = 'skipped-raced'; return record
    }
    record.after_preview_storage_path = updated.print_preview_storage_path
    record.result = 'updated'
    console.log(`READY ${job.slug} (${(bytes / 1048576).toFixed(1)} MiB source)`)
    return record
  } catch (error) {
    if (previewPath) await sb.storage.from('product-images').remove([previewPath])
    record.result = 'failed'; record.error = error instanceof Error ? error.message : 'Unknown processing failure'
    console.log(`FAILED ${job.slug}: ${record.error}`)
    return record
  } finally { await rm(folder, { recursive: true, force: true }) }
}

let next = 0
let auditWrite = Promise.resolve()
function saveAudit() {
  const body = JSON.stringify({ startedFrom: 'print-previews-before.json', completed: results.length, total: jobs.length, results }, null, 2)+'\n'
  auditWrite = auditWrite.then(() => writeFile(join(audit, 'print-previews-backfill-results.json'), body))
  return auditWrite
}
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++]
    results.push(await run(job))
    await saveAudit()
  }
}
await Promise.all([worker(), worker()])
await saveAudit()
console.log(JSON.stringify({ completed: results.length, updated: results.filter(r=>r.result==='updated').length, failed: results.filter(r=>r.result==='failed').length, skipped: results.filter(r=>r.result.startsWith('skipped')).length }))
if (results.some(r=>r.result==='failed')) process.exitCode = 1
