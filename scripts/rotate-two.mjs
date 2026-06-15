// Rotate Love Birds + Don't Mind Me 90° CCW (landscape → portrait): master + web.
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
sharp.cache(false); sharp.concurrency(1)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })
const WORK = '/Users/skylarwebber/Margaret-Edmondson/public/Margaret-Scans/05_08_26/WORKING'
const PUB = `${url}/storage/v1/object/public/product-images/`
const MAX = 44 * 1024 * 1024
const ROT = 270 // CCW

const items = [
  { slug: 'love-birds', src: `${WORK}/LOVE BIRDS-18-24_1.jpg`, masterPath: 'masters/new-2026/love-birds.jpg', webKey: 'web/new-2026/love-birds.webp' },
  { slug: 'dont-mind-me', src: `${WORK}/Don't Mind Me 18X24_Gila.jpg`, masterPath: 'masters/new-2026/dont-mind-me.jpg', webKey: 'web/new-2026/dont-mind-me.webp' },
]

async function fitMaster(src) {
  for (const cap of [13000, 11000, 10000, 9000, 8000]) {
    const buf = await sharp(src, { limitInputPixels: false }).rotate(ROT).resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer()
    if (buf.length <= MAX) return buf
  }
  return await sharp(src, { limitInputPixels: false }).rotate(ROT).resize({ width: 7000, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer()
}
async function webWebp(src) {
  let q = 82, out
  do { out = await sharp(src, { limitInputPixels: false }).rotate(ROT).resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').webp({ quality: q, effort: 5 }).toBuffer(); q -= 4 } while (out.length / 1024 > 450 && q >= 70)
  return out
}

for (const it of items) {
  const mbuf = await fitMaster(it.src)
  const mm = await sharp(mbuf).metadata()
  await sb.storage.from('print-masters').upload(it.masterPath, mbuf, { contentType: 'image/jpeg', upsert: true })
  await sb.from('master_artworks').update({ width_px: mm.width, height_px: mm.height, file_size_bytes: mbuf.length }).eq('storage_path', it.masterPath)

  const wbuf = await webWebp(it.src)
  const wm = await sharp(wbuf).metadata()
  await sb.storage.from('product-images').upload(it.webKey, wbuf, { contentType: 'image/webp', upsert: true })
  const { data: prod } = await sb.from('products').select('id').eq('slug', it.slug).single()
  await sb.from('product_images').update({ width: wm.width, height: wm.height, url: PUB + it.webKey + '?v=3' }).eq('product_id', prod.id).eq('is_primary', true)
  console.log(`${it.slug}: master ${mm.width}x${mm.height}, web ${wm.width}x${wm.height} (CCW, portrait)`)
}
console.log('done')
