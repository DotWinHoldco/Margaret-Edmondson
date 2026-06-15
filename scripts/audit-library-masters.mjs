// Audit pre-existing library/<uuid>/ masters (uploaded via admin UI) for mis-links:
// download each, thumbnail it, fetch the linked product's web image, pair them.
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
sharp.cache(false);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });
const PUB = `${url}/storage/v1/object/public/product-images/`;
const OUT = '/Users/skylarwebber/Margaret-Edmondson/audit/thumbs/libaudit';
fs.mkdirSync(OUT, { recursive: true });

const { data: rows } = await sb.from('master_artworks')
  .select('id, title, storage_path, width_px, height_px')
  .like('storage_path', 'library/%').order('title');

for (const r of rows) {
  // who links this master?
  const { data: prod } = await sb.from('products').select('id, slug, title').eq('master_artwork_id', r.id).maybeSingle();
  const linked = prod ? prod.slug : 'UNLINKED';
  const base = `${linked}__${r.title.replace(/[^a-z0-9]+/gi,'_').slice(0,28)}`;
  // master thumb
  const { data: blob, error } = await sb.storage.from('print-masters').download(r.storage_path);
  if (error) { console.log('dl err', r.storage_path, error.message); continue; }
  const mbuf = Buffer.from(await blob.arrayBuffer());
  const mth = await sharp(mbuf).resize({ width: 420, height: 420, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  // product web thumb
  let wth = null;
  if (prod) {
    const { data: pi } = await sb.from('product_images').select('url').eq('product_id', prod.id).eq('is_primary', true).maybeSingle();
    if (pi?.url) { try { const wr = await fetch(pi.url); wth = await sharp(Buffer.from(await wr.arrayBuffer())).resize({ width: 420, height: 420, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer(); } catch {} }
  }
  // compose master | web
  const mm = await sharp(mth).metadata(); const wm = wth ? await sharp(wth).metadata() : { width: 420, height: 420 };
  const H = Math.max(mm.height, wm.height) + 30, W = mm.width + (wth ? wm.width : 420) + 12;
  const lbl = Buffer.from(`<svg width="${W}" height="30"><rect width="100%" height="100%" fill="#000"/><text x="6" y="21" font-family="monospace" font-size="14" fill="#0ff">${linked}  &lt;- MASTER "${r.title}" ${r.width_px}x${r.height_px}  | WEB(right)</text></svg>`);
  const comp = [{ input: mth, left: 0, top: 30 }, { input: lbl, left: 0, top: 0 }];
  if (wth) comp.push({ input: wth, left: mm.width + 12, top: 30 });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#555' } }).composite(comp).png().toFile(`${OUT}/${base}.png`);
  console.log(`${linked.padEnd(22)} <- "${r.title}" ${r.width_px}x${r.height_px}`);
}
console.log('done; thumbs in', OUT);
