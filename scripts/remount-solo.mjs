// Solo renders full-bleed while the rest of the cactus collection is mounted on
// cream watercolor paper, so it looks oversized and breaks row uniformity. This
// re-mounts Solo's WEB image onto a cream canvas matching Hot Air's exact
// dimensions + content box + paper tone, so the top row (Hot Air / The Dual /
// Solo) is uniform. The PRINT MASTER is left untouched (prints stay full-bleed).
// Run: node --env-file=.env.local scripts/remount-solo.mjs
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
sharp.cache(false)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })
const PUB = `${url}/storage/v1/object/public/product-images/`
const HA_KEY = 'web/cactuses/hot-air_1-v2.webp'
const SO_KEY = 'web/new-2026/solo-print.webp'

const dl = async (k) => Buffer.from(await (await fetch(PUB + k)).arrayBuffer())
const haBuf = await dl(HA_KEY)
const soBuf = await dl(SO_KEY)

// Measure Hot Air: paper tone (median of 4 corners, robust to a corner where
// the painting's sky bleeds in) and the painting's content bounding box.
const { data, info } = await sharp(haBuf).toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
const W = info.width, H = info.height, ch = info.channels
const px = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]] }
const avg = (x0, y0, w, h) => { let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const p = px(x, y); r += p[0]; g += p[1]; b += p[2]; n++ } return [r / n, g / n, b / n] }
const corners = [avg(4, 4, 34, 34), avg(W - 38, 4, 34, 34), avg(4, H - 38, 34, 34), avg(W - 38, H - 38, 34, 34)]
const med = (k) => { const v = corners.map((c) => c[k]).sort((a, b) => a - b); return Math.round((v[1] + v[2]) / 2) }
const cream = { r: med(0), g: med(1), b: med(2) }
const dist = (p) => Math.abs(p[0] - cream.r) + Math.abs(p[1] - cream.g) + Math.abs(p[2] - cream.b)
const TH = 70
const colP = (x) => { let c = 0, n = 0; for (let y = 0; y < H; y += 4) { n++; if (dist(px(x, y)) > TH) c++ } return c > n * 0.06 }
const rowP = (y) => { let c = 0, n = 0; for (let x = 0; x < W; x += 4) { n++; if (dist(px(x, y)) > TH) c++ } return c > n * 0.06 }
let cl = 0; while (cl < W && !colP(cl)) cl++
let cr = W - 1; while (cr > 0 && !colP(cr)) cr--
let ct = 0; while (ct < H && !rowP(ct)) ct++
let cb = H - 1; while (cb > 0 && !rowP(cb)) cb--
const box = { left: cl, top: ct, width: cr - cl + 1, height: cb - ct + 1 }

// Mount Solo's painting (contain) centered in that content box on a cream canvas.
const soFit = await sharp(soBuf).resize({ width: box.width, height: box.height, fit: 'inside' }).toBuffer()
const sm = await sharp(soFit).metadata()
const sLeft = box.left + Math.round((box.width - sm.width) / 2)
const sTop = box.top + Math.round((box.height - sm.height) / 2)
const out = await sharp({ create: { width: W, height: H, channels: 3, background: cream } })
  .composite([{ input: soFit, left: sLeft, top: sTop }])
  .webp({ quality: 85, effort: 5 }).toBuffer()

await sb.storage.from('product-images').upload(SO_KEY, out, { contentType: 'image/webp', upsert: true })
const { data: prod } = await sb.from('products').select('id').eq('slug', 'solo-print').single()
await sb.from('product_images').update({ width: W, height: H, url: PUB + SO_KEY + '?v=3' })
  .eq('product_id', prod.id).eq('is_primary', true)

const httpOk = (await fetch(PUB + SO_KEY + '?v=3')).status
console.log(JSON.stringify({ cream, box, canvas: `${W}x${H}`, placed: `${sm.width}x${sm.height}`, bytesKB: Math.round(out.length / 1024), httpOk }, null, 2))
