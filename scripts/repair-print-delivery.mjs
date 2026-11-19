// Prepare versioned, verified delivery copies. Never changes originals, crops, or orders.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { measureQuality } from './lib/image-quality.mjs'
import { prepareProviderImage, MAX_PROVIDER_IMAGE_BYTES } from './lib/provider-image.mjs'

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


let query = sb.from('master_artworks').select('id,title,storage_path,print_storage_path,print_width_px,print_height_px,print_status,print_requested_at,print_updated_at,crop_box,crop_output').not('print_storage_path', 'is', null).order('title')
if (arg('--id')) query = query.eq('id', arg('--id'))
const { data: masters, error } = await query
if (error) throw error
for (const master of masters) {
  const { data: object, error: infoError } = await bucket.info(master.print_storage_path)
  if (infoError) throw new Error(`Cannot inspect ${master.title}: ${infoError.message}`)
  if (object.size <= MAX_PROVIDER_IMAGE_BYTES) continue
  if (master.print_status !== 'ready') throw new Error(`Concurrent crop job on ${master.title}; do not modify it`)
  const folder = path.join(outDir, master.id)
  fs.mkdirSync(folder, { recursive: true })
  const evidencePath = path.join(folder, 'verification.json')
  if (fs.existsSync(evidencePath)) {
    const old = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
    if (old.master.print_storage_path === master.print_storage_path && await hash(old.delivery.path) === old.delivery.sha256) {
      console.log(`VERIFIED ALREADY ${master.title}: ${(old.delivery.bytes / 1e6).toFixed(2)} MB`)
      continue
    }
    throw new Error(`Existing evidence changed for ${master.title}; review before proceeding`)
  }
  const source = path.join(folder, 'approved-crop.png'), jpeg = path.join(folder, 'delivery.jpg')
  console.log(`PREPARING ${master.title}: ${(object.size / 1e6).toFixed(2)} MB`)
  if (!fs.existsSync(source)) {
    const { data, error: signError } = await bucket.createSignedUrl(master.print_storage_path, 3600)
    if (signError) throw signError
    const response = await fetch(data.signedUrl, { signal: AbortSignal.timeout(300000) })
    if (!response.ok || !response.body) throw new Error(`Download failed for ${master.title}`)
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(source, { flags: 'wx' }))
  }
  if (fs.statSync(source).size !== object.size) throw new Error(`Incomplete source for ${master.title}`)
  const metadata = await sharp(source, { limitInputPixels: false }).metadata()
  if (metadata.width !== master.print_width_px || metadata.height !== master.print_height_px) throw new Error(`Stored dimensions differ for ${master.title}`)
  const delivery = await prepareProviderImage(source, jpeg)
  const quality = delivery.quality ?? await measureQuality(source, delivery.path)
  const record = { checkedAt: new Date().toISOString(), master, source: { bytes: object.size, sha256: await hash(source), width: metadata.width, height: metadata.height, density: metadata.density, iccSha256: createHash('sha256').update(metadata.icc ?? '').digest('hex') }, delivery: { ...delivery, sha256: await hash(delivery.path), objectName: `delivery/${master.id}/${path.basename(master.print_storage_path, '.png')}.jpg` }, quality }
  fs.writeFileSync(evidencePath, JSON.stringify(record, null, 2) + '\n')
  console.log(`VERIFIED ${master.title}: ${(delivery.bytes / 1e6).toFixed(2)} MB; ${quality.psnrDb.toFixed(2)} dB; ${metadata.width} x ${metadata.height}, ICC/DPI retained`)
}
