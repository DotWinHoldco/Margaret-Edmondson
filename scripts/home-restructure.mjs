#!/usr/bin/env node
/**
 * One-shot setup for the new home page:
 *   - Process & upload "Paintin' the Ass" art, create product + 16 print variants + image row
 *   - Activate the "Unexpected" product
 *   - Insert 4 new categories (Beach, Landscapes, Animals, Mixed Media)
 *   - Remap every existing product to its new category
 *   - Bump Hot Air II's created_at so the shop sorts Hot Air first under newest-first
 *   - Rewrite home featured_grid block to feature exactly 2 product_ids
 *   - Insert / upsert a "commission_feature" page_blocks row pointing at the
 *     existing custom pet portrait image
 */

import sharp from 'sharp'
import { readFile } from 'fs/promises'
import crypto from 'crypto'

const REF = 'klwkajukicsoiwpsgftt'
const STORAGE = `https://${REF}.supabase.co`
const MGMT = `https://api.supabase.com/v1/projects/${REF}`
const BUCKET = 'product-images'
const SBP_TOKEN = process.env.SBP_TOKEN
if (!SBP_TOKEN) { console.error('Missing SBP_TOKEN'); process.exit(1) }

async function svc() {
  const r = await fetch(`${MGMT}/api-keys`, { headers: { Authorization: `Bearer ${SBP_TOKEN}` } })
  return (await r.json()).find((k) => k.name === 'service_role').api_key
}

async function sql(query) {
  const r = await fetch(`${MGMT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SBP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(`SQL ${r.status}: ${JSON.stringify(d)}`)
  return d
}

const esc = (s) => String(s).replace(/'/g, "''")

async function upload(serviceKey, key, buffer, contentType = 'image/webp') {
  const r = await fetch(`${STORAGE}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buffer,
  })
  if (!r.ok) throw new Error(`Upload ${key}: ${r.status} ${await r.text()}`)
}

// ─── 1. Process and upload Paintin' the Ass image ──────────────────────────
async function uploadPaintinTheAss(serviceKey) {
  const src = "public/Margaret Edmondson/ARTWORK/Texas Themed/Paintin' the Ass.JPG"
  const buf = await readFile(src)
  const webp = await sharp(buf).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
  const key = 'web/texas-themed/paintin-the-ass.webp'
  await upload(serviceKey, key, webp)
  console.log(`  ✓ Paintin' the Ass: ${(buf.length / 1024 / 1024).toFixed(2)} MB → ${(webp.length / 1024).toFixed(0)} KB`)
  return `${STORAGE}/storage/v1/object/public/${BUCKET}/${key}`
}

// ─── 2. Insert new categories ──────────────────────────────────────────────
async function insertNewCategories() {
  const rows = [
    { slug: 'beach', name: 'Beach', desc: 'Coastal scenes, South Carolina landmarks, and beach life — vacations from Alabama to California.', sort: 1 },
    { slug: 'landscapes', name: 'Landscapes', desc: 'Arizona deserts, Texas pastorals, mountain vistas, and quiet countryside.', sort: 2 },
    { slug: 'animals', name: 'Animals', desc: 'Cattle, horses, and dogs — the creatures who anchor a place.', sort: 3 },
    { slug: 'mixed-media', name: 'Mixed Media', desc: 'Collage and found-poetry works from the Encouragement Series and related projects.', sort: 4 },
  ]
  for (const r of rows) {
    await sql(`insert into categories (slug, name, description, sort_order) values ('${esc(r.slug)}','${esc(r.name)}','${esc(r.desc)}',${r.sort}) on conflict (slug) do update set name=excluded.name, description=excluded.description, sort_order=excluded.sort_order;`)
  }
  console.log(`  ✓ Upserted 4 new categories`)
}

// ─── 3. Remap products to new categories ───────────────────────────────────
async function remapProducts() {
  // Single-category mapping heuristic by current title + folder.
  // ANIMALS: anything with cow/cattle/horse/donkey/dog/pet/animal in title or current Texas Themed cattle pieces
  // LANDSCAPES: Cactuses + Texas Themed landscapes (Flower Power, Spring Break, Deep in the Heart of Texas)
  // BEACH: current Beach & SC
  // MIXED MEDIA: Encouragement Series
  const beach = `(select id from categories where slug='beach')`
  const landscapes = `(select id from categories where slug='landscapes')`
  const animals = `(select id from categories where slug='animals')`
  const mixed = `(select id from categories where slug='mixed-media')`

  await sql(`update products set category_id = ${beach} where slug in ('aikens-rhett-house-sc','dig','dolphin-watch','drayton-hall-charleston-sc','fun-at-the-beach','magnolia-plantation-and-gardens-sc','poolside','road-trip','seaside-with-seagull','sweet-home-alabama');`)
  await sql(`update products set category_id = ${landscapes} where slug in ('hot-air','hot-air-ii','pins-and-needles','solo','sometime','the-dual','flower-power','spring-break-mountain-boat-dock','deep-in-the-heart-of-texas');`)
  await sql(`update products set category_id = ${animals} where slug in ('mad-cow','three-horses','graze-daze','keepsake','paintin-the-ass');`)
  await sql(`update products set category_id = ${mixed} where slug in ('arrival','curious-mind','due-date','grow','lets-go','perspective-play','potential','seasonal-inspiration','seeds','unexpected','unseen-purpose');`)
  console.log(`  ✓ Remapped existing products to new categories`)
}

// ─── 4. Create the Paintin' the Ass product + variants + image row ────────
async function createDonkeyProduct(publicUrl) {
  const existing = await sql(`select id from products where slug='paintin-the-ass';`)
  if (existing.length > 0) {
    console.log(`  ✓ Paintin' the Ass already exists (${existing[0].id})`)
    return existing[0].id
  }
  const pid = crypto.randomUUID()
  await sql(`
    insert into products (id, category_id, title, slug, description_html, medium, dimensions, base_price, fulfillment_type, status, is_original, is_featured, prints_enabled, tags, created_at, updated_at)
    values ('${pid}', (select id from categories where slug='animals'), 'Paintin'' the Ass', 'paintin-the-ass',
            '<p>Watercolor and water gouache painting of a donkey grazing in the Texas countryside. Original art on paper.</p>',
            'Watercolor / water gouache on paper', '8x8 in', 150,
            'lumaprints', 'active', true, true, true, ARRAY['donkey','texas','watercolor','animals'], now(), now());`)
  // Original variant
  await sql(`insert into product_variants (id, product_id, name, sku, price, variant_type, fulfillment_metadata, sort_order) values (gen_random_uuid(), '${pid}', 'Original', null, 150, 'original', '{"type":"original"}'::jsonb, 0);`)
  // 8 canvas + 8 framed canvas variants — same prices Mad Cow gets (already verified live with LumaPrints)
  const sizes = [
    ['8×10', 66.20, 116.91], ['11×14', 74.11, 149.86], ['12×16', 98.37, 186.94], ['16×20', 116.00, 211.26],
    ['18×24', 136.66, 234.91], ['24×30', 161.83, 353.77], ['24×36', 170.80, 371.89], ['30×40', 198.51, 412.11],
  ]
  let i = 11
  for (const [size, canvasPrice, framedPrice] of sizes) {
    const sizeSafe = size.replace('×', 'x')
    await sql(`insert into product_variants (id, product_id, name, sku, price, variant_type, fulfillment_metadata, sort_order) values (gen_random_uuid(), '${pid}', 'Canvas ${size}', 'paintin-the-ass-canvas-${sizeSafe.toLowerCase()}', ${canvasPrice}, 'canvas_print', '{"size":"${size}","lumaprints_type":"stretched_canvas_1.25"}'::jsonb, ${i});`)
    i += 1
  }
  i = 21
  for (const [size, , framedPrice] of sizes) {
    const sizeSafe = size.replace('×', 'x')
    await sql(`insert into product_variants (id, product_id, name, sku, price, variant_type, fulfillment_metadata, sort_order) values (gen_random_uuid(), '${pid}', 'Framed Canvas ${size}', 'paintin-the-ass-framed-${sizeSafe.toLowerCase()}', ${framedPrice}, 'framed_canvas_print', '{"size":"${size}","lumaprints_type":"framed_canvas_1.25"}'::jsonb, ${i});`)
    i += 1
  }
  // Primary image
  await sql(`insert into product_images (id, product_id, url, alt_text, is_primary, sort_order) values (gen_random_uuid(), '${pid}', '${esc(publicUrl)}', 'Paintin'' the Ass — donkey in Texas countryside', true, 0);`)
  console.log(`  ✓ Created Paintin' the Ass product (${pid})`)
  return pid
}

// ─── 5. Activate Unexpected ────────────────────────────────────────────────
async function activateUnexpected() {
  await sql(`update products set status='active', is_featured=true where slug='unexpected';`)
  console.log(`  ✓ Unexpected → active + featured`)
}

// ─── 6. Hot Air sort: bump Hot Air II's created_at to be later ─────────────
async function reorderHotAir() {
  await sql(`update products set created_at = (select created_at from products where slug='hot-air') - interval '1 second' where slug='hot-air-ii';`)
  // Wait — that makes II OLDER → newest-first puts I first. Actually we want I first under newest-first sort, so II should be OLDER.
  // Hmm. Newest first = descending created_at. So earlier date = lower position. To put Hot Air FIRST (top), Hot Air needs LATER created_at than II.
  await sql(`update products set created_at = (select created_at from products where slug='hot-air-ii') + interval '1 second' where slug='hot-air';`)
  console.log(`  ✓ Hot Air created_at bumped after Hot Air II`)
}

// ─── 7. Update featured_grid block + add commission_feature block ──────────
async function updateHomeBlocks(donkeyId) {
  const unexpected = (await sql(`select id from products where slug='unexpected';`))[0].id
  const config = JSON.stringify({
    heading: 'Featured Work',
    subheading: "Two pieces from the studio I'm proud of right now",
    product_ids: [donkeyId, unexpected],
  })
  await sql(`update page_blocks set config = '${esc(config)}'::jsonb, updated_at = now() where page='home' and block_type='featured_grid';`)
  console.log(`  ✓ featured_grid → 2 product_ids`)

  // Commission feature — primary image is the existing custom pet portrait
  const petUrl = (await sql(`select url from product_images where url like '%custom-pet-portrait-example_1%' and is_primary = true limit 1;`))[0]?.url
    || 'https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/public/product-images/web/custom-portrait-options/custom-pet-portrait-example_1.webp'
  const commissionConfig = JSON.stringify({
    heading: 'Commission a Piece',
    subheading: 'Custom pet & house portraits in your medium of choice.',
    body: 'From a wedding portrait to a long-loved dog, Margaret will work with your photos and notes to create a one-of-a-kind painting for your home.',
    image_url: petUrl,
    cta_text: 'Request a Commission',
    cta_link: '/commissions',
  })
  // Insert or update — sort_order should land between categories_showcase and testimonials
  const existing = await sql(`select id, sort_order from page_blocks where page='home' and block_type='commission_feature';`)
  if (existing.length > 0) {
    await sql(`update page_blocks set config = '${esc(commissionConfig)}'::jsonb, is_visible = true, updated_at = now() where id = '${existing[0].id}';`)
  } else {
    const cats = await sql(`select sort_order from page_blocks where page='home' and block_type='categories_showcase';`)
    const order = (cats[0]?.sort_order ?? 50) + 5
    await sql(`insert into page_blocks (id, page, block_type, sort_order, is_visible, config) values (gen_random_uuid(), 'home', 'commission_feature', ${order}, true, '${esc(commissionConfig)}'::jsonb);`)
  }
  console.log(`  ✓ commission_feature block ready`)
}

async function main() {
  const serviceKey = await svc()
  console.log('1. Upload Paintin\' the Ass image')
  const publicUrl = await uploadPaintinTheAss(serviceKey)
  console.log('2. Insert new categories')
  await insertNewCategories()
  console.log('3. Create Paintin\' the Ass product')
  const donkeyId = await createDonkeyProduct(publicUrl)
  console.log('4. Activate Unexpected')
  await activateUnexpected()
  console.log('5. Remap all products to new categories')
  await remapProducts()
  console.log('6. Reorder Hot Air vs Hot Air II')
  await reorderHotAir()
  console.log('7. Update home blocks (featured_grid + commission_feature)')
  await updateHomeBlocks(donkeyId)
  console.log('\nDone.')
}

main().catch((err) => { console.error(err); process.exit(1) })
