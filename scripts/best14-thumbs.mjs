// Thumbnail the BEST-AVAILABLE image found anywhere for each of the 14
// "needs a scan" products, labeling each with its real resolution, so we can
// (a) visually confirm identity and (b) judge master-adequacy.
import sharp from 'sharp';
import fs from 'node:fs';
sharp.cache(false); sharp.concurrency(1);
const A = '/Users/skylarwebber/Downloads/public/Margaret Edmondson/ARTWORK';
const OUT = 'audit/thumbs/best14';
fs.mkdirSync(OUT, { recursive: true });

// slug -> [best source, MP, WxH, dpi-tag, verdict]
const BEST = [
  ['arrival',              `${A}/Encouragement Series/Arrival_2.jpg`,        '1.7MP_819x2047_NEEDS-SCAN'],
  ['curious-mind',         `${A}/Encouragement Series/Curious Mind.png`,     '0.1MP_254x405_NEEDS-SCAN'],
  ['dig',                  `${A}/Beach and SC/Dig.jpg`,                      '3.1MP_1536x2048_NEEDS-SCAN'],
  ['dolphin-watch',        `${A}/Beach and SC/Dolphin Watch.jpg`,            '3.1MP_2048x1536_NEEDS-SCAN'],
  ['road-trip',            `${A}/Beach and SC/Road Trip.jpg`,                '2.1MP_2046x1010_NEEDS-SCAN'],
  ['solo',                 `${A}/Cactuses/Solo.jpg`,                         '7.5MP_1887x4000_interim'],
  ['due-date',             `${A}/Official/ADueDate.jpg`,                     '4.7MP_1894x2470_interim'],
  ['grow',                 `${A}/Official/LetYourImaginationGrow.jpg`,       '13.6MP_3262x4180_interim'],
  ['lets-go',              `${A}/Official/Let'sGo.jpg`,                      '8.5MP_2300x3689_interim'],
  ['perspective-play',     `${A}/Official/Perspective.jpg`,                  '6.8MP_2612x2592_interim'],
  ['potential',            `${A}/Official/Potential.jpg`,                    '7.4MP_2725x2708_interim'],
  ['seasonal-inspiration', `${A}/Encouragement Series/Seasonal Inspiration.jpg`,'4.2MP_2047x2047_interim'],
  ['seeds',                `${A}/Official/Seeds.jpg`,                        '14.5MP_4291x3387_interim'],
  ['unseen-purpose',       `${A}/Official/UnseenPurpose.jpg`,                '4.8MP_2594x1832_interim'],
];
for (const [slug, src, tag] of BEST) {
  if (!fs.existsSync(src)) { console.log('MISSING', slug, src); continue; }
  await sharp(src, { limitInputPixels: false }).resize({ width: 760, height: 760, fit: 'inside' })
    .jpeg({ quality: 82 }).toFile(`${OUT}/${slug}__${tag}.jpg`);
  console.log('ok', slug);
}
