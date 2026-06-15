// Inventory candidate "master" folders with real metadata so we can judge
// whether files are genuine high-res scans or low-res web exports.
// Run: node --max-old-space-size=8192 scripts/inventory-artwork-tree.mjs <dir> [<dir> ...]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
sharp.cache(false);
sharp.concurrency(1);

const roots = process.argv.slice(2);
const out = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tif|tiff|jpe?g|png|webp)$/i.test(e.name)) out.push(p);
  }
}
for (const r of roots) { if (fs.existsSync(r)) walk(r); }

const rows = [];
for (const p of out) {
  const bytes = fs.statSync(p).size;
  let w = 0, h = 0, dpi = null, fmt = '?';
  try { const m = await sharp(p, { limitInputPixels: false }).metadata(); w = m.width; h = m.height; dpi = m.density || null; fmt = m.format; }
  catch (e) { fmt = 'ERR:' + e.message.slice(0, 30); }
  const mp = (w * h) / 1e6;
  const longEdge = Math.max(w, h);
  // px available for the long edge of a 30x40in print -> effective DPI at catalog max
  const effDpi30x40 = Math.round(Math.min(longEdge / 40, Math.min(w, h) / 30));
  rows.push({ p: p.replace('/Users/skylarwebber/', '~/'), mb: +(bytes / 1e6).toFixed(2), w, h, mp: +mp.toFixed(1), dpi, fmt, effDpi30x40 });
}
rows.sort((a, b) => a.p.localeCompare(b.p));
for (const r of rows) {
  console.log(`${String(r.mb).padStart(7)}MB  ${String(r.w).padStart(5)}x${String(r.h).padStart(5)}  ${String(r.mp).padStart(5)}MP  dpi=${String(r.dpi ?? '?').padStart(4)}  eff@30x40=${String(r.effDpi30x40).padStart(3)}  ${r.fmt.padEnd(4)}  ${r.p}`);
}
fs.writeFileSync('audit/artwork-tree-inventory.json', JSON.stringify(rows, null, 2));
console.log(`\n${rows.length} files. Wrote audit/artwork-tree-inventory.json`);
