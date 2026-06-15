// Replace candid/placeholder web images with proper web images rendered from
// the 600-DPI master scans, and upload each master original to the private
// print-masters bucket (wiring master_artwork_id + print_master_path). Same
// flow as arrival-update.mjs, batched. The .jpg masters are full-res 600-DPI
// exports (the .tif originals exceed Supabase's ~50MB upload cap).
// Run: node --env-file=.env.local scripts/replace-web-and-master.mjs
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import fs from 'node:fs'
sharp.cache(false)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })
const PUB = `${url}/storage/v1/object/public/product-images/`
const ART = '/Users/skylarwebber/Margaret-Edmondson/public/Margaret Edmondson/ARTWORK/'

const JOBS = [
  { slug: 'dig',              title: 'Dig',              master: 'Official/Dig.jpg',              webKey: 'web/beach-and-sc/dig.webp',           masterKey: 'masters/beach-and-sc/dig.jpg' },
  { slug: 'dolphin-watch',    title: 'Dolphin Watch',    master: 'Official/Dolphin Watch.jpg',    webKey: 'web/beach-and-sc/dolphin-watch.webp', masterKey: 'masters/beach-and-sc/dolphin-watch.jpg' },
  { slug: 'pins-and-needles', title: 'Pins and Needles', master: 'Official/Pins-and-Needles.jpg', webKey: 'web/cactuses/pins-and-needles.webp',   masterKey: 'masters/cactuses/pins-and-needles.jpg' },
]

const out = []
for (const j of JOBS) {
  const srcPath = ART + j.master
  const meta = await sharp(srcPath, { limitInputPixels: false }).metadata()

  // --- web: compressed webp, long side 2400, <=450KB ---
  let q = 84, web
  do {
    web = await sharp(srcPath, { limitInputPixels: false })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .webp({ quality: q, effort: 5 })
      .toBuffer()
    q -= 4
  } while (web.length / 1024 > 450 && q >= 64)
  const wm = await sharp(web).metadata()

  const { data: prod } = await sb.from('products').select('id, master_artwork_id').eq('slug', j.slug).single()
  const { data: img } = await sb.from('product_images').select('id').eq('product_id', prod.id).eq('is_primary', true).single()

  await sb.storage.from('product-images').upload(j.webKey, web, { contentType: 'image/webp', upsert: true })
  await sb.from('product_images').update({ width: wm.width, height: wm.height, url: PUB + j.webKey + '?v=3' }).eq('id', img.id)

  // --- master: upload the original 600-DPI .jpg as-is ---
  const orig = fs.readFileSync(srcPath)
  await sb.storage.from('print-masters').upload(j.masterKey, orig, { contentType: 'image/jpeg', upsert: true })
  const row = {
    title: j.title, storage_path: j.masterKey, file_name: j.masterKey.split('/').pop(),
    file_size_bytes: orig.length, mime_type: 'image/jpeg',
    width_px: meta.width, height_px: meta.height, dpi: meta.density ? Math.round(meta.density) : 600,
  }
  const { data: ex } = await sb.from('master_artworks').select('id').eq('storage_path', j.masterKey).maybeSingle()
  let maId = ex?.id || prod.master_artwork_id
  if (maId) await sb.from('master_artworks').update(row).eq('id', maId)
  else maId = (await sb.from('master_artworks').insert(row).select('id').single()).data.id
  await sb.from('products').update({ master_artwork_id: maId }).eq('id', prod.id)
  await sb.from('product_images').update({ print_master_path: j.masterKey }).eq('id', img.id)

  // verify
  const webOk = (await fetch(PUB + j.webKey + '?v=3')).status
  const signed = await sb.storage.from('print-masters').createSignedUrl(j.masterKey, 60)
  const masOk = signed?.data?.signedUrl ? (await fetch(signed.data.signedUrl)).status : 'no-sign'
  out.push({ slug: j.slug, web: `${wm.width}x${wm.height} ${Math.round(web.length / 1024)}KB`, webOk, master: `${meta.width}x${meta.height} ${Math.round(orig.length / 1e6)}MB`, masOk, masterPublic: 'n/a' })
}
console.log(JSON.stringify(out, null, 2))
