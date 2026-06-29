// Master crop worker (Phase 1.3). Runs OUTSIDE the serverless runtime — an
// operator/queue-triggered job (low volume makes a script acceptable; see the
// build plan, Appendix A). For each master with print_status='pending' it:
//   1. claims the row (-> 'processing'),
//   2. streams the original out of print-masters (storage_path),
//   3. extracts the normalized crop_box region (libvips reads the region without
//      loading the whole image, so an 800 MB TIFF stays low-memory),
//   4. for border_mode='matte', pads with a uniform border_color border that
//      PRESERVES the crop aspect (cosmetic mat; every size still matches), and
//   5. re-encodes a LOSSLESS TIFF (deflate, DPI carried — a pure crop resamples
//      nothing, so zero quality loss) and resumable-uploads it to
//      print-masters/print/<id>.tif, then writes print_storage_path / px / status.
// The ORIGINAL (storage_path) is never modified — fully revertible.
//
// Usage:
//   node scripts/process-master-crop.mjs            # all pending
//   node scripts/process-master-crop.mjs --id <uuid>  # one master (any status)
//   node scripts/process-master-crop.mjs --all        # every master with a crop_box

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import * as tus from 'tus-js-client'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyMasterCrop } from './lib/crop-transform.mjs'

sharp.cache(false)

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const BUCKET = 'print-masters'
const DIRECT_UPLOAD_MAX = 40 * 1024 * 1024 // <40MB → direct upload; else resumable

// --- env (.env.local, no dotenv dep) ---
function loadEnv() {
  const env = { ...process.env }
  const file = path.join(REPO, '.env.local')
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      const k = t.slice(0, i)
      if (env[k] === undefined) env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Resumable (tus) upload of a file at `filePath` to BUCKET/`objectName`.
function resumableUpload(filePath, objectName, contentType) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(filePath).size
    const upload = new tus.Upload(fs.createReadStream(filePath), {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      uploadSize: size,
      retryDelays: [0, 1000, 3000, 5000],
      headers: { authorization: `Bearer ${SERVICE_KEY}`, 'x-upsert': 'true' },
      metadata: { bucketName: BUCKET, objectName, contentType, cacheControl: '3600' },
      chunkSize: 6 * 1024 * 1024, // Supabase requires a fixed 6MB chunk
      storeFingerprintForResuming: false,
      onError: reject,
      onSuccess: () => resolve(),
    })
    upload.start()
  })
}

async function uploadOutput(buf, objectName, contentType) {
  if (buf.length < DIRECT_UPLOAD_MAX) {
    const { error } = await sb.storage.from(BUCKET).upload(objectName, buf, { contentType, upsert: true })
    if (!error) return 'direct'
    // Fall through to resumable on a direct-upload failure (e.g. size cap).
    console.warn(`  direct upload failed (${error.message}); retrying resumable…`)
  }
  const tmp = path.join(os.tmpdir(), `master-out-${Date.now()}-${objectName.replace(/\W+/g, '_')}`)
  fs.writeFileSync(tmp, buf)
  try {
    await resumableUpload(tmp, objectName, contentType)
    return 'resumable'
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

async function processOne(m) {
  const label = `${m.title} (${m.id})`
  if (!m.crop_box || typeof m.crop_box.w !== 'number') {
    console.log(`SKIP ${label}: no crop_box`)
    return
  }
  // Claim the row.
  await sb.from('master_artworks').update({ print_status: 'processing', print_error: null }).eq('id', m.id)

  try {
    // 1. Download the original (service role; bypasses RLS).
    const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(m.storage_path)
    if (dlErr || !blob) throw new Error(`download failed: ${dlErr?.message || 'no data'}`)
    const srcBuf = Buffer.from(await blob.arrayBuffer())

    // 2-4. Extract crop → optional aspect-preserving matte → lossless TIFF
    // (shared with the crop-quality test).
    const { buffer: outBuf, width: outW, height: outH, dpi } = await applyMasterCrop(srcBuf, {
      cropBox: m.crop_box,
      borderMode: m.border_mode,
      borderColor: m.border_color || '#ffffff',
      dpi: m.dpi,
      widthPx: m.width_px,
      heightPx: m.height_px,
    })

    // 5. Upload to a VERSIONED print path (P3-6). A re-crop must NOT overwrite
    // print/<id>.tif in place: an order snapshot freezes print_storage_path at
    // purchase, so overwriting would make a later refire mint NEW bytes against the
    // OLD priced inches. A unique per-crop path keeps every snapshot resolvable to
    // the exact bytes it priced; superseded versions are harmless to leave behind.
    const rev = Date.now()
    const objectName = `print/${m.id}-${rev}.tif`
    const via = await uploadOutput(outBuf, objectName, 'image/tiff')

    await sb
      .from('master_artworks')
      .update({
        print_storage_path: objectName,
        print_width_px: outW,
        print_height_px: outH,
        print_updated_at: new Date().toISOString(),
        print_status: 'ready',
        print_error: null,
      })
      .eq('id', m.id)

    console.log(
      `OK   ${label}: print ${outW}×${outH}${m.border_mode === 'matte' ? ' (matte)' : ''} @${dpi}dpi, ${(outBuf.length / 1e6).toFixed(1)}MB via ${via} → ${objectName}`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await sb.from('master_artworks').update({ print_status: 'failed', print_error: msg.slice(0, 500) }).eq('id', m.id)
    console.error(`FAIL ${label}: ${msg}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const idArg = args.includes('--id') ? args[args.indexOf('--id') + 1] : null
  const all = args.includes('--all')

  const cols = 'id, title, storage_path, crop_box, border_mode, border_color, width_px, height_px, dpi, print_status'
  let query = sb.from('master_artworks').select(cols)
  if (idArg) query = query.eq('id', idArg)
  else if (all) query = query.not('crop_box', 'is', null)
  else query = query.eq('print_status', 'pending')

  const { data: rows, error } = await query
  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }
  if (!rows || rows.length === 0) {
    console.log('No masters to process.')
    return
  }
  console.log(`Processing ${rows.length} master(s)…`)
  for (const m of rows) await processOne(m)
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
