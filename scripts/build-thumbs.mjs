// Build JPEG thumbnails for visual matching:
//  - 14 "needs a scan" product web references (fetched from public bucket)
//  - non-PDF master candidates (TIFs in WORKING + unidentified 8x8s)
// Captures source metadata to audit/thumb-meta.json
// Run: node --max-old-space-size=8192 scripts/build-thumbs.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
sharp.cache(false);
sharp.concurrency(1);

const PUB = 'https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/public/product-images/';
const SCAN = 'public/Margaret-Scans';
const OUT_CUR = 'audit/thumbs/current';
const OUT_CAND = 'audit/thumbs/cand';
fs.mkdirSync(OUT_CUR, { recursive: true });
fs.mkdirSync(OUT_CAND, { recursive: true });
const meta = {};

// --- 14 needs-a-scan web references ---
const WEB_REFS = [
  ['dig', 'web/beach-and-sc/dig.webp'],
  ['dolphin-watch', 'web/beach-and-sc/dolphin-watch.webp'],
  ['road-trip', 'web/beach-and-sc/road-trip.webp'],
  ['solo', 'web/cactuses/solo.webp'],
  ['arrival', 'web/encouragement-series/arrival_1.webp'],
  ['curious-mind', 'web/encouragement-series/curious-mind.webp'],
  ['due-date', 'web/encouragement-series/due-date.webp'],
  ['grow', 'web/encouragement-series/grow.webp'],
  ['lets-go', 'web/encouragement-series/lets-go.webp'],
  ['perspective-play', 'web/encouragement-series/perspective-play_1.webp'],
  ['potential', 'web/encouragement-series/potential.webp'],
  ['seasonal-inspiration', 'web/encouragement-series/seasonal-inspiration.webp'],
  ['seeds', 'web/encouragement-series/seeds.webp'],
  ['unseen-purpose', 'web/encouragement-series/unseen-purpose.webp'],
];

for (const [slug, key] of WEB_REFS) {
  try {
    const res = await fetch(PUB + key);
    if (!res.ok) { console.log(`WEBREF ${slug}: HTTP ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const m = await sharp(buf).metadata();
    await sharp(buf).resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 }).toFile(path.join(OUT_CUR, `${slug}.jpg`));
    meta[`current/${slug}`] = { w: m.width, h: m.height, kb: Math.round(buf.length / 1024) };
    console.log(`WEBREF ${slug}: ${m.width}x${m.height} (${Math.round(buf.length/1024)}KB) -> thumb`);
  } catch (e) { console.log(`WEBREF ${slug}: ERR ${e.message}`); }
}

// --- non-PDF master candidates ---
const CANDS = [
  ['cand_01_8x8', 'Feb 2026 copy/01_8x8.tif'],
  ['cand_02_8x8', 'Feb 2026 copy/02_8x8.tif'],
  ['cand_saguaro_cactus', '05_08_26/WORKING/18X24_CACTUS.tif'],
  ['cand_love_birds', '05_08_26/WORKING/LOVE BIRDS_18 x 24_1.tif'],
  ['cand_dont_mind_me_gila', "05_08_26/WORKING/Don't Mind Me 18X24_Gila.tif"],
  ['cand_med_plaza_1', '05_08_26/WORKING/12X8.5_MED PLAZA1.tif'],
  ['cand_med_plaza_2', '05_08_26/WORKING/Medical Plaza II,12X8.5_MED PLAZA 2.tif'],
  ['cand_girls_trip_market', '05_08_26/WORKING/8X8_MARKET WATERCOLOR.tif'],
];

for (const [label, rel] of CANDS) {
  const abs = path.join(SCAN, rel);
  try {
    if (!fs.existsSync(abs)) { console.log(`CAND ${label}: MISSING ${rel}`); continue; }
    const bytes = fs.statSync(abs).size;
    const m = await sharp(abs, { limitInputPixels: false }).metadata();
    await sharp(abs, { limitInputPixels: false })
      .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 }).toFile(path.join(OUT_CAND, `${label}.jpg`));
    const ar = (Math.max(m.width, m.height) / Math.min(m.width, m.height)).toFixed(3);
    meta[`cand/${label}`] = { src: rel, w: m.width, h: m.height, mb: +(bytes / 1e6).toFixed(1), dpi: m.density || null, ar: +ar, format: m.format };
    console.log(`CAND ${label}: ${m.width}x${m.height} AR=${ar} ${(bytes/1e6).toFixed(0)}MB dpi=${m.density||'?'} -> thumb`);
  } catch (e) { console.log(`CAND ${label}: ERR ${e.message}`); }
}

fs.writeFileSync('audit/thumb-meta.json', JSON.stringify(meta, null, 2));
console.log('\nWrote audit/thumb-meta.json');
