// Create a new "Solo" product from Official/solo.tif, with the TIF as its print master.
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import fs from 'node:fs'
sharp.cache(false); sharp.concurrency(1)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })
const PUB = `${url}/storage/v1/object/public/product-images/`
const SRC = '/Users/skylarwebber/Margaret-Edmondson/public/Margaret Edmondson/ARTWORK/Official/solo.tif'
const slug = 'solo-saguaro', title = 'Solo'
const CACTUSES = '225ae116-d99c-431e-a260-daf5b4a67d5d'

if ((await sb.from('products').select('id').eq('slug', slug).maybeSingle()).data) { console.log('already exists'); process.exit(0) }

// --- master: upload the TIF as-is ---
const tif = fs.readFileSync(SRC)
const meta = await sharp(SRC, { limitInputPixels: false }).metadata()
const masterPath = `masters/new-2026/${slug}.tif`
const up = await sb.storage.from('print-masters').upload(masterPath, tif, { contentType: 'image/tiff', upsert: true })
if (up.error) { console.log('MASTER UPLOAD ERR:', up.error.message); process.exit(1) }
const { data: ma, error: me } = await sb.from('master_artworks').insert({
  title, storage_path: masterPath, file_name: `${slug}.tif`, file_size_bytes: tif.length,
  mime_type: 'image/tiff', width_px: meta.width, height_px: meta.height, dpi: meta.density ? Math.round(meta.density) : 300,
}).select('id').single()
if (me) { console.log('MASTER ROW ERR:', me.message); process.exit(1) }

// --- web image from the TIF ---
let q = 82, web
do { web = await sharp(SRC, { limitInputPixels: false }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').webp({ quality: q, effort: 5 }).toBuffer(); q -= 4 } while (web.length / 1024 > 450 && q >= 70)
const wm = await sharp(web).metadata()
const webKey = `web/new-2026/${slug}.webp`
await sb.storage.from('product-images').upload(webKey, web, { contentType: 'image/webp', upsert: true })

// --- product (active) ---
const { data: prod, error: pe } = await sb.from('products').insert({
  title, slug, category_id: CACTUSES, base_price: 0, default_margin_pct: null,
  fulfillment_type: 'lumaprints', prints_enabled: true, status: 'active', is_original: false,
  medium: 'Water gouache on paper', dimensions: '8x18 in', master_artwork_id: ma.id,
  description_html: `<p>${title} — water gouache on paper.</p>`,
}).select('id').single()
if (pe) { console.log('PRODUCT ERR:', pe.message); process.exit(1) }

await sb.from('product_images').insert({ product_id: prod.id, url: PUB + webKey, alt_text: title, is_primary: true, sort_order: 0, width: wm.width, height: wm.height, print_master_path: masterPath })

// --- variants: clone the standard print set, reprice via the cascade ---
const { data: tmpl } = await sb.from('products').select('id').eq('slug', 'the-dual').single()
const { data: tvars } = await sb.from('product_variants').select('*').eq('product_id', tmpl.id).neq('variant_type', 'original')
const rows = tvars.map((v) => { const c = { ...v }; delete c.id; delete c.updated_at; c.product_id = prod.id; c.sku = `${slug}-${c.size_label || 'x'}-${c.variant_type}`; return c })
const ve = (await sb.from('product_variants').insert(rows)).error
if (ve) console.log('VARIANTS ERR:', ve.message)
await sb.rpc('reprice_variants', { p_product: prod.id, p_category: null })

console.log(`created "${title}" (${slug}) ${prod.id}\n  master ${meta.width}x${meta.height} TIF ${Math.round(tif.length/1e6)}MB -> ${masterPath}\n  web ${wm.width}x${wm.height} -> ${webKey}\n  ${rows.length} variants, Cactuses (110%), ACTIVE`)
