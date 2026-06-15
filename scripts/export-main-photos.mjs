// Duplicate every product's MAIN (primary) photo into a "main product photos" folder.
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
sharp.cache(false)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const OUT = '/Users/skylarwebber/Margaret-Edmondson/main product photos'
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const { data: prods } = await sb.from('products').select('id, title, slug, status').order('title')
const { data: imgs } = await sb.from('product_images').select('product_id, url').eq('is_primary', true).in('product_id', prods.map((p) => p.id))
const imgBy = Object.fromEntries((imgs || []).map((i) => [i.product_id, i.url]))

const used = new Set()
let n = 0, missing = 0
for (const p of prods) {
  const url = imgBy[p.id]
  if (!url) { console.log('no primary image:', p.title, `(${p.slug})`); missing++; continue }
  let name = (p.title || p.slug).replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
  if (used.has(name.toLowerCase())) name = `${name} (${p.slug})`
  used.add(name.toLowerCase())
  try {
    const r = await fetch(url)
    if (!r.ok) { console.log('HTTP', r.status, p.title); missing++; continue }
    const buf = Buffer.from(await r.arrayBuffer())
    await sharp(buf).jpeg({ quality: 92 }).toFile(path.join(OUT, `${name}.jpg`))
    n++
  } catch (e) { console.log('ERR', p.title, e.message); missing++ }
}
console.log(`\nExported ${n} main product photos to "${OUT}"${missing ? ` (${missing} missing/failed)` : ''}`)
