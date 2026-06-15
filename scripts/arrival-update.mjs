// Arrival: replace web image with a compressed version of the new cropped
// Official/Arrival.jpg, and upload the original full-size file as the master.
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import fs from 'node:fs'
sharp.cache(false)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })
const PUB = `${url}/storage/v1/object/public/product-images/`
const SRC = '/Users/skylarwebber/Margaret-Edmondson/public/Margaret Edmondson/ARTWORK/Official/Arrival.jpg'

const { data: prod } = await sb.from('products').select('id').eq('slug', 'arrival').single()
const { data: img } = await sb.from('product_images').select('id, url').eq('product_id', prod.id).eq('is_primary', true).single()
const webKey = img.url.split('/product-images/')[1].split('?')[0]

// --- web: compressed webp (<=450KB) ---
let q = 82, web
do { web = await sharp(SRC, { limitInputPixels: false }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').webp({ quality: q, effort: 5 }).toBuffer(); q -= 4 } while (web.length / 1024 > 450 && q >= 68)
const wm = await sharp(web).metadata()
await sb.storage.from('product-images').upload(webKey, web, { contentType: 'image/webp', upsert: true })
await sb.from('product_images').update({ width: wm.width, height: wm.height, url: PUB + webKey + '?v=3' }).eq('id', img.id)

// --- master: original full-size file as-is ---
const orig = fs.readFileSync(SRC)
const meta = await sharp(SRC, { limitInputPixels: false }).metadata()
const masterPath = 'masters/encouragement-series/arrival.jpg'
await sb.storage.from('print-masters').upload(masterPath, orig, { contentType: 'image/jpeg', upsert: true })
const { data: ex } = await sb.from('master_artworks').select('id').eq('storage_path', masterPath).maybeSingle()
const row = { title: 'Arrival', storage_path: masterPath, file_name: 'arrival.jpg', file_size_bytes: orig.length, mime_type: 'image/jpeg', width_px: meta.width, height_px: meta.height, dpi: meta.density ? Math.round(meta.density) : 300 }
let maId = ex?.id
if (maId) await sb.from('master_artworks').update(row).eq('id', maId)
else maId = (await sb.from('master_artworks').insert(row).select('id').single()).data.id
await sb.from('products').update({ master_artwork_id: maId }).eq('id', prod.id)
await sb.from('product_images').update({ print_master_path: masterPath }).eq('id', img.id)

console.log(`Arrival updated:\n  web ${wm.width}x${wm.height} ${Math.round(web.length/1024)}KB -> ${webKey} (?v=3)\n  master ${meta.width}x${meta.height} ${Math.round(orig.length/1e6)}MB -> ${masterPath}`)
