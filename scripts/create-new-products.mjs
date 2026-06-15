// Create new DRAFT products for the new scans (excl. Medical Plaza).
// Each: upload master (downscaled if >44MB), regen web image, products row (draft),
// primary product_images, clone the print variants from a template product.
// node --env-file=.env.local --max-old-space-size=8192 scripts/create-new-products.mjs
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
sharp.cache(false); sharp.concurrency(1);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || !/klwkajukicsoiwpsgftt/.test(url)) throw new Error('env');
const sb = createClient(url, key, { auth: { persistSession: false } });
const WORK = '/Users/skylarwebber/Margaret-Edmondson/public/Margaret-Scans/05_08_26/WORKING';
const PUB = `${url}/storage/v1/object/public/product-images/`;
const STANDARD_MAX = 44 * 1024 * 1024;
const CAT = { Animals: '6b305ae1-ec0a-4766-9806-7f9eceace20d', Beach: 'fb3e9046-82d9-40b4-a54c-ec30c65336bd', Landscapes: '916f4f42-c052-4839-b8bf-f7edd5b8a9ee', 'Mixed Media': 'd7745a35-e1eb-47b7-8a18-bb0ee2297e5a' };

const NEW = [
  { slug: 'saguaro', title: 'Saguaro', cat: 'Landscapes', medium: 'Charcoal on paper', dim: '18x24 in', src: `${WORK}/Saguaro,18X24_CACTUS.jpg` },
  { slug: 'love-birds', title: 'Love Birds', cat: 'Animals', medium: 'Charcoal and book pages on paper', dim: '18x24 in', src: `${WORK}/LOVE BIRDS-18-24_1.jpg` },
  { slug: 'dont-mind-me', title: "Don't Mind Me", cat: 'Animals', medium: 'Charcoal on paper', dim: '18x24 in', src: `${WORK}/Don't Mind Me 18X24_Gila.jpg` },
  { slug: 'girls-trip', title: 'Girls Trip', cat: 'Landscapes', medium: 'Watercolor on paper', dim: '8x8 in', src: `${WORK}/Girls Trip, 8X8_MARKET WATERCOLOR.jpg` },
];

// template print variants (exclude the original)
const { data: tmplProd } = await sb.from('products').select('id').eq('slug', 'the-dual').single();
const { data: tmplVars } = await sb.from('product_variants').select('*').eq('product_id', tmplProd.id).neq('variant_type', 'original');
console.log(`template: ${tmplVars.length} print variants to clone`);

async function fitMaster(src, max) {
  const bytes = fs.statSync(src).size;
  if (bytes <= max) return { buf: fs.readFileSync(src), down: false };
  for (const cap of [13000, 11000, 10000, 9000, 8000]) {
    const buf = await sharp(src, { limitInputPixels: false }).rotate().resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    if (buf.length <= max) return { buf, down: true };
  }
  return { buf: await sharp(src, { limitInputPixels: false }).rotate().resize({ width: 7000, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer(), down: true };
}
async function webWebp(src) {
  let q = 82, out;
  do { out = await sharp(src, { limitInputPixels: false }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').webp({ quality: q, effort: 5 }).toBuffer(); q -= 4; } while (out.length / 1024 > 450 && q >= 70);
  const m = await sharp(out).metadata(); return { out, w: m.width, h: m.height };
}

for (const n of NEW) {
  const exists = await sb.from('products').select('id').eq('slug', n.slug).maybeSingle();
  if (exists.data) { console.log(`[skip] ${n.slug} already exists`); continue; }
  if (!fs.existsSync(n.src)) { console.log(`[ERR] missing source ${n.src}`); continue; }

  // master
  const mPath = `masters/new-2026/${n.slug}.jpg`;
  const fit = await fitMaster(n.src, STANDARD_MAX);
  const mm = await sharp(fit.buf).metadata();
  await sb.storage.from('print-masters').upload(mPath, fit.buf, { contentType: 'image/jpeg', upsert: true });
  const { data: ma } = await sb.from('master_artworks').insert({ title: n.title, storage_path: mPath, file_name: `${n.slug}.jpg`, file_size_bytes: fit.buf.length, mime_type: 'image/jpeg', width_px: mm.width, height_px: mm.height, dpi: mm.density ? Math.round(mm.density) : null }).select('id').single();

  // web image
  const web = await webWebp(n.src);
  const webKey = `web/new-2026/${n.slug}.webp`;
  await sb.storage.from('product-images').upload(webKey, web.out, { contentType: 'image/webp', upsert: true });

  // product (DRAFT)
  const { data: prod, error: pe } = await sb.from('products').insert({
    title: n.title, slug: n.slug, category_id: CAT[n.cat], base_price: 0, default_margin_pct: 100,
    fulfillment_type: 'lumaprints', prints_enabled: true, status: 'draft', is_original: false,
    medium: n.medium, dimensions: n.dim, master_artwork_id: ma.id,
    description_html: `<p>${n.title} — ${n.medium}, ${n.dim}.</p>`,
  }).select('id').single();
  if (pe) { console.log(`[ERR product ${n.slug}] ${pe.message}`); continue; }

  // primary image
  await sb.from('product_images').insert({ product_id: prod.id, url: PUB + webKey, alt_text: n.title, is_primary: true, sort_order: 0, width: web.w, height: web.h, print_master_path: mPath });

  // clone variants
  const rows = tmplVars.map(v => { const c = { ...v }; delete c.id; c.product_id = prod.id; return c; });
  const { error: ve } = await sb.from('product_variants').insert(rows);
  if (ve) console.log(`[ERR variants ${n.slug}] ${ve.message}`);

  console.log(`  ✓ ${n.slug}: product ${prod.id} · master ${mm.width}x${mm.height}${fit.down ? ' [downscaled]' : ''} · web ${web.w}x${web.h} · ${rows.length} variants · DRAFT`);
}
console.log('Done creating new products.');
