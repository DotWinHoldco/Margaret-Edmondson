// Reconcile the 14 encouragement/beach products against the tier rules.
//  - regenerate web primary from the best source / linked master / rotated file
//  - add solo master; replace unseen-purpose master with rotated version
//  - keep verified interim masters; leave dig/dolphin/road-trip/arrival masterless (arrival removed separately)
// node --env-file=.env.local --max-old-space-size=8192 scripts/fourteen-reconcile.mjs
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
sharp.cache(false); sharp.concurrency(1);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });
const REPO = '/Users/skylarwebber/Margaret-Edmondson';
const ART = `${REPO}/public/Margaret Edmondson/ARTWORK`;
const FIX = `${REPO}/audit/image-fixes/unseen-purpose`;
const LONG = 2400, TKB = 450;

// web: 'master' (download linked master) | 'local' (use src) | 'file' (upload webfile as-is)
const T = [
  { slug: 'grow', web: 'master' },
  { slug: 'seeds', web: 'master' },
  { slug: 'lets-go', web: 'master' },
  { slug: 'potential', web: 'master' },
  { slug: 'perspective-play', web: 'master' },
  { slug: 'curious-mind', web: 'master' },
  { slug: 'due-date', web: 'master' },
  { slug: 'seasonal-inspiration', web: 'master' },
  { slug: 'solo', web: 'local', src: `${ART}/Cactuses/Solo.jpg`, addMaster: { folder: 'cactuses', title: 'Solo' } },
  { slug: 'unseen-purpose', web: 'file', webfile: `${FIX}/unseen-purpose_web_rotatedCW.webp`, replaceMaster: { folder: 'encouragement-series', title: 'Unseen Purpose', file: `${FIX}/unseen-purpose_master_rotatedCW.png`, ext: 'png', mime: 'image/png' } },
  { slug: 'arrival', web: 'local', src: `${ART}/Encouragement Series/Arrival_2.jpg` },
  { slug: 'dig', web: 'local', src: `${ART}/Beach and SC/Dig.jpg` },
  { slug: 'dolphin-watch', web: 'local', src: `${ART}/Beach and SC/Dolphin Watch.jpg` },
  { slug: 'road-trip', web: 'local', src: `${ART}/Beach and SC/Road Trip.jpg` },
];

const slugs = T.map(t => t.slug);
const { data: prods } = await sb.from('products').select('id, slug, title, master_artwork_id').in('slug', slugs);
const bySlug = Object.fromEntries(prods.map(p => [p.slug, p]));
const { data: imgs } = await sb.from('product_images').select('id, product_id, url, alt_text').eq('is_primary', true).in('product_id', prods.map(p => p.id));
const primByProd = Object.fromEntries(imgs.map(i => [i.product_id, i]));
const keyOf = (u) => u.split('/product-images/')[1];

async function toWebp(buf) {
  let q = 82, out;
  do { out = await sharp(buf, { limitInputPixels: false }).rotate().resize({ width: LONG, height: LONG, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').webp({ quality: q, effort: 5 }).toBuffer(); q -= 4; } while (out.length / 1024 > TKB && q >= 70);
  const m = await sharp(out).metadata(); return { out, w: m.width, h: m.height };
}

for (const t of T) {
  const prod = bySlug[t.slug]; if (!prod) { console.log(`[skip] no product ${t.slug}`); continue; }
  const prim = primByProd[prod.id]; const pkey = keyOf(prim.url);

  // --- master add/replace ---
  if (t.addMaster || t.replaceMaster) {
    const cfg = t.addMaster || t.replaceMaster;
    const isFile = !!t.replaceMaster;
    const ext = cfg.ext || 'jpg'; const mime = cfg.mime || 'image/jpeg';
    const mPath = `masters/${cfg.folder}/${t.slug}.${ext}`;
    const srcFile = isFile ? cfg.file : t.src;
    const meta = await sharp(srcFile, { limitInputPixels: false }).metadata();
    const body = fs.readFileSync(srcFile);
    const up = await sb.storage.from('print-masters').upload(mPath, body, { contentType: mime, upsert: true });
    if (up.error) { console.log(`[ERR master ${t.slug}] ${up.error.message}`); }
    else {
      const { data: ex } = await sb.from('master_artworks').select('id').eq('storage_path', mPath).maybeSingle();
      const row = { title: cfg.title, storage_path: mPath, file_name: `${t.slug}.${ext}`, file_size_bytes: body.length, mime_type: mime, width_px: meta.width, height_px: meta.height, dpi: meta.density ? Math.round(meta.density) : null };
      let id = ex?.id;
      if (id) await sb.from('master_artworks').update(row).eq('id', id);
      else { const ins = await sb.from('master_artworks').insert(row).select('id').single(); id = ins.data.id; }
      await sb.from('products').update({ master_artwork_id: id }).eq('id', prod.id);
      await sb.from('product_images').update({ print_master_path: mPath }).eq('id', prim.id);
      console.log(`  ${t.slug}: master ${isFile ? 'REPLACED' : 'ADDED'} ${meta.width}x${meta.height} -> ${mPath}`);
    }
  }

  // --- web regen ---
  let srcBuf;
  if (t.web === 'file') {
    srcBuf = null; // upload the prepared webp as-is
    const buf = fs.readFileSync(t.webfile);
    const { data: old } = await sb.storage.from('product-images').download(pkey);
    if (old) await sb.storage.from('product-images').upload(`_retired/${pkey}`, Buffer.from(await old.arrayBuffer()), { contentType: 'image/webp', upsert: true });
    await sb.storage.from('product-images').upload(pkey, buf, { contentType: 'image/webp', upsert: true });
    const m = await sharp(buf).metadata();
    const patch = { width: m.width, height: m.height }; if (!prim.alt_text) patch.alt_text = prod.title;
    await sb.from('product_images').update(patch).eq('id', prim.id);
    console.log(`  ${t.slug}: web (rotated file) ${m.width}x${m.height} -> ${pkey}`);
    continue;
  }
  if (t.web === 'master') {
    // download linked master
    const { data: ma } = await sb.from('master_artworks').select('storage_path').eq('id', prod.master_artwork_id).maybeSingle();
    const { data: blob, error } = await sb.storage.from('print-masters').download(ma.storage_path);
    if (error) { console.log(`[ERR dl master ${t.slug}] ${error.message}`); continue; }
    srcBuf = Buffer.from(await blob.arrayBuffer());
  } else {
    srcBuf = fs.readFileSync(t.src);
  }
  const { out, w, h } = await toWebp(srcBuf);
  const { data: old } = await sb.storage.from('product-images').download(pkey);
  if (old) await sb.storage.from('product-images').upload(`_retired/${pkey}`, Buffer.from(await old.arrayBuffer()), { contentType: 'image/webp', upsert: true });
  await sb.storage.from('product-images').upload(pkey, out, { contentType: 'image/webp', upsert: true });
  const patch = { width: w, height: h }; if (!prim.alt_text) patch.alt_text = prod.title;
  await sb.from('product_images').update(patch).eq('id', prim.id);
  console.log(`  ${t.slug}: web (${t.web}) ${w}x${h} ${Math.round(out.length/1024)}KB -> ${pkey}`);
}
console.log('Fourteen reconcile complete.');
