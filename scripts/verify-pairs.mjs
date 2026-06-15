// Fetch the live web images for 4 matched products and pair them with the
// candidate masters we think they are, for side-by-side confirmation.
import sharp from 'sharp';
import fs from 'node:fs';
sharp.cache(false);
const PUB = 'https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/public/product-images/';
const OUT = 'audit/thumbs/verify';
fs.mkdirSync(OUT, { recursive: true });

const REFS = [
  ['1a_ref_three-horses', 'web/texas-themed/three-horses.webp'],
  ['2a_ref_drayton-hall', 'web/beach-and-sc/drayton-hall-charleston-sc.webp'],
  ['3a_ref_flower-power', 'web/texas-themed/flower-power_1.webp'],
  ['4a_ref_think-again', 'web/texas-themed/paintin-the-ass.webp'],
];
for (const [name, key] of REFS) {
  const r = await fetch(PUB + key);
  const buf = Buffer.from(await r.arrayBuffer());
  await sharp(buf).resize({ width: 700, height: 700, fit: 'inside' }).jpeg({ quality: 84 }).toFile(`${OUT}/${name}.jpg`);
  console.log('ref', name, r.status);
}
const COPY = [
  ['1b_cand_02_8x8', 'audit/thumbs/cand/cand_02_8x8.jpg'],
  ['2b_cand_01_8x8', 'audit/thumbs/cand/cand_01_8x8.jpg'],
  ['3b_cand_pdf1', 'audit/thumbs/cand/cand_pdf1_square25.png'],
  ['4b_cand_pdf2', 'audit/thumbs/cand/cand_pdf2_36x49.png'],
];
for (const [name, src] of COPY) {
  await sharp(src).resize({ width: 700, height: 700, fit: 'inside' }).jpeg({ quality: 84 }).toFile(`${OUT}/${name}.jpg`);
  console.log('cand', name);
}
