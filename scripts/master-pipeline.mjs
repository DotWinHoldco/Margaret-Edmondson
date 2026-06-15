// ArtByME master pipeline — Phase 3 (masters) + Phase 2 (web regen).
//   node --env-file=.env.local --max-old-space-size=8192 scripts/master-pipeline.mjs --masters [--dry-run]
//   node --env-file=.env.local --max-old-space-size=8192 scripts/master-pipeline.mjs --web-build   (local webp + QA sheet, no upload)
//   node --env-file=.env.local --max-old-space-size=8192 scripts/master-pipeline.mjs --web-upload  (push reviewed webp in place, _retired backup)
import { createClient } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
sharp.cache(false); sharp.concurrency(1);

const ARGS = new Set(process.argv.slice(2));
const DRY = ARGS.has('--dry-run');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not loaded (use --env-file=.env.local)');
if (!/klwkajukicsoiwpsgftt/.test(url || '')) throw new Error('Wrong/blank Supabase project — abort.');
const sb = createClient(url, key, { auth: { persistSession: false } });

const REPO = '/Users/skylarwebber/Margaret-Edmondson';
const ART = `${REPO}/public/Margaret Edmondson/ARTWORK`;
const WORK = `${REPO}/public/Margaret-Scans/05_08_26/WORKING`;
const WEB_BUCKET = 'product-images', MASTER_BUCKET = 'print-masters';
const LONG_EDGE = 2400, TARGET_KB = 450;
const MANIFEST = `${REPO}/audit/pipeline-manifest.json`;
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const saveManifest = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

// slug -> { title, folder, key (primary web object), master (abs path to genuine 600dpi source) }
const P = [
  ['flower-power','Flower Power','texas-themed','web/texas-themed/flower-power_1.webp', `${WORK}/Flower Power 24X24_COW.jpg`],
  ['think-again','Think Again','texas-themed','web/texas-themed/paintin-the-ass.webp', `${WORK}/Think Again 36X48_Donkey.jpg`],
  ['graze-daze','Graze Daze','texas-themed','web/texas-themed/graze-daze_1.webp', `${ART}/Official/36x24_01.jpg`],
  ['keepsake','Keepsake','texas-themed','web/texas-themed/keepsake_1.webp', `${ART}/Official/18x22.jpg`],
  ['mad-cow','Mad Cow','texas-themed','web/texas-themed/mad-cow.webp', `${ART}/Official/04_8x8.jpg`],
  ['three-horses','Three Horses','texas-themed','web/texas-themed/three-horses.webp', `${ART}/Official/02_8x8.jpg`],
  ['deep-in-the-heart-of-texas','Deep in the Heart of Texas','texas-themed','web/texas-themed/deep-in-the-heart-of-texas_1.webp', `${ART}/Official/12 x 16 Indian Paintbrushes.jpg`],
  ['spring-break-mountain-boat-dock','Spring Break / Mountain Boat Dock','texas-themed','web/texas-themed/spring-break-mountain-boat-dock.webp', `${ART}/Official/22x28 Mountain Boat Dock.jpg`],
  ['aikens-rhett-house-sc','Aikens-Rhett House, SC','beach-and-sc','web/beach-and-sc/aikens-rhett-house-sc.webp', `${ART}/Official/03_8x8.jpg`],
  ['drayton-hall-charleston-sc','Drayton Hall, Charleston, SC','beach-and-sc','web/beach-and-sc/drayton-hall-charleston-sc.webp', `${ART}/Official/01_8x8.jpg`],
  ['fun-at-the-beach','Fun at the Beach','beach-and-sc','web/beach-and-sc/fun-at-the-beach_1.webp', `${ART}/Official/11x 14 Children on Beach.jpg`],
  ['magnolia-plantation-and-gardens-sc','Magnolia Plantation and Gardens, SC','beach-and-sc','web/beach-and-sc/magnolia-plantation-and-gardens-sc.webp', `${ART}/Official/05_8x8.jpg`],
  ['poolside','Poolside','beach-and-sc','web/beach-and-sc/poolside_1.webp', `${ART}/Official/4 x 12 Red Chairs.jpg`],
  ['seaside-with-seagull','Seaside with Seagull','beach-and-sc','web/beach-and-sc/seaside-with-seagull_1.webp', `${ART}/Official/12 x 12 Seaside with Bird.jpg`],
  ['sweet-home-alabama','Sweet Home Alabama','beach-and-sc','web/beach-and-sc/sweet-home-alabama.webp', `${ART}/Official/7 x 10 Beach in Pastels.jpg`],
  ['hot-air','Hot Air','cactuses','web/cactuses/hot-air_1-v2.webp', `${ART}/Official/20x10_02.jpg`],
  ['hot-air-ii','Hot Air II','cactuses','web/cactuses/hot-air-ii.webp', `${ART}/Official/18x8.5.jpg`],
  ['pins-and-needles','Pins and Needles','cactuses','web/cactuses/pins-and-needles.webp', `${ART}/Official/7x11_01.jpg`],
  ['sometime','Sometime','cactuses','web/cactuses/sometime.webp', `${ART}/Official/18x6.5.jpg`],
  ['the-dual','The Dual','cactuses','web/cactuses/the-dual_1.webp', `${ART}/Official/20x10_01.jpg`],
  ['unexpected','Unexpected','encouragement-series','web/encouragement-series/unexpected.webp', `${ART}/Official/18X24_600DPI (1).jpg`],
].map(([slug,title,folder,key,master]) => ({ slug, title, folder, key, master }));

// preflight: every master source exists
let missing = P.filter(p => !fs.existsSync(p.master));
if (missing.length) { console.log('MISSING MASTER SOURCES:\n' + missing.map(m=>'  '+m.slug+' -> '+m.master).join('\n')); process.exit(1); }

// fetch DB rows for these products
const slugs = P.map(p => p.slug);
const { data: prods, error: pe } = await sb.from('products').select('id, slug, title, fulfillment_type').in('slug', slugs);
if (pe) throw pe;
const bySlug = Object.fromEntries(prods.map(r => [r.slug, r]));
const { data: imgs, error: ie } = await sb.from('product_images').select('id, product_id, is_primary, url, alt_text, width, height').in('product_id', prods.map(p=>p.id)).eq('is_primary', true);
if (ie) throw ie;
const primaryByProduct = Object.fromEntries(imgs.map(r => [r.product_id, r]));

// snapshot backup (once per run)
const ts = (process.env.PIPELINE_TS || '').trim() || 'run';
const bdir = `${REPO}/audit/backups/${ts}`;
if (!DRY) { fs.mkdirSync(bdir, { recursive: true }); fs.writeFileSync(`${bdir}/products.json`, JSON.stringify(prods,null,2)); fs.writeFileSync(`${bdir}/product_images_primary.json`, JSON.stringify(imgs,null,2)); }

function mb(n){return (n/1e6).toFixed(1)+'MB';}

// Resumable (TUS) upload for files above the standard single-request gateway limit (~100MB).
const STANDARD_MAX = 45 * 1024 * 1024;
// Downscale an oversized master to a print-grade JPEG under the platform upload cap,
// maximizing resolution (still ~200-270 DPI at the 30x40 catalog max).
async function fitMaster(src, maxBytes) {
  for (const cap of [13000, 11000, 10000, 9000, 8000, 7000, 6000]) {
    const buf = await sharp(src, { limitInputPixels: false }).rotate()
      .resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    if (buf.length <= maxBytes) return buf;
  }
  return await sharp(src, { limitInputPixels: false }).rotate()
    .resize({ width: 6000, height: 6000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

async function uploadMaster(p) {
  const m = (manifest[p.slug] ||= {});
  if (m.master_done) { console.log(`  [skip] ${p.slug} master already done`); return; }
  const prod = bySlug[p.slug]; if (!prod) { console.log(`  [warn] no product row for ${p.slug}`); return; }
  const srcBytes = fs.statSync(p.master).size;
  const smeta = await sharp(p.master, { limitInputPixels: false }).metadata();
  const masterPath = `masters/${p.folder}/${p.slug}.jpg`;
  let body, upW, upH, upBytes, optimized = false;
  if (srcBytes > STANDARD_MAX) {
    body = await fitMaster(p.master, STANDARD_MAX);
    const bm = await sharp(body).metadata(); upW = bm.width; upH = bm.height; upBytes = body.length; optimized = true;
  } else {
    body = fs.readFileSync(p.master); upW = smeta.width; upH = smeta.height; upBytes = srcBytes;
  }
  console.log(`  ${p.slug}: src ${smeta.width}x${smeta.height} ${mb(srcBytes)} -> upload ${upW}x${upH} ${mb(upBytes)}${optimized?' [downscaled]':''} -> ${masterPath}`);
  if (DRY) return;
  const up = await sb.storage.from(MASTER_BUCKET).upload(masterPath, body, { contentType: 'image/jpeg', upsert: true });
  if (up.error) throw new Error(`upload ${p.slug}: ${up.error.message}`);
  // idempotent master_artworks: reuse row by storage_path if present
  const { data: existing } = await sb.from('master_artworks').select('id').eq('storage_path', masterPath).maybeSingle();
  let maId = existing?.id;
  const row = { title: p.title, storage_path: masterPath, file_name: `${p.slug}.jpg`, file_size_bytes: upBytes, mime_type: 'image/jpeg', width_px: upW, height_px: upH, dpi: smeta.density ? Math.round(smeta.density) : null };
  if (maId) { const u = await sb.from('master_artworks').update(row).eq('id', maId); if (u.error) throw u.error; }
  else { const ins = await sb.from('master_artworks').insert(row).select('id').single(); if (ins.error) throw ins.error; maId = ins.data.id; }
  const u1 = await sb.from('products').update({ master_artwork_id: maId }).eq('id', prod.id); if (u1.error) throw u1.error;
  const prim = primaryByProduct[prod.id];
  if (prim) { const u2 = await sb.from('product_images').update({ print_master_path: masterPath }).eq('id', prim.id); if (u2.error) throw u2.error; }
  m.master_done = true; m.master_artwork_id = maId; m.masterPath = masterPath; m.master_px = `${upW}x${upH}`; m.master_mb = +(upBytes/1e6).toFixed(1); m.master_optimized = optimized; saveManifest();
  console.log(`    ✓ master_artworks ${maId} + master_artwork_id + print_master_path set`);
}

if (ARGS.has('--masters')) {
  console.log(`\n=== PHASE 3: MASTERS (${DRY?'DRY':'APPLY'}) — ${P.length} products ===`);
  for (const p of P) { try { await uploadMaster(p); } catch (e) { console.log(`  [ERROR] ${p.slug}: ${e.message}`); (manifest[p.slug]||={}).master_error = e.message; saveManifest(); } }
  console.log('Phase 3 complete.');
}

// ---- Phase 2: web regen from the genuine master (clean, true aspect) ----
const PREVIEW = `${REPO}/audit/web-preview`;
async function webWebp(src) {
  let q = 82, buf;
  do {
    buf = await sharp(src, { limitInputPixels: false })
      .rotate().resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb').webp({ quality: q, effort: 5 }).toBuffer();
    q -= 4;
  } while (buf.length / 1024 > TARGET_KB && q >= 70);
  const m = await sharp(buf).metadata();
  return { buf, w: m.width, h: m.height, kb: Math.round(buf.length / 1024) };
}

if (ARGS.has('--web-build')) {
  fs.mkdirSync(PREVIEW, { recursive: true });
  console.log(`\n=== PHASE 2 BUILD: web previews -> ${PREVIEW} ===`);
  for (const p of P) {
    const w = await webWebp(p.master);
    fs.writeFileSync(`${PREVIEW}/${p.slug}.webp`, w.buf);
    const prim = primaryByProduct[bySlug[p.slug]?.id] || {};
    console.log(`  ${p.slug}: ${prim.width}x${prim.height} -> ${w.w}x${w.h} ${w.kb}KB`);
    (manifest[p.slug] ||= {}).web_preview = `${w.w}x${w.h}`;
  }
  saveManifest();
  console.log('Phase 2 build complete (no upload).');
}

if (ARGS.has('--web-upload')) {
  console.log(`\n=== PHASE 2 UPLOAD: web in place (${DRY?'DRY':'APPLY'}) ===`);
  const SKIP = new Set((process.env.WEB_SKIP || '').split(',').map(s=>s.trim()).filter(Boolean));
  for (const p of P) {
    if (SKIP.has(p.slug)) { console.log(`  [skip-flag] ${p.slug}`); continue; }
    const m = (manifest[p.slug] ||= {});
    if (m.web_done) { console.log(`  [skip] ${p.slug} web already done`); continue; }
    const pf = `${PREVIEW}/${p.slug}.webp`;
    if (!fs.existsSync(pf)) { console.log(`  [warn] no preview for ${p.slug}; run --web-build`); continue; }
    const buf = fs.readFileSync(pf);
    const md = await sharp(buf).metadata();
    console.log(`  ${p.slug}: ${md.width}x${md.height} ${Math.round(buf.length/1024)}KB -> ${WEB_BUCKET}/${p.key}`);
    if (DRY) continue;
    // backup current bytes to _retired
    const { data: old } = await sb.storage.from(WEB_BUCKET).download(p.key);
    if (old) { const ab = Buffer.from(await old.arrayBuffer()); await sb.storage.from(WEB_BUCKET).upload(`_retired/${p.key}`, ab, { contentType: 'image/webp', upsert: true }); }
    const up = await sb.storage.from(WEB_BUCKET).upload(p.key, buf, { contentType: 'image/webp', upsert: true });
    if (up.error) throw new Error(`web upload ${p.slug}: ${up.error.message}`);
    const prod = bySlug[p.slug]; const prim = primaryByProduct[prod.id];
    const patch = { width: md.width, height: md.height };
    if (prim && (!prim.alt_text || !prim.alt_text.trim())) patch.alt_text = p.title;
    if (prim) await sb.from('product_images').update(patch).eq('id', prim.id);
    m.web_done = true; m.web_px = `${md.width}x${md.height}`; saveManifest();
    console.log(`    ✓ uploaded + dims updated (backup at _retired/${p.key})`);
  }
  console.log('Phase 2 upload complete.');
}

console.log('\nDone.');
