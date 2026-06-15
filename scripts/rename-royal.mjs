// Rename the cactus piece "Sometime" -> "Royal": copy its storage objects to
// royal.* keys, repoint every DB reference, verify the new objects serve, then
// delete the old keys. Run: node --env-file=.env.local scripts/rename-royal.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })
const PUB = `${url}/storage/v1/object/public/product-images/`

const WEB_OLD = 'web/cactuses/sometime.webp', WEB_NEW = 'web/cactuses/royal.webp'
const MAS_OLD = 'masters/cactuses/sometime.jpg', MAS_NEW = 'masters/cactuses/royal.jpg'

// 1) copy storage objects to the new keys (leave originals until verified)
let r = await sb.storage.from('product-images').copy(WEB_OLD, WEB_NEW)
if (r.error && !/exist|not found/i.test(r.error.message)) throw r.error
r = await sb.storage.from('print-masters').copy(MAS_OLD, MAS_NEW)
if (r.error && !/exist|not found/i.test(r.error.message)) throw r.error

// 2) repoint DB references
const { data: prod } = await sb.from('products').select('id').eq('slug', 'sometime').maybeSingle()
const pid = prod?.id || (await sb.from('products').select('id').eq('slug', 'royal').single()).data.id
await sb.from('products').update({ title: 'Royal', slug: 'royal', updated_at: new Date().toISOString() }).eq('id', pid)
await sb.from('product_images').update({
  alt_text: 'Royal - water gouache cactus painting',
  print_master_path: MAS_NEW,
  url: PUB + WEB_NEW + '?v=3',
}).eq('product_id', pid).eq('is_primary', true)
await sb.from('master_artworks').update({ title: 'Royal', file_name: 'royal.jpg', storage_path: MAS_NEW }).eq('storage_path', MAS_OLD)
const { data: vars } = await sb.from('product_variants').select('id, sku').eq('product_id', pid).like('sku', 'sometime-%')
for (const v of vars || []) await sb.from('product_variants').update({ sku: v.sku.replace('sometime-', 'royal-') }).eq('id', v.id)

// 3) verify the new objects serve
const webOk = (await fetch(PUB + WEB_NEW + '?v=3')).status
const signed = await sb.storage.from('print-masters').createSignedUrl(MAS_NEW, 60)
const masOk = signed?.data?.signedUrl ? (await fetch(signed.data.signedUrl)).status : 'no-sign'

// 4) delete the old keys only once the new ones are confirmed good
let deleted = 'skipped (verification failed)'
if (webOk === 200 && masOk === 200) {
  await sb.storage.from('product-images').remove([WEB_OLD])
  await sb.storage.from('print-masters').remove([MAS_OLD])
  deleted = 'old web + master removed'
}

console.log(JSON.stringify({ pid, newWeb: PUB + WEB_NEW + '?v=3', webOk, masOk, skusRenamed: (vars || []).length, deleted }, null, 2))
