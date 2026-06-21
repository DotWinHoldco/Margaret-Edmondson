# Claude Code Prompt — Artwork Scans → Web Images + LumaPrints Masters

**Run this from the repo root `~/Margaret-Edmondson`** (the Next.js 16 / Supabase app for artbyme.studio; package name `margaret-edmonson`). It contains the scans under `public/Margaret-Scans/` and the env files.

You are doing a second-pass image correction for the ArtByME store. Margaret is worried that some live product photos are candid cell-phone snapshots of her artwork instead of clean scans. Your job, **product by product**, is to (1) regenerate each product's web photo from its scan so it is a fast-loading, high-quality WebP, and (2) upload the full-resolution scan as the private "master" file that gets sent to LumaPrints when a print is ordered. Master files must **never** be public or shown on the site.

> **Why this runs here and not from the Cowork session:** the scans are real (≈14 GB of 600-DPI TIFs/JPGs) and the masters are large (TIFs from 50 MB to >1 GB), and **`SUPABASE_SERVICE_ROLE_KEY` is not set in the repo env** (only a placeholder in `.env.example`). Storage/DB writes need that key. **Before an apply run, export a real service-role key** (from Supabase dashboard → Project Settings → API), e.g. `export SUPABASE_SERVICE_ROLE_KEY=…`. Network to `klwkajukicsoiwpsgftt.supabase.co` is reachable.

Work in **phases**, in order. **Applies by default with backups + idempotency; pass `--dry-run` to preview.** Consistent with how this user wants autonomous runs: **never hard-stop** — process confident matches, and **skip + log** anything ambiguous to the report rather than blocking. Work on `main`, push commits, and use an annotated **restore tag** as the rollback point (no branches — they break this team's Vercel previews).

---

## Verified context (confirmed against production + the repo on 2026-06-14)

**Supabase project:** `MargaretEdmondson` — ref `klwkajukicsoiwpsgftt` (us-east-1). No edge functions; backend logic is in `src/app/api/**/route.ts` + Postgres.

**Storage buckets:**
- `product-images` — **PUBLIC**. Web photos live under `web/<folder>/<file>.webp` (folders: `texas-themed`, `beach-and-sc`, `cactuses`, `encouragement-series`, `custom-portrait-options`). 68 objects, all already WebP (≤1.25 MB).
- `print-masters` — **PRIVATE**, currently **EMPTY**. Masters go here. Never make it public; never expose its objects via a public URL.

**Relevant tables / columns:**
- `products` — `id, slug, title, category_id, status (active|draft|sold), fulfillment_type (lumaprints|self_ship), prints_enabled, master_artwork_id (uuid → master_artworks.id)`
- `product_images` — `id, product_id, url, alt_text, sort_order, is_primary, print_master_path, width, height`
- `master_artworks` — `id, title, description, storage_path, file_name, file_size_bytes, mime_type, width_px, height_px, dpi, uploaded_by, created_at, updated_at`
- `product_variants` — `product_id, width_in, height_in, medium, size_label, …` (for the print-resolution check; catalog max print = **30×40 in**).

**FK:** `products.master_artwork_id → master_artworks.id`.

**Current state (the problem):** **0** masters exist anywhere — 0 `master_artworks`, 0 `product_images.print_master_path`, 0 objects in `print-masters`. So **every printable product still needs a master built**. Catalog = 37 products: **35 `lumaprints`** (33 active; `Mad Cow` draft, `Solo` sold) + **2 `self_ship`** Custom Portrait demos (`prints_enabled=false`).

**Scan reality (verified — this is the important part):** **~22 of the 35** printable products have a usable source — **21 in `Margaret-Scans/`** plus **Unseen Purpose** (from `ARTWORK/`, needs a 90° CW rotation). The Encouragement/Mixed-Media pieces are **not** in `Margaret-Scans/` but most have moderate-res sources under **`public/Margaret Edmondson/ARTWORK/`** (check these in Phase 1 before calling anything unscanned). Only a few truly lack a source — likely **Dig, Dolphin Watch, Road Trip, Solo**. And **~6 scans are for artwork not in the store** (possible new products). See **Appendix A** for the confirmed, file-level mapping.

---

## The scans — location, structure, formats

Root: **`public/Margaret-Scans/`**. (Not "Margaret scans"; also ignore the low-res `Extracted Art Images/` folder in the user's Documents — those are ≤4.7 MP and are not masters.)

- **`Feb 2026 copy/`** — the main labeled set. Most artworks appear as a descriptive JPG (e.g. `Keepsake, 18x22.jpg`) **plus** a same-size-token TIF/PDF (e.g. `18x22.tif`). The **TIF is the master**; the descriptive JPG is a clean web source.
- **`05_08_26/WORKING/`** — newest (May 2026). Holds `Flower Power 24X24_COW.*`, `Think Again 36X48_Donkey.*`, and several artworks **not yet in the store** (Saguaro/Cactus, Love Birds, Don't Mind Me/Gila, Medical Plaza, Girls Trip/Market).
- **`Nov 2025 copy/`** — `Unexpected` (`18X24_600DPI.tif` master, `Unexpected, 18X24_600DPI.jpg` web). ⚠️ **Avoid** the `…_WHITE BORDER…` and `…SINATURE…` PDFs (bordered/signed variants — not the clean art).
- **Ignore** raw multi-page scanner dumps: `SCANS copy/`, `05_08_26/SCANS/`, and the sibling `public/SCANS/` (files `scan_2026_05-07_*.pdf`).

**Format-selection rules:**
- **Master** = highest-quality clean file for the artwork: prefer **`.tif`**; else the largest clean **`.jpg`**. Never a `*WHITE BORDER*` / `*SINATURE*` variant. (LumaPrints accepts TIFF/JPEG/PNG.)
- **Web source** = the same artwork's clean descriptive **`.jpg`** (or downscale the TIF). Strip to the artwork only.
- A few artworks have **JPG only, no TIF** (*Three Horses*, *Drayton Hall*) — use the JPG as master and **flag as lower-resolution**.

---

## Guardrails (every phase)

1. **Applies by default; `--dry-run` previews** (reports/CSVs only, no writes). Before the first apply, create a restore tag: `git tag -a images-pipeline-pre -m "pre image/master pipeline"` (no branches).
2. **Back up before mutating.** Copy any `product-images` object you overwrite to `product-images/_retired/<key>` (don't delete). Snapshot affected `products` + `product_images` rows to `audit/backups/<ts>/`.
3. **Idempotent.** Track progress in `audit/pipeline-manifest.json`; re-runs skip completed products and fill gaps only.
4. **Masters stay private.** Never make `print-masters` public; never put a master URL in `product_images.url`. Verify at the end.
5. **Primary photo only, automatically.** Regenerate only the `is_primary` image from the scan. Flag (don't auto-replace) non-primary images.
6. **Never leave a candid as a primary.** If a product has a scan, its primary ends up scan-derived. If it has **no** scan, leave it untouched and list under "Needs a scan."
7. **Stable URLs.** Write the regenerated web image **in place** at the existing object key; just update `width`/`height` (+ `alt_text` if empty).
8. Use `SUPABASE_SERVICE_ROLE_KEY` (exported in the shell — it is *not* in `.env.local`) + `NEXT_PUBLIC_SUPABASE_URL` for all writes. Never print the key.

---

## Phase 0 — Preflight & discovery

1. Confirm repo root, `public/Margaret-Scans/` exists, and `NEXT_PUBLIC_SUPABASE_URL` resolves to ref `klwkajukicsoiwpsgftt`. Confirm `SUPABASE_SERVICE_ROLE_KEY` is exported and non-empty (**abort with a clear message if missing** — it is not in the repo env).
2. Tooling: Node, `@supabase/supabase-js`, **`sharp`** (handles TIF→WebP, metadata, DPI). For multi-hundred-MB TIFs, set `sharp.cache(false)` and a generous `--max-old-space-size`; cap pixel limits with `sharp({ limitInputPixels: false })`.
3. **Find which field the order flow sends to LumaPrints.** Grep:
   ```
   rg -n "master_artwork|print_master_path|print-masters|master_artworks|lumaprints|createPrintOrder|imageUrl" src/ --type ts
   ```
   Populate whatever the fulfillment code actually reads — `products.master_artwork_id → master_artworks.storage_path`, or `product_images.print_master_path`, or **both** if ambiguous. Confirm the bucket for `master_artworks.storage_path` (expected `print-masters`) and whether `uploaded_by` is `NOT NULL` (if so, use an admin `profiles.id`).
4. Print a short discovery summary + the field decision before mutating.

## Phase 1 — Validate the scan ↔ product map (auto-match; log exceptions, don't halt)

A **confirmed file-level mapping is embedded in Appendix A** (built from the actual scan files on 2026-06-14). Use it as the source of truth; re-verify each path still exists and fill any gaps.

1. List `public/Margaret-Scans/**` with dimensions/MP/format/DPI via `sharp().metadata()`.
2. Pull products + `product_images` from the DB (folder for each product comes from its existing primary `url`, since **category ≠ folder**).
3. For each product in Appendix A's **matched** list, confirm `master_path` and `web_source_path` exist. For anything not in Appendix A, attempt a normalized title match (lowercase; strip size tokens like `18x22`, `_01`, `_COW`, `8x8`; drop punctuation) and mark confidence.
4. Write `audit/scan-product-map.tsv` (tab-separated — titles contain commas) with columns:
   `slug<TAB>title<TAB>fulfillment_type<TAB>primary_object_key<TAB>web_source_path<TAB>master_path<TAB>print_size<TAB>status<TAB>confidence<TAB>notes`
   and a human-readable `audit/scan-product-map.csv` mirror.
5. **Don't hard-stop.** Process confident rows through Phases 2–3. Skip + log: the **14 "Needs a scan"** products (Appendix A), any low-confidence match, and the **extra scans** (artwork not in the store) for Margaret to review. Never apply a guessed match to production.

## Phase 2 — Regenerate web images from scans (applies by default)

For each matched product:
1. From the **master/clean source**, produce the web WebP: fit within **2400 px long edge** (no upscaling), `webp` quality **82** (step down to ~72 if over target), sRGB, strip metadata, target **≤ ~450 KB**.
2. Back up the existing primary object → `product-images/_retired/<key>`, then **upsert the new bytes at the same object key** (URL unchanged).
3. Update the primary `product_images` row: new `width`/`height`; set `alt_text` to the title if empty; keep `is_primary=true`.
4. Don't auto-touch non-primary images; log any full-art candids to `audit/secondary-review.csv`.
5. Record in `audit/pipeline-manifest.json`.

## Phase 3 — Upload full scans as LumaPrints masters (applies by default)

For each matched **`lumaprints`** product:
1. Read master metadata (`width`, `height`, `density`/DPI, bytes).
2. **Resolution adequacy** vs the product's largest variant (`max(width_in,height_in)`; catalog max 30×40 in): `effective_dpi = min(long_px/long_in, short_px/short_in)`. **Warn** < 150 DPI; **hard-flag** (still upload) < 100. (30×40 in needs ~4500×6000 px for 150 DPI.) The *Three Horses* / *Drayton Hall* JPG-only masters are the likely warnings.
3. Upload the **original master file as-is** (preserve format/bytes; never recompress a master) to `print-masters` at `masters/<folder>/<slug>.<ext>`.
4. Insert `master_artworks` (`title, storage_path, file_name, file_size_bytes, mime_type, width_px, height_px, dpi`).
5. Set `products.master_artwork_id`; **also** set the primary `product_images.print_master_path` if Phase 0 found the code uses it.
6. Confirm the object is private; record in the manifest.

## Phase 4 — Verification & report

1. For every active `lumaprints` product with a scan, assert: primary `url` is a reachable `image/webp` ≤ ~450 KB with matching dims; `master_artwork_id` set → row exists → object exists in `print-masters`; the master is **not** publicly fetchable.
2. Assert no `print-masters` object is referenced by any `product_images.url`, and `print-masters.public=false` (see Appendix C).
3. Write `audit/image-master-verification.md`: per-product before/after table (old primary dims/KB → new; master dims/MP/DPI/effective print-DPI; fields populated; status) **plus** sections: **Needs a scan** (after checking `ARTWORK/`), **Orientation fixes applied** (e.g. Unseen Purpose), **Low-res master warnings**, **Extra scans / possible new products**, **Secondary candids to review**.
4. Print a final summary: web regenerated, masters uploaded, products fully done, and what still needs a human (scanning).

---

## Appendix A — Confirmed scan ↔ product mapping (verified 2026-06-14)

Paths are relative to `public/Margaret-Scans/`. **Master** = upload to `print-masters` (private). **Web source** = downscale to the in-place `product-images` WebP.

### Matched — regenerate web + upload master (22)

| Product | slug | web object (in place) | master file | web source | size | flag |
|---|---|---|---|---|---|---|
| Flower Power | flower-power | web/texas-themed/flower-power_1.webp | 05_08_26/WORKING/Flower Power 24X24_COW.tif | …/Flower Power 24X24_COW.jpg | 24×24 | |
| Think Again | think-again | web/texas-themed/paintin-the-ass.webp | 05_08_26/WORKING/Think Again 36X48_Donkey.tif | …/Think Again 36X48_Donkey.jpg | 36×48 | 1 GB master; web key keeps working title |
| Graze Daze | graze-daze | web/texas-themed/graze-daze_1.webp | Feb 2026 copy/36x24_01.tif | Feb 2026 copy/Graze Daze, 36x24_01.jpg | 36×24 | |
| Keepsake | keepsake | web/texas-themed/keepsake_1.webp | Feb 2026 copy/18x22.tif | Feb 2026 copy/Keepsake, 18x22.jpg | 18×22 | |
| Mad Cow | mad-cow | web/texas-themed/mad-cow.webp | Feb 2026 copy/04_8x8.tif | Feb 2026 copy/Mad Cow, watercolor 04_8x8.jpg | 8×8 | draft |
| Three Horses | three-horses | web/texas-themed/three-horses.webp | Feb 2026 copy/Three Horses, watercolor.jpg | (same JPG) | — | **JPG only — lower-res master** |
| Aikens-Rhett House, SC | aikens-rhett-house-sc | web/beach-and-sc/aikens-rhett-house-sc.webp | Feb 2026 copy/03_8x8.tif | Feb 2026 copy/Aiken-Rhett House, SC,  03_8x8.jpg | 8×8 | "Aiken" vs "Aikens" |
| Drayton Hall, Charleston, SC | drayton-hall-charleston-sc | web/beach-and-sc/drayton-hall-charleston-sc.webp | Feb 2026 copy/Drayton Hall, SC.jpg | (same JPG) | — | **JPG only — lower-res master** |
| Fun at the Beach | fun-at-the-beach | web/beach-and-sc/fun-at-the-beach_1.webp | Feb 2026 copy/11x 14 Children on Beach.tif | Feb 2026 copy/Fun at the Beach, 11x 14 Children on Beach.jpg | 11×14 | |
| Magnolia Plantation and Gardens, SC | magnolia-plantation-and-gardens-sc | web/beach-and-sc/magnolia-plantation-and-gardens-sc.webp | Feb 2026 copy/05_8x8.tif | Feb 2026 copy/Swamp Life, Magnolia Plantation and Gardens, SC 05_8x8.jpg | 8×8 | titled "Swamp Life" |
| Poolside | poolside | web/beach-and-sc/poolside_1.webp | Feb 2026 copy/4 x 12 Red Chairs.tif | Feb 2026 copy/Poolside, 4 x 12 Red Chairs.jpg | 4×12 | |
| Seaside with Seagull | seaside-with-seagull | web/beach-and-sc/seaside-with-seagull_1.webp | Feb 2026 copy/12 x 12 Seaside with Gull.tif | Feb 2026 copy/12 x 12 Seaside with Gull.jpg | 12×12 | |
| Sweet Home Alabama | sweet-home-alabama | web/beach-and-sc/sweet-home-alabama.webp | Feb 2026 copy/7 x 10 Beach in Pastels.tif | Feb 2026 copy/Sweet Home AL, 7 x 10 Beach in Pastels.jpg | 7×10 | |
| Deep in the Heart of Texas | deep-in-the-heart-of-texas | web/texas-themed/deep-in-the-heart-of-texas_1.webp | Feb 2026 copy/12 x 16 Indian Paintbrushes.tif | Feb 2026 copy/Deep in the Heart of Texas, 12 x 16 Indian Paintbrushes.jpg | 12×16 | |
| Hot Air | hot-air | web/cactuses/hot-air_1-v2.webp | Feb 2026 copy/20x10_02.tif | Feb 2026 copy/Hot Air, 20x10_02.jpg | 20×10 | |
| Hot Air II | hot-air-ii | web/cactuses/hot-air-ii.webp | Feb 2026 copy/18x8.5.tif | Feb 2026 copy/Hot Air II, 18x8.5.jpg | 18×8.5 | |
| Pins and Needles | pins-and-needles | web/cactuses/pins-and-needles.webp | Feb 2026 copy/7x11_01.tif | Feb 2026 copy/Pins and Needles, 7x11_01.jpg | 7×11 | |
| Sometime | sometime | web/cactuses/sometime.webp | Feb 2026 copy/18x6.5.tif | Feb 2026 copy/Royal (formerly Sometime) 18x6.5.jpg | 18×6.5 | renamed "Royal" — confirm title |
| Spring Break / Mountain Boat Dock | spring-break-mountain-boat-dock | web/texas-themed/spring-break-mountain-boat-dock.webp | Feb 2026 copy/22x28 Mountain Boat Dock.tif | Feb 2026 copy/Spring Break-Mountain Boat Dock 22x28 Mountain Boat Dock.jpg | 22×28 | |
| The Dual | the-dual | web/cactuses/the-dual_1.webp | Feb 2026 copy/20x10_01.tif | Feb 2026 copy/The Dual, 20x10_01.jpg | 20×10 | |
| Unexpected | unexpected | web/encouragement-series/unexpected.webp | Nov 2025 copy/18X24_600DPI.tif | Nov 2025 copy/Unexpected, 18X24_600DPI.jpg | 18×24 | avoid WHITE BORDER / SINATURE variants |
| Unseen Purpose | unseen-purpose | web/encouragement-series/unseen-purpose.webp | `public/Margaret Edmondson/ARTWORK/Encouragement Series/Unseen Purpose.png` (2594×1832) | (same) | — | **ROTATE 90° CW** (clefs left→top). Pre-rotated files ready in `audit/image-fixes/unseen-purpose/` (master PNG + web WebP) — use them directly. ~4.8 MP: flag master DPI at large sizes. |

> **Additional source folder (important):** the Encouragement/Mixed-Media pieces are **not** in `Margaret-Scans/` but **do** have source images under **`public/Margaret Edmondson/ARTWORK/`** (`Official/` and `Encouragement Series/`) — e.g. `Unseen Purpose.png`, `Due Date.png`, `Arrival_1.png`, `Grow.png`, `Potential.jpg`, `Seeds.jpg`, `Perspective.jpg`, `Let'sGo.jpg`. These are moderate-res (~5 MP), fine for web and usable as masters with a DPI warning at large sizes. **In Phase 1, also match the "Needs a scan" products against this folder** before declaring them unscanned.

### Needs a scan — only after also checking `ARTWORK/` above (≈13, likely fewer)

`lumaprints`, no scan in `Margaret-Scans/` **and** no usable `ARTWORK/` source: **Dig**, **Dolphin Watch**, **Road Trip**, **Solo** (sold). The Encouragement/Mixed-Media pieces (**Arrival**, **Curious Mind**, **Due Date**, **Grow**, **Let's Go**, **Perspective Play**, **Potential**, **Seasonal Inspiration**, **Seeds**) most likely resolve from `ARTWORK/` — confirm each in Phase 1. *Arrival* (173×510) and *Curious Mind* (254×405) have the worst current primaries; prioritize confirming their `ARTWORK/` source or scanning them.

### Extra scans — artwork not currently in the store (review; possible new products)

In `05_08_26/WORKING/`: **Saguaro** (`18X24_CACTUS.*`), **Love Birds** (`LOVE BIRDS_18 x 24_*`), **Don't Mind Me / Gila** (`Don't Mind Me 18X24_Gila.*`), **Medical Plaza (I & II)** (`12X8.5_MED PLAZA*`), **Girls Trip / Market Watercolor** (`8X8_MARKET WATERCOLOR.*`). Plus unlabeled `Feb 2026 copy/01_8x8.*` and `02_8x8.*`, and raw scanner PDFs in `SCANS copy/` etc. Don't act on these — list them so Margaret can add products or rename.

### `self_ship` — web regen optional, no master (2)

Custom House Portrait Example (`web/custom-portrait-options/custom-house-portrait-example_1.webp`) and Custom Pet Portrait Example (`…/custom-pet-portrait-example_1.webp`) — demo products, not LumaPrints-fulfilled.

## Appendix B — Reference helper script

Adapt to the Phase 0 field decision. Reads the map TSV; applies by default, `--dry-run` previews.

```js
// scripts/scan-pipeline.mjs — node --max-old-space-size=8192 scripts/scan-pipeline.mjs [--dry-run]
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
sharp.cache(false);

const DRY = process.argv.includes('--dry-run');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not exported — it is NOT in .env.local. Export it first.');
if (!/klwkajukicsoiwpsgftt/.test(url || '')) throw new Error('Wrong/blank Supabase project — abort.');
const sb = createClient(url, key, { auth: { persistSession: false } });

const SCAN_ROOT = 'public/Margaret-Scans';
const WEB_BUCKET = 'product-images', MASTER_BUCKET = 'print-masters';
const LONG_EDGE = 2400, TARGET_KB = 450;

const rows = parseTsv(fs.readFileSync('audit/scan-product-map.tsv', 'utf8'))
  .filter(r => r.master_path && r.confidence !== 'low'); // confident, has a scan

async function webWebp(src) {
  let q = 82, buf;
  do {
    buf = await sharp(path.join(SCAN_ROOT, src), { limitInputPixels: false })
      .rotate().resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb').webp({ quality: q, effort: 5 }).toBuffer();
    q -= 4;
  } while (buf.length / 1024 > TARGET_KB && q >= 72);
  const m = await sharp(buf).metadata();
  return { buf, w: m.width, h: m.height, kb: Math.round(buf.length / 1024) };
}

for (const r of rows) {
  // ---- Phase 2: web image in place ----
  const web = await webWebp(r.web_source_path || r.master_path);
  console.log(`${r.slug}: web ${web.w}x${web.h} ${web.kb}KB -> ${r.primary_object_key}`);
  if (!DRY) {
    const { data: old } = await sb.storage.from(WEB_BUCKET).download(r.primary_object_key);
    if (old) await sb.storage.from(WEB_BUCKET).upload(`_retired/${r.primary_object_key}`,
      Buffer.from(await old.arrayBuffer()), { upsert: true });
    await sb.storage.from(WEB_BUCKET).upload(r.primary_object_key, web.buf, { contentType: 'image/webp', upsert: true });
    await sb.from('product_images').update({ width: web.w, height: web.h }).eq('product_id', r.slug_id).eq('is_primary', true);
  }
  // ---- Phase 3: master (lumaprints only) ----
  if (r.fulfillment_type === 'lumaprints') {
    const folder = r.primary_object_key.split('/')[1];          // web/<folder>/...
    const ext = path.extname(r.master_path) || '.tif';
    const masterPath = `masters/${folder}/${r.slug}${ext}`;
    const abs = path.join(SCAN_ROOT, r.master_path);
    const meta = await sharp(abs, { limitInputPixels: false }).metadata();
    const bytes = fs.readFileSync(abs);
    console.log(`  master ${meta.width}x${meta.height} ${(bytes.length/1e6).toFixed(0)}MB -> ${MASTER_BUCKET}/${masterPath}`);
    if (!DRY) {
      await sb.storage.from(MASTER_BUCKET).upload(masterPath, bytes, { contentType: mime(ext), upsert: true });
      const { data: ma } = await sb.from('master_artworks').insert({
        title: r.title, storage_path: masterPath, file_name: `${r.slug}${ext}`,
        file_size_bytes: bytes.length, mime_type: mime(ext),
        width_px: meta.width, height_px: meta.height, dpi: meta.density ?? null,
      }).select('id').single();
      await sb.from('products').update({ master_artwork_id: ma.id }).eq('slug', r.slug);
      // If Phase 0 found the order flow reads print_master_path, also set it on the primary image.
    }
  }
}
function mime(e){return {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.tif':'image/tiff','.tiff':'image/tiff'}[e.toLowerCase()]||'application/octet-stream';}
function parseTsv(t){const[h,...ls]=t.trim().split('\n');const k=h.split('\t');return ls.map(l=>{const c=l.split('\t');return Object.fromEntries(k.map((x,i)=>[x.trim(),(c[i]||'').trim()]));});}
```
> Note: resolve `slug_id`/`product_id` from the DB in Phase 1 (the script keys updates by `slug`; adjust to your column). TIFs are huge — run with `--max-old-space-size` and process serially as above.

## Appendix C — Verification SQL

```sql
-- Every active lumaprints product: master + webp primary
select p.slug, p.status, p.master_artwork_id is not null as has_master,
       ma.storage_path, ma.width_px, ma.height_px, pi.url, pi.width, pi.height
from products p
left join master_artworks ma on ma.id = p.master_artwork_id
left join product_images pi on pi.product_id = p.id and pi.is_primary
where p.fulfillment_type='lumaprints' order by has_master, p.status, p.slug;

-- No master may ever appear as a public product image  (must be 0)
select count(*) from product_images where url ilike '%/print-masters/%';

-- Master bucket must stay private  (public=false)
select id, public from storage.buckets where id='print-masters';
```

## Appendix D — Matching rules & edge cases

- **Match on the descriptive JPG name**, which carries the product title; its size-token sibling (`18x22.tif`, `36x24_01.tif`, `05_8x8.tif`) is the master. Treat size-token-only files with no descriptive JPG (`01_8x8`, `02_8x8`) as **unidentified — flag**.
- **Category ≠ folder.** Take the output web folder from the product's existing primary `url`, never the category (e.g. *Flower Power* is *Animals* but folder `texas-themed`).
- **Title drift to confirm with Margaret:** *Sometime* → scan labeled *"Royal (formerly Sometime)"*; *Magnolia Plantation…* → scan labeled *"Swamp Life"*; *Think Again* web object is `paintin-the-ass.webp` (working title — keep the object key, just swap bytes).
- **Avoid variants:** never use `*WHITE BORDER*` or `*SINATURE*` files (bordered/signed) for web or master.
- **JPG-only masters** (*Three Horses*, *Drayton Hall*) are lower resolution — upload them but surface a warning.
- **Orientation fixes:** apply the same rotation to BOTH the web image and the master. **Unseen Purpose → rotate 90° CW** so the treble/bass clefs sit at the top (pre-rotated files are in `audit/image-fixes/unseen-purpose/`). Sanity check after rotating: collage text should read left-to-right. Watch for other pieces that may be sideways.
- **No-scan products** (Appendix A): never fabricate a scan; leave their web image and `master_artwork_id` untouched and list them so Margaret can scan them.
