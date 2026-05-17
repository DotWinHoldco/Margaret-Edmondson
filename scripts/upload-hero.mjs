import sharp from 'sharp'
import { readFile } from 'fs/promises'

const PROJECT_REF = 'klwkajukicsoiwpsgftt'
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`
const SOURCE = 'public/Margaret Edmondson/ARTWORK/me-hero-1.jpg'
const TARGET_KEY = 'web/hero/me-hero-1.webp'
const BUCKET = 'product-images'

async function getServiceKey() {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${process.env.SBP_TOKEN}` },
  })
  const keys = await r.json()
  return keys.find((k) => k.name === 'service_role').api_key
}

const buf = await readFile(SOURCE)
const meta = await sharp(buf).metadata()
const webp = await sharp(buf)
  .rotate()
  .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 85 })
  .toBuffer()
console.log(`Source: ${(buf.length / 1024 / 1024).toFixed(2)} MB (${meta.width}×${meta.height}) → WebP: ${(webp.length / 1024).toFixed(0)} KB (-${((1 - webp.length / buf.length) * 100).toFixed(0)}%)`)

const serviceKey = await getServiceKey()
const res = await fetch(`${PROJECT_URL}/storage/v1/object/${BUCKET}/${TARGET_KEY}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
  body: webp,
})
if (!res.ok) { console.error(res.status, await res.text()); process.exit(1) }
const publicUrl = `${PROJECT_URL}/storage/v1/object/public/${BUCKET}/${TARGET_KEY}`
console.log(`Uploaded: ${publicUrl}`)
console.log(`Aspect: ${meta.width}x${meta.height}`)
