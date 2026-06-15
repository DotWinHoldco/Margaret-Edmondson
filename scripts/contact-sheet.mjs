// Build labeled contact sheets from a directory of thumbs.
// Run: node scripts/contact-sheet.mjs <srcDir> <outPng> <cols>
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
sharp.cache(false);

const [srcDir, outPng, colsArg] = process.argv.slice(2);
const COLS = parseInt(colsArg || '4', 10);
const TILE = 360, LABEL_H = 34, IMG = TILE - 8, GAP = 6;
const CELL_W = TILE + GAP, CELL_H = TILE + LABEL_H + GAP;

const files = fs.readdirSync(srcDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
const rows = Math.ceil(files.length / COLS);
const W = COLS * CELL_W + GAP, H = rows * CELL_H + GAP;

const composites = [];
for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const label = f.replace(/\.(jpg|jpeg|png)$/i, '');
  const cx = GAP + (i % COLS) * CELL_W, cy = GAP + Math.floor(i / COLS) * CELL_H;
  const tile = await sharp(path.join(srcDir, f))
    .resize({ width: IMG, height: IMG, fit: 'inside', withoutEnlargement: true })
    .toBuffer();
  const tm = await sharp(tile).metadata();
  // center image in the tile box
  const offx = cx + Math.round((TILE - tm.width) / 2);
  const offy = cy + Math.round((TILE - tm.height) / 2);
  composites.push({ input: tile, left: offx, top: offy });
  const svg = Buffer.from(
    `<svg width="${TILE}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#111"/>` +
    `<text x="${TILE/2}" y="22" font-family="monospace" font-size="18" fill="#fff" text-anchor="middle">${label}</text></svg>`
  );
  composites.push({ input: svg, left: cx, top: cy + TILE });
}

await sharp({ create: { width: W, height: H, channels: 3, background: '#444' } })
  .composite(composites).png().toFile(outPng);
console.log(`Wrote ${outPng}  (${files.length} tiles, ${COLS}x${rows})`);
