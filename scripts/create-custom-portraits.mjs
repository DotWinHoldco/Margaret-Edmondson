// Create the Custom Portrait offerings as products in the "Custom Portraits"
// category from the examples in ARTWORK/Custom Portrait Options/. These are
// made-to-order commission examples: no print variants, no master, base_price 0
// (the storefront shows a "commission" CTA for them, not a purchase).
// Run: node --env-file=.env.local scripts/create-custom-portraits.mjs
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
sharp.cache(false)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })
const PUB = `${url}/storage/v1/object/public/product-images/`
const DIR = '/Users/skylarwebber/Margaret-Edmondson/public/Margaret Edmondson/ARTWORK/Custom Portrait Options/'
const CUSTOM_PORTRAITS = '60ddf7ad-685d-49f5-b320-265f2593f9ca'

const GROUPS = [
  { slug: 'custom-pet-portrait', title: 'Custom Pet Portrait',
    files: ['Custom Pet Portrait Example_1.jpg', 'Custom Pet Portrait Example_2.jpg', 'Custom Pet Portrait Example_3.jpg'],
    desc: 'A one of a kind painted portrait of your pet, created from your favorite photos. Reach out to commission a piece as unique as they are.' },
  { slug: 'custom-house-portrait', title: 'Custom House Portrait',
    files: ['Custom House Portrait Example_1.jpg', 'Custom House Portrait Example_2.jpg'],
    desc: 'A custom painting of your home or a place that holds meaning, hand painted from your photos. A heartfelt keepsake or housewarming gift.' },
  { slug: 'dog-and-daughter', title: 'Dog and Daughter',
    files: ['Dog and Daughter Drawing_1.jpg', 'Dog and Daughter Drawing_2.jpg'],
    desc: 'A custom portrait capturing the bond between a pet and their person, made to order from your photos.' },
  { slug: 'family-gift-painting', title: 'Family Gift Painting',
    files: ['Family Gift Painting.jpg'],
    desc: 'A custom family portrait painted from your photos. A lasting, one of a kind gift for the people you love.' },
  { slug: 'stylized-color-portrait', title: 'Stylized Color Portrait',
    files: ['Stylized Color Portrait Example.jpg'],
    desc: 'A vibrant, stylized custom portrait rendered in bold color. Commission a striking, modern keepsake from your photo.' },
]

const out = []
for (let gi = 0; gi < GROUPS.length; gi++) {
  const g = GROUPS[gi]
  const existing = (await sb.from('products').select('id').eq('slug', g.slug).maybeSingle()).data
  if (existing) { out.push({ slug: g.slug, skipped: 'already exists' }); continue }

  const { data: prod, error: pe } = await sb.from('products').insert({
    title: g.title, slug: g.slug, category_id: CUSTOM_PORTRAITS,
    base_price: 0, fulfillment_type: 'self_ship', prints_enabled: false,
    is_original: false, funnel_eligible: false, status: 'active',
    description_html: `<p>${g.desc}</p>`,
  }).select('id').single()
  if (pe) { out.push({ slug: g.slug, error: pe.message }); continue }

  let imgN = 0
  for (let i = 0; i < g.files.length; i++) {
    const src = DIR + g.files[i]
    let q = 84, web
    do {
      web = await sharp(src, { limitInputPixels: false }).rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .toColourspace('srgb').webp({ quality: q, effort: 5 }).toBuffer()
      q -= 4
    } while (web.length / 1024 > 450 && q >= 62)
    const wm = await sharp(web).metadata()
    const webKey = `web/custom-portraits/${g.slug}${i === 0 ? '' : '-' + (i + 1)}.webp`
    await sb.storage.from('product-images').upload(webKey, web, { contentType: 'image/webp', upsert: true })
    await sb.from('product_images').insert({
      product_id: prod.id, url: PUB + webKey, alt_text: g.title,
      is_primary: i === 0, sort_order: i, width: wm.width, height: wm.height,
    })
    imgN++
  }

  await sb.from('product_categories').insert({
    product_id: prod.id, category_id: CUSTOM_PORTRAITS, is_primary: true, sort_order: gi + 1,
  })
  out.push({ slug: g.slug, id: prod.id, images: imgN, slot: gi + 1 })
}
console.log(JSON.stringify(out, null, 2))
