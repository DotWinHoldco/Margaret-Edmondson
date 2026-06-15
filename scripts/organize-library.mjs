// Build a clean, properly-named, browsable artwork library at the repo root.
// Renames cryptic size-token files to titles; groups by status + category.
// Print-grade copies capped at 6000px (full masters live in Supabase print-masters
// and the original scans in public/Margaret-Scans/). Also writes 900px previews + INDEX.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
sharp.cache(false); sharp.concurrency(1);
const REPO = '/Users/skylarwebber/Margaret-Edmondson';
const ART = `${REPO}/public/Margaret Edmondson/ARTWORK`;
const WORK = `${REPO}/public/Margaret-Scans/05_08_26/WORKING`;
const LIB = `${REPO}/Artwork-Library`;
const PREV = `${LIB}/_previews`;
fs.mkdirSync(PREV, { recursive: true });

// [status, category, Title, slug, sourceAbsPath]
const E = [
  // --- 01 PRINT-READY genuine 600-DPI masters (21) ---
  ['01_PRINT-READY_Masters','Texas-Themed','Flower Power','flower-power',`${WORK}/Flower Power 24X24_COW.jpg`],
  ['01_PRINT-READY_Masters','Texas-Themed','Think Again','think-again',`${WORK}/Think Again 36X48_Donkey.jpg`],
  ['01_PRINT-READY_Masters','Texas-Themed','Graze Daze','graze-daze',`${ART}/Official/36x24_01.jpg`],
  ['01_PRINT-READY_Masters','Texas-Themed','Keepsake','keepsake',`${ART}/Official/18x22.jpg`],
  ['01_PRINT-READY_Masters','Texas-Themed','Mad Cow','mad-cow',`${ART}/Official/04_8x8.jpg`],
  ['01_PRINT-READY_Masters','Texas-Themed','Three Horses','three-horses',`${ART}/Official/02_8x8.jpg`],
  ['01_PRINT-READY_Masters','Texas-Themed','Deep in the Heart of Texas','deep-in-the-heart-of-texas',`${ART}/Official/12 x 16 Indian Paintbrushes.jpg`],
  ['01_PRINT-READY_Masters','Texas-Themed','Spring Break (Mountain Boat Dock)','spring-break-mountain-boat-dock',`${ART}/Official/22x28 Mountain Boat Dock.jpg`],
  ['01_PRINT-READY_Masters','Beach-and-SC','Aikens-Rhett House SC','aikens-rhett-house-sc',`${ART}/Official/03_8x8.jpg`],
  ['01_PRINT-READY_Masters','Beach-and-SC','Drayton Hall Charleston SC','drayton-hall-charleston-sc',`${ART}/Official/01_8x8.jpg`],
  ['01_PRINT-READY_Masters','Beach-and-SC','Fun at the Beach','fun-at-the-beach',`${ART}/Official/11x 14 Children on Beach.jpg`],
  ['01_PRINT-READY_Masters','Beach-and-SC','Magnolia Plantation and Gardens SC','magnolia-plantation-and-gardens-sc',`${ART}/Official/05_8x8.jpg`],
  ['01_PRINT-READY_Masters','Beach-and-SC','Poolside','poolside',`${ART}/Official/4 x 12 Red Chairs.jpg`],
  ['01_PRINT-READY_Masters','Beach-and-SC','Seaside with Seagull','seaside-with-seagull',`${ART}/Official/12 x 12 Seaside with Bird.jpg`],
  ['01_PRINT-READY_Masters','Beach-and-SC','Sweet Home Alabama','sweet-home-alabama',`${ART}/Official/7 x 10 Beach in Pastels.jpg`],
  ['01_PRINT-READY_Masters','Cactuses','Hot Air','hot-air',`${ART}/Official/20x10_02.jpg`],
  ['01_PRINT-READY_Masters','Cactuses','Hot Air II','hot-air-ii',`${ART}/Official/18x8.5.jpg`],
  ['01_PRINT-READY_Masters','Cactuses','Pins and Needles','pins-and-needles',`${ART}/Official/7x11_01.jpg`],
  ['01_PRINT-READY_Masters','Cactuses','Royal','royal',`${ART}/Official/18x6.5.jpg`],
  ['01_PRINT-READY_Masters','Cactuses','The Dual','the-dual',`${ART}/Official/20x10_01.jpg`],
  ['01_PRINT-READY_Masters','Encouragement-Series','Unexpected','unexpected',`${ART}/Official/18X24_600DPI (1).jpg`],
  // --- 02 INTERIM (moderate-res; uploaded as provisional masters; re-scan for large format) (10) ---
  ['03_NEEDS-SCAN','Encouragement-Series','Arrival - NEEDS SCAN','arrival',`${ART}/Encouragement Series/Arrival_2.jpg`],
  ['02_INTERIM_Small-Prints-OK','Encouragement-Series','Curious Mind','curious-mind',`${ART}/Official/HumanMind.jpg`],
  ['02_INTERIM_Small-Prints-OK','Encouragement-Series','Due Date','due-date',`${ART}/Official/ADueDate.jpg`],
  ['02_INTERIM_Small-Prints-OK','Encouragement-Series','Grow','grow',`${ART}/Official/LetYourImaginationGrow.jpg`],
  ['02_INTERIM_Small-Prints-OK','Encouragement-Series',"Let's Go",'lets-go',`${ART}/Official/Let'sGo.jpg`],
  ['02_INTERIM_Small-Prints-OK','Encouragement-Series','Perspective Play','perspective-play',`${ART}/Official/Perspective.jpg`],
  ['02_INTERIM_Small-Prints-OK','Encouragement-Series','Potential','potential',`${ART}/Official/Potential.jpg`],
  ['02_INTERIM_Small-Prints-OK','Encouragement-Series','Seasonal Inspiration','seasonal-inspiration',`${ART}/Encouragement Series/Seasonal Inspiration.jpg`],
  ['02_INTERIM_Small-Prints-OK','Encouragement-Series','Seeds','seeds',`${ART}/Official/Seeds.jpg`],
  ['02_INTERIM_Small-Prints-OK','Encouragement-Series','Unseen Purpose','unseen-purpose',`${ART}/Official/UnseenPurpose.jpg`],
  // --- 03 NEEDS A TRUE SCAN (only candids / sold) (4) ---
  ['03_NEEDS-SCAN','Beach-and-SC','Dig - NEEDS SCAN','dig',`${ART}/Beach and SC/Dig.jpg`],
  ['03_NEEDS-SCAN','Beach-and-SC','Dolphin Watch - NEEDS SCAN','dolphin-watch',`${ART}/Beach and SC/Dolphin Watch.jpg`],
  ['03_NEEDS-SCAN','Beach-and-SC','Road Trip - NEEDS SCAN','road-trip',`${ART}/Beach and SC/Road Trip.jpg`],
  ['02_INTERIM_Small-Prints-OK','Cactuses','Solo (SOLD, interim 7.5MP)','solo',`${ART}/Cactuses/Solo.jpg`],
  // --- 04 EXTRAS not in store (possible new products) (7) ---
  ['04_EXTRAS_New-Artwork','_','Saguaro','x-saguaro',`${WORK}/Saguaro,18X24_CACTUS.jpg`],
  ['04_EXTRAS_New-Artwork','_','Love Birds','x-love-birds',`${WORK}/LOVE BIRDS-18-24_1.jpg`],
  ['04_EXTRAS_New-Artwork','_',"Don't Mind Me (Gila)",'x-gila',`${WORK}/Don't Mind Me 18X24_Gila.jpg`],
  ['04_EXTRAS_New-Artwork','_','Medical Plaza I','x-med-1',`${WORK}/12X8.5_MED PLAZA1.jpg`],
  ['04_EXTRAS_New-Artwork','_','Medical Plaza II','x-med-2',`${WORK}/Medical Plaza, Drawing12X8.5_MED PLAZA 2.jpg`],
  ['04_EXTRAS_New-Artwork','_','Girls Trip (Market)','x-girls-trip',`${WORK}/Girls Trip, 8X8_MARKET WATERCOLOR.jpg`],
  ['04_EXTRAS_New-Artwork','_','Rick Rubin','x-rick-rubin',`${ART}/Official/RickRubin.jpg`],
];

const CAP = 6000;
const rows = [];
for (const [status, cat, title, slug, src] of E) {
  if (!fs.existsSync(src)) { console.log('MISSING', title, src); rows.push({ status, cat, title, slug, ok: false }); continue; }
  const dir = cat === '_' ? `${LIB}/${status}` : `${LIB}/${status}/${cat}`;
  fs.mkdirSync(dir, { recursive: true });
  const meta = await sharp(src, { limitInputPixels: false }).metadata();
  const out = `${dir}/${title}.jpg`;
  await sharp(src, { limitInputPixels: false }).rotate()
    .resize({ width: CAP, height: CAP, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true }).toFile(out);
  await sharp(src, { limitInputPixels: false }).rotate()
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 }).toFile(`${PREV}/${slug}.jpg`);
  const mp = +((meta.width * meta.height) / 1e6).toFixed(1);
  rows.push({ status, cat, title, slug, ok: true, w: meta.width, h: meta.height, mp, dpi: meta.density || null });
  console.log(`${status.split('_')[0]} ${title}  ${meta.width}x${meta.height} ${mp}MP`);
}
fs.writeFileSync(`${LIB}/_previews/_manifest.json`, JSON.stringify(rows, null, 2));

// INDEX.md
const g = (s) => rows.filter(r => r.status === s && r.ok);
const line = (r) => `  - **${r.title}** — ${r.w}×${r.h} (${r.mp}MP${r.dpi?`, ${r.dpi}dpi`:''})`;
const md = `# Margaret Edmondson — Artwork Library
_Auto-organized ${'2026-06-15'}. Files renamed to titles; capped at ${CAP}px for browsing. Full-resolution masters live in Supabase \`print-masters\` and original scans in \`public/Margaret-Scans/\`._

## 01 — Print-Ready Masters (genuine 600-DPI scans) — ${g('01_PRINT-READY_Masters').length}
${g('01_PRINT-READY_Masters').map(line).join('\n')}

## 02 — Interim Masters (moderate-res; OK for small/medium prints, re-scan for 30×40) — ${g('02_INTERIM_Small-Prints-OK').length}
${g('02_INTERIM_Small-Prints-OK').map(line).join('\n')}

## 03 — Needs a True Scan (only candid photos on hand) — ${g('03_NEEDS-SCAN').length}
${g('03_NEEDS-SCAN').map(line).join('\n')}

## 04 — Extras / Possible New Products (not in the store) — ${g('04_EXTRAS_New-Artwork').length}
${g('04_EXTRAS_New-Artwork').map(line).join('\n')}
`;
fs.writeFileSync(`${LIB}/00_INDEX.md`, md);
console.log(`\nWrote ${LIB} (${rows.filter(r=>r.ok).length} works) + 00_INDEX.md + _previews/`);
