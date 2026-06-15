// Build a before/after QA image per product (current live web | new preview), then a contact sheet.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
sharp.cache(false);
const REPO = '/Users/skylarwebber/Margaret-Edmondson';
const PUB = 'https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/public/product-images/';
const map = JSON.parse(fs.readFileSync(`${REPO}/audit/appendix-a-map.json`, 'utf8')).matched;
const OUT = `${REPO}/audit/web-qa`; fs.mkdirSync(OUT, { recursive: true });
const TH = 460, LBL = 30;

for (const r of map) {
  const prev = `${REPO}/audit/web-preview/${r.slug}.webp`;
  if (!fs.existsSync(prev)) continue;
  let curBuf;
  try { const res = await fetch(PUB + r.primary_object_key); curBuf = Buffer.from(await res.arrayBuffer()); } catch { continue; }
  const cur = await sharp(curBuf).resize({ width: TH, height: TH, fit: 'inside' }).extend({ background: '#222' }).toBuffer().catch(()=>null);
  const nw = await sharp(prev).resize({ width: TH, height: TH, fit: 'inside' }).toBuffer();
  const cm = await sharp(cur).metadata(), nm = await sharp(nw).metadata();
  const H = Math.max(cm.height, nm.height) + LBL, W = cm.width + nm.width + 12;
  const lbl = (t) => Buffer.from(`<svg width="${W}" height="${LBL}"><rect width="100%" height="100%" fill="#000"/><text x="6" y="21" font-family="monospace" font-size="16" fill="#0f0">${t}</text></svg>`);
  await sharp({ create: { width: W, height: H, channels: 3, background: '#555' } })
    .composite([
      { input: cur, left: 0, top: LBL },
      { input: nw, left: cm.width + 12, top: LBL },
      { input: lbl(`${r.slug}   [ CURRENT (left) -> NEW (right) ]`), left: 0, top: 0 },
    ]).png().toFile(`${OUT}/${r.slug}.png`);
  console.log('qa', r.slug);
}
