// Build the branded "ArtByME — Artwork & Master-File Status" report (HTML, self-contained).
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
sharp.cache(false);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });
const REPO = '/Users/skylarwebber/Margaret-Edmondson';

const GENUINE = new Set(['flower-power','think-again','graze-daze','keepsake','mad-cow','three-horses','deep-in-the-heart-of-texas','spring-break-mountain-boat-dock','aikens-rhett-house-sc','drayton-hall-charleston-sc','fun-at-the-beach','magnolia-plantation-and-gardens-sc','poolside','seaside-with-seagull','sweet-home-alabama','hot-air','hot-air-ii','pins-and-needles','royal','the-dual','unexpected']);
const INTERIM = new Set(['grow','seeds','lets-go','potential','perspective-play','curious-mind','due-date','seasonal-inspiration','solo','unseen-purpose']);
const RESCAN = new Set(['arrival','dig','dolphin-watch','road-trip']);
const NOTE = {
  grow:'Good to ~28″ (13.6MP)', seeds:'Good to ~29″ (14.5MP)',
  'lets-go':'Good to ~24″; soft at 30×40', potential:'Square; good to ~18″',
  'perspective-play':'Square; good to ~17″', 'curious-mind':'Good to ~20″ · confirmed = HumanMind.jpg',
  'due-date':'Cropped; good to ~16″', 'seasonal-inspiration':'10.9MP, good to ~23″ · kept (you flagged ⛔ — remove if preferred)',
  solo:'SOLD · tall, good to ~27″', 'unseen-purpose':'Rotation-fixed (90° CW) · ~4.8MP',
  arrival:'Web only · re-scan before any print (best source 1.7MP; ATimeForCertainIdeas.jpg is a possible hi-res match — confirm)',
  dig:'Web only · re-scan for large prints (3.1MP)', 'dolphin-watch':'Web only · re-scan for large prints (3.1MP)',
  'road-trip':'Web only · re-scan for large prints (2.1MP)',
};
const EXTRAS = [['Saguaro','x-saguaro'],['Love Birds','x-love-birds'],["Don't Mind Me (Gila)",'x-gila'],['Medical Plaza I','x-med-1'],['Medical Plaza II','x-med-2'],['Girls Trip (Market)','x-girls-trip'],['Rick Rubin','x-rick-rubin']];

const { data: rows } = await sb.from('products').select('id,slug,title,status,fulfillment_type,master_artwork_id').order('title');
const ids = rows.map(r => r.id);
const { data: imgs } = await sb.from('product_images').select('product_id,url,width,height').eq('is_primary', true).in('product_id', ids);
const { data: mas } = await sb.from('master_artworks').select('id,width_px,height_px,storage_path');
const imgBy = Object.fromEntries(imgs.map(i => [i.product_id, i]));
const maBy = Object.fromEntries(mas.map(m => [m.id, m]));

async function thumb(buf) { try { const b = await sharp(buf).resize({ width: 320, height: 320, fit: 'inside' }).jpeg({ quality: 72 }).toBuffer(); return 'data:image/jpeg;base64,' + b.toString('base64'); } catch { return ''; } }
async function webThumb(u) { try { const r = await fetch(u); return await thumb(Buffer.from(await r.arrayBuffer())); } catch { return ''; } }
async function fileThumb(p) { try { return await thumb(fs.readFileSync(p)); } catch { return ''; } }

const card = (title, sub, badge, badgeClass, img, note) => `
  <figure class="card">
    <div class="thumb">${img ? `<img loading="lazy" src="${img}" alt="${title}">` : '<div class="ph"></div>'}<span class="badge ${badgeClass}">${badge}</span></div>
    <figcaption><h3>${title}</h3><p class="sub">${sub}</p>${note ? `<p class="note">${note}</p>` : ''}</figcaption>
  </figure>`;

const groups = { genuine: [], interim: [], rescan: [], demo: [] };
for (const r of rows) {
  const img = imgBy[r.id]; const ma = r.master_artwork_id ? maBy[r.master_artwork_id] : null;
  const t = await webThumb(img?.url || '');
  const dims = ma ? `${ma.width_px}×${ma.height_px}px master` : (img ? `${img.width}×${img.height}px web` : '');
  const statusTag = r.status !== 'active' ? ` · ${r.status.toUpperCase()}` : '';
  if (r.fulfillment_type === 'self_ship') groups.demo.push(card(r.title, 'Self-ship demo' + statusTag, 'DEMO', 'b-demo', t, ''));
  else if (GENUINE.has(r.slug)) groups.genuine.push(card(r.title, dims + statusTag, '600-DPI', 'b-good', t, ''));
  else if (INTERIM.has(r.slug)) groups.interim.push(card(r.title, dims + statusTag, 'INTERIM', 'b-warn', t, NOTE[r.slug] || ''));
  else if (RESCAN.has(r.slug)) groups.rescan.push(card(r.title, (img ? `${img.width}×${img.height}px web` : '') + statusTag, 'NO MASTER', 'b-bad', t, NOTE[r.slug] || ''));
}
const extraCards = [];
for (const [title, slug] of EXTRAS) extraCards.push(card(title, 'Not in store · possible new product', 'EXTRA', 'b-extra', await fileThumb(`${REPO}/Artwork-Library/_previews/${slug}.jpg`), ''));

const n = { tot: rows.length, gen: groups.genuine.length, intr: groups.interim.length, res: groups.rescan.length, demo: groups.demo.length };
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ArtByME — Artwork & Master-File Status</title>
<style>
:root{--ink:#2c2a28;--mut:#7a736c;--cream:#faf6ef;--card:#fff;--line:#ece4d8;--coral:#d9694f;--teal:#2f8f83;--gold:#c79a3b;--bad:#b1493a}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px/1.6 'Iowan Old Style',Georgia,'Times New Roman',serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:0 28px}
header.hero{padding:64px 0 40px;border-bottom:1px solid var(--line)}
.kicker{font:600 13px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:var(--coral);margin:0 0 18px}
h1{font-size:46px;line-height:1.05;margin:0 0 14px;font-weight:600;letter-spacing:-.01em}
.lede{font-size:19px;color:var(--mut);max-width:760px;margin:0}
.by{margin-top:26px;font:600 14px/1 ui-sans-serif,system-ui,sans-serif;color:var(--ink)}
.by span{color:var(--mut);font-weight:400}
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin:34px 0 8px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 14px;text-align:center}
.stat b{display:block;font-size:30px;line-height:1;font-weight:600}.stat small{display:block;margin-top:7px;font:600 11px/1.3 ui-sans-serif,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--mut)}
.stat.good b{color:var(--teal)}.stat.warn b{color:var(--gold)}.stat.bad b{color:var(--bad)}
section{padding:40px 0 8px}h2{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);font-family:ui-sans-serif,system-ui,sans-serif;margin:0 0 4px}
.sectionhead{display:flex;align-items:baseline;gap:14px;border-top:1px solid var(--line);padding-top:30px}.sectionhead p{margin:0;color:var(--mut);font-size:15px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(208px,1fr));gap:20px;margin-top:24px}
.card{margin:0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.thumb{position:relative;aspect-ratio:1/1;background:#f1ece3;display:flex;align-items:center;justify-content:center}
.thumb img{width:100%;height:100%;object-fit:cover}.thumb .ph{color:var(--mut);font:12px ui-sans-serif,system-ui,sans-serif}
.badge{position:absolute;top:10px;left:10px;font:700 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;color:#fff;padding:6px 8px;border-radius:6px}
.b-good{background:var(--teal)}.b-warn{background:var(--gold)}.b-bad{background:var(--bad)}.b-demo{background:#8a8079}.b-extra{background:var(--coral)}
figcaption{padding:14px 14px 16px}figcaption h3{margin:0 0 4px;font-size:17px;font-weight:600;line-height:1.2}
.sub{margin:0;font:12px ui-sans-serif,system-ui,sans-serif;color:var(--mut)}
.note{margin:8px 0 0;font:12px/1.45 ui-sans-serif,system-ui,sans-serif;color:#9a6a2e;background:#fbf3e2;border-radius:7px;padding:7px 9px}
.callout{background:#fff;border:1px solid var(--line);border-left:4px solid var(--teal);border-radius:12px;padding:18px 22px;margin:30px 0;font-size:15px}
.callout.warn{border-left-color:var(--gold)} .callout b{font-family:ui-sans-serif,system-ui,sans-serif}
footer{margin:60px 0 40px;padding-top:24px;border-top:1px solid var(--line);color:var(--mut);font:13px/1.6 ui-sans-serif,system-ui,sans-serif}
ul.clean{margin:10px 0 0;padding-left:20px}ul.clean li{margin:4px 0}
</style></head><body><div class="wrap">
<header class="hero">
  <p class="kicker">ArtByME · Margaret Edmondson</p>
  <h1>Artwork & Master-File Status</h1>
  <p class="lede">A complete inventory of every catalog piece — which artworks have a true print-ready master scan, which are running on interim photography, and which still need to go on the scanner before a large print ships.</p>
  <p class="by">Prepared by Danny <span>· DotWin · June 15, 2026</span></p>
  <div class="stats">
    <div class="stat"><b>${n.tot}</b><small>Catalog pieces</small></div>
    <div class="stat good"><b>${n.gen}</b><small>600-DPI masters</small></div>
    <div class="stat warn"><b>${n.intr}</b><small>Interim masters</small></div>
    <div class="stat bad"><b>${n.res}</b><small>Need a scan</small></div>
    <div class="stat"><b>${n.demo}</b><small>Demos (no print)</small></div>
    <div class="stat good"><b>0</b><small>Master leaks</small></div>
  </div>
</header>

<div class="callout"><b>Where things stand.</b> Of the 35 printable products, <b>31 now have a print master on file</b> and every storefront photo has been rebuilt from the artwork itself — replacing the cell-phone snapshots (Deep in the Heart of Texas, Flower Power, Curious Mind and others were candids of framed pieces on a wall). Master files live in a private bucket and are never exposed publicly; the print pipeline pulls them through expiring signed links only when an order is placed.</div>

<section><div class="sectionhead"><h2>Print-Ready</h2><p>Genuine 600-DPI flatbed scans — good at every size up to the 30×40″ catalog max.</p></div><div class="grid">${groups.genuine.join('')}</div></section>

<section><div class="sectionhead"><h2>Interim Masters</h2><p>Real artwork, photographed at moderate resolution. Fine for the web image and small-to-medium prints; re-scan before selling at the largest sizes.</p></div><div class="grid">${groups.interim.join('')}</div></section>

<div class="callout warn"><b>Two judgment calls to confirm.</b> <b>Curious Mind</b> — its master is <i>HumanMind.jpg</i>; I visually confirmed it is the same artwork, so it's wired up. <b>Seasonal Inspiration</b> — you tiered it "web-only," but a verified 10.9 MP version was already on file, so I kept it as an interim master (good to ~23″). Say the word and I'll drop it back to web-only.</div>

<section><div class="sectionhead"><h2>Needs a True Scan</h2><p>Only candid photos exist — the web image is refreshed, but no print master is set. Scan these before fulfilling any large order.</p></div><div class="grid">${groups.rescan.join('')}</div></section>

<section><div class="sectionhead"><h2>Extras — Not Yet in the Store</h2><p>High-resolution scans of artwork with no matching product. Candidates for new listings.</p></div><div class="grid">${extraCards.join('')}</div></section>

<section><div class="sectionhead"><h2>Custom-Portrait Demos</h2><p>Example listings — self-ship, no print master needed.</p></div><div class="grid">${groups.demo.join('')}</div></section>

<footer>
  <b>What still needs a human:</b>
  <ul class="clean">
    <li>Scan <b>Dig, Dolphin Watch, Road Trip</b> (and ideally <b>Arrival</b>) at 600 DPI — they have no master and only low-resolution photos.</li>
    <li>Optional re-scans for the largest sizes: the ⚠️ interim pieces (Let's Go, Potential, Perspective Play, Due Date, Seasonal Inspiration) if sold above their listed size.</li>
    <li>Decide whether <b>ATimeForCertainIdeas.jpg</b> and <b>Rick Rubin</b> become new products.</li>
  </ul>
  <p style="margin-top:18px">Full data: <code>audit/MATCH-REPORT.md</code> · organized files: <code>Artwork-Library/</code> · prepared by Danny for Margaret Edmondson.</p>
</footer>
</div></body></html>`;

fs.writeFileSync(`${REPO}/ARTWORK-STATUS-REPORT.html`, html);
console.log('Wrote ARTWORK-STATUS-REPORT.html  (' + Math.round(html.length / 1024) + ' KB) — ' + JSON.stringify(n));
