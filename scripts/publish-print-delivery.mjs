// Prepare versioned, verified delivery copies. Never changes originals, crops, or orders.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { measureQuality } from './lib/image-quality.mjs'
import { providerImageProblem } from './lib/provider-image.mjs'
import { Upload } from 'tus-js-client'

const args = process.argv.slice(2)
const arg = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] }
const envFile = arg('--env')
const outDir = path.resolve(arg('--output') || 'output/provider-delivery-repair')
if (!envFile) throw new Error('--env is required (credentials are never printed)')
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n').map(l => l.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
  .map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const bucket = sb.storage.from('print-masters')
sharp.cache(false)
sharp.concurrency(1)
fs.mkdirSync(outDir, { recursive: true })
const hash = async file => { const h = createHash('sha256'); for await (const chunk of fs.createReadStream(file)) h.update(chunk); return h.digest('hex') }



const BUCKET = "print-masters"
const DIRECT_UPLOAD_MAX = 40 * 1024 * 1024
function uploadHeaders(key) {
  return { apikey: key, ...(key.startsWith('sb_') ? {} : { authorization: `Bearer ${key}` }), 'x-upsert': 'false' }
}

async function uploadOutput(sb, url, key, filePath, objectName, contentType) {
  const size = fs.statSync(filePath).size
  if (size < DIRECT_UPLOAD_MAX) {
    const { error } = await sb.storage.from(BUCKET).upload(objectName, fs.readFileSync(filePath), {
      contentType, upsert: false,
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
      metadata: { bucketName: BUCKET, objectName, contentType, cacheControl: '3600' },
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


const lumaEnvFile = arg('--validation-env')
if (!lumaEnvFile) throw new Error('--validation-env is required')
const le = Object.fromEntries(fs.readFileSync(lumaEnvFile, 'utf8').split('\n').map(l => l.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim()]))
if (!le.LUMAPRINTS_BASE_URL?.includes('api-sandbox.lumaprints.com')) throw new Error('Only image validation in the sandbox is allowed by this repair tool')
for (const entry of fs.readdirSync(outDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
  const evidencePath = path.join(outDir, entry.name, 'verification.json')
  if (!fs.existsSync(evidencePath)) continue
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
  const { master, delivery } = evidence
  if (arg('--id') && master.id !== arg('--id')) continue
  const receiptPath = path.join(outDir, entry.name, 'published.json')
  if (fs.existsSync(receiptPath)) { console.log(`PUBLISHED ALREADY ${master.title}`); continue }
  const problem = providerImageProblem({ bytes: delivery.bytes, mimeType: delivery.mimeType, path: delivery.objectName })
  if (problem || evidence.quality.psnrDb < 48 || await hash(delivery.path) !== delivery.sha256) throw new Error(`Invalid delivery evidence for ${master.title}`)
  const info = await bucket.info(delivery.objectName)
  if (!info.data) {
    if (!['400','404'].includes(String(info.error?.statusCode ?? info.error?.status))) throw new Error(`Cannot verify destination for ${master.title}: ${info.error?.message}`)
    console.log(`UPLOADING ${master.title}`)
    await uploadOutput(sb, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, delivery.path, delivery.objectName, delivery.mimeType)
  }
  const check = await bucket.info(delivery.objectName)
  if (check.error || Number(check.data.size) !== delivery.bytes || check.data.contentType !== delivery.mimeType) throw new Error(`Stored file metadata mismatch for ${master.title}`)
  const { data: signed, error } = await bucket.createSignedUrl(delivery.objectName, 7200)
  if (error || !signed || signed.signedUrl.length > 1024) throw new Error('Cannot create provider delivery link')
  const response = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(300000) })
  if (!response.ok || !response.body) throw new Error(`Readback failed for ${master.title}`)
  const digest = createHash('sha256'); for await (const chunk of Readable.fromWeb(response.body)) digest.update(chunk)
  if (digest.digest('hex') !== delivery.sha256) throw new Error(`Uploaded byte verification failed for ${master.title}`)
  const validation = await fetch(`${le.LUMAPRINTS_BASE_URL.replace(/\/$/, '')}/api/v1/images/checkImageConfig`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${le.LUMAPRINTS_API_KEY}:${le.LUMAPRINTS_API_SECRET}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subcategoryId: 101001, printWidth: 12, printHeight: Number((12 * evidence.source.height / evidence.source.width).toFixed(4)), imageUrl: signed.signedUrl, orderItemOptions: ['2','4'] }), signal: AbortSignal.timeout(300000),
  })
  const validationBody = (await validation.text()).replace(/https?:\/\/[^\s"<>]+/g, '[image URL redacted]')
  if (!validation.ok) throw new Error(`Image validation failed for ${master.title}: ${validation.status} ${validationBody.slice(0,800)}`)
  let update = sb.from('master_artworks').update({ print_storage_path: delivery.objectName, print_updated_at: new Date().toISOString() }).eq('id', master.id).eq('print_storage_path', master.print_storage_path).eq('print_status','ready')
  update = master.print_requested_at ? update.eq('print_requested_at', master.print_requested_at) : update.is('print_requested_at', null)
  update = master.print_updated_at ? update.eq('print_updated_at', master.print_updated_at) : update.is('print_updated_at', null)
  const changed = await update.select('id,storage_path,print_storage_path,print_width_px,print_height_px').maybeSingle()
  if (changed.error || !changed.data || changed.data.storage_path !== master.storage_path || changed.data.print_width_px !== evidence.source.width || changed.data.print_height_px !== evidence.source.height) throw new Error(`Concurrent change or publication failure for ${master.title}; inspect before retrying`)
  fs.writeFileSync(receiptPath, JSON.stringify({ at: new Date().toISOString(), sourceSha256: evidence.source.sha256, uploadedSha256: delivery.sha256, providerImageCheck: { status: validation.status, body: validationBody }, row: changed.data }, null, 2)+'\n')
  console.log(`PUBLISHED ${master.title}: verified uploaded bytes and provider image check; original retained`)
}
