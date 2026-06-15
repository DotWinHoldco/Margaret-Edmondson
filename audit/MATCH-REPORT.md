# Conclusive Scan → Product Master-Match Report
**ArtByME / Margaret Edmondson — verified 2026-06-14**

Scope: all 35 printable (`lumaprints`) products. Every scan folder was inventoried with real
image metadata (pixels, DPI, bytes) and every ambiguous file was opened and visually matched.
Folders examined: `public/Margaret-Scans/{Feb 2026 copy, Nov 2025 copy, 05_08_26/WORKING,
05_08_26/SCANS, SCANS copy}`, `public/SCANS`, **`public/Margaret Edmondson/ARTWORK`** (the
`Official/` + `Encouragement Series/` tree), the `~/Downloads` source copies, and the low-res
`Documents/.../Extracted Art Images` folder. Raw scanner PDFs were rasterized with poppler.

---

## HEADLINE

- **21 of 35 products have a genuine 600-DPI master** — confirmed. **Two of them are UPGRADES**:
  Drayton Hall and Three Horses were flagged "JPG-only / low-res" but actually have real
  600-DPI scans (`01_8x8` / `02_8x8`). So all 21 now have a true high-res master.
- **14 of 35 products still have NO genuine master scan.** This is the important finding, and it
  contradicts the assumption that "all 35 masters were provided." They were not. The only 600-DPI
  flatbed scans in `Official/` are for the 21 above. For the 14, what exists is moderate-resolution
  **photographs/exports** (the 17–19 MB PNGs in `Encouragement Series/` are big because they are
  *lossless PNG*, not because they are high-resolution — see §3).
- Net new from this deep search: **+2 master upgrades.** Zero of the 14 were rescued.

---

## 1. MATCHED — 21 products with a genuine 600-DPI master

All master files below exist on disk and are confirmed genuine high-DPI scans. "Official twin" =
the same scan as a 600-DPI JPEG in `public/Margaret Edmondson/ARTWORK/Official/` (lighter
alternative to the giant TIF; LumaPrints accepts JPEG).

| # | Product | slug | Master file (upload to print-masters) | px / MP / DPI |
|--|--|--|--|--|
| 1 | Flower Power | flower-power | `05_08_26/WORKING/Flower Power 24X24_COW.tif` (398 MB) | 600 DPI |
| 2 | Think Again | think-again | `05_08_26/WORKING/Think Again 36X48_Donkey.tif` (1.08 GB) | 600 DPI |
| 3 | Graze Daze | graze-daze | `Feb 2026 copy/36x24_01.tif` | 21740×14401 · 313 MP · 600 |
| 4 | Keepsake | keepsake | `Feb 2026 copy/18x22.tif` | 13690×10801 · 148 MP · 600 |
| 5 | Mad Cow *(draft)* | mad-cow | `Feb 2026 copy/04_8x8.tif` | 4818×4800 · 23 MP · 600 |
| 6 | **Three Horses** ★UPGRADE | three-horses | `Feb 2026 copy/02_8x8.tif` | 4800×4857 · 23 MP · 600 |
| 7 | Deep in the Heart of Texas | deep-in-the-heart-of-texas | `Feb 2026 copy/12 x 16 Indian Paintbrushes.tif` | 9602×7208 · 69 MP · 600 |
| 8 | Spring Break / Mtn Boat Dock | spring-break-mountain-boat-dock | `Feb 2026 copy/22x28 Mountain Boat Dock.tif` | 16804×13209 · 222 MP · 600 |
| 9 | Aikens-Rhett House, SC | aikens-rhett-house-sc | `Feb 2026 copy/03_8x8.tif` | 4840×4800 · 23 MP · 600 |
| 10 | **Drayton Hall, SC** ★UPGRADE | drayton-hall-charleston-sc | `Feb 2026 copy/01_8x8.tif` | 4869×4800 · 23 MP · 600 |
| 11 | Fun at the Beach | fun-at-the-beach | `Feb 2026 copy/11x 14 Children on Beach.tif` | 8402×6584 · 55 MP · 600 |
| 12 | Magnolia Plantation, SC | magnolia-plantation-and-gardens-sc | `Feb 2026 copy/05_8x8.tif` | 4814×4800 · 23 MP · 600 |
| 13 | Poolside | poolside | `Feb 2026 copy/4 x 12 Red Chairs.tif` | 7205×2332 · 17 MP · 600 |
| 14 | Seaside with Seagull | seaside-with-seagull | `Feb 2026 copy/12 x 12 Seaside with Gull.tif` | 7201×7269 · 52 MP · 600 |
| 15 | Sweet Home Alabama | sweet-home-alabama | `Feb 2026 copy/7 x 10 Beach in Pastels.tif` | 6007×4205 · 25 MP · 601 |
| 16 | Hot Air | hot-air | `Feb 2026 copy/20x10_02.tif` | 5945×12004 · 71 MP · 600 |
| 17 | Hot Air II | hot-air-ii | `Feb 2026 copy/18x8.5.tif` | 5099×10803 · 55 MP · 600 |
| 18 | Pins and Needles | pins-and-needles | `Feb 2026 copy/7x11_01.tif` | 4200×6799 · 29 MP · 600 |
| 19 | Sometime *(scan: "Royal")* | sometime | `Feb 2026 copy/18x6.5.tif` | 3905×10803 · 42 MP · 600 |
| 20 | The Dual | the-dual | `Feb 2026 copy/20x10_01.tif` | 5988×12004 · 72 MP · 600 |
| 21 | Unexpected | unexpected | `Nov 2025 copy/18X24_600DPI.tif` | 14204×10653 · 151 MP · 592 |

★ **The two upgrades** — these were the only wins from the deep search:
- **Drayton Hall** ← `Feb 2026 copy/01_8x8.tif` (verified vs the live web image — identical painting, signed "Drayton Hall, Charleston, SC"). Replaces the 11.9 MB JPG.
- **Three Horses** ← `Feb 2026 copy/02_8x8.tif` (verified vs the live web image — identical three-horses watercolor). Replaces the 11.9 MB JPG.
- `01_8x8` / `02_8x8` were unlabeled in `Feb 2026 copy` (size-token only), which is why the
  original pass listed them as "unidentified." They are these two paintings.

---

## 2. THE 14 STILL MISSING A GENUINE MASTER (file names + best-available)

No 600-DPI scan exists for any of these. "Best file found" is the highest-resolution image
located anywhere on the machine. **eff@30×40** = effective DPI if printed at the catalog max
(needs ≥150 ideal, ≥100 floor).

### 2a. Nothing usable — only tiny candids → MUST be re-scanned (5)
| Product | slug | Best file found | px / MP | eff@30×40 |
|--|--|--|--|--|
| Arrival | arrival | `ARTWORK/Encouragement Series/Arrival_2.jpg` | 819×2047 · 1.7 MP | 27 |
| Curious Mind | curious-mind | `ARTWORK/Encouragement Series/Curious Mind.png` | 254×405 · 0.1 MP | 8 |
| Dig | dig | `ARTWORK/Beach and SC/Dig.jpg` | 1536×2048 · 3.1 MP | 51 |
| Dolphin Watch | dolphin-watch | `ARTWORK/Beach and SC/Dolphin Watch.jpg` | 2048×1536 · 3.1 MP | 51 |
| Road Trip | road-trip | `ARTWORK/Beach and SC/Road Trip.jpg` | 2046×1010 · 2.1 MP | 34 |

*(Arrival 173×510 and Curious Mind 254×405 are the current live primaries — the most obviously
"candid phone snapshot" images on the whole site.)*

### 2b. Have a moderate-res interim image — usable for small/medium prints, NOT a true master (9)
These are 300-DPI-tagged exports (or their PNG twins). Good enough to **replace the candid web
photo** and to print up to roughly 16×20–24×30, but below spec for the 30×40 catalog max.
| Product | slug | Best file found | px / MP | eff@30×40 | quality |
|--|--|--|--|--|--|
| Seeds | seeds | `ARTWORK/Official/Seeds.jpg` | 4291×3387 · 14.5 MP | 107 | good |
| Grow | grow | `ARTWORK/Official/LetYourImaginationGrow.jpg` | 3262×4180 · 13.6 MP | 105 | good |
| Let's Go | lets-go | `ARTWORK/Official/Let'sGo.jpg` | 2300×3689 · 8.5 MP | 77 | decent |
| Solo *(sold)* | solo | `ARTWORK/Cactuses/Solo.jpg` | 1887×4000 · 7.5 MP | 63 | decent |
| Potential | potential | `ARTWORK/Official/Potential.jpg` | 2725×2708 · 7.4 MP | 68 | decent |
| Perspective Play | perspective-play | `ARTWORK/Official/Perspective.jpg` | 2612×2592 · 6.8 MP | 65 | decent |
| Unseen Purpose | unseen-purpose | `ARTWORK/Official/UnseenPurpose.jpg` | 2594×1832 · 4.8 MP | 61 | marginal |
| Due Date | due-date | `ARTWORK/Official/ADueDate.jpg` | 1894×2470 · 4.7 MP | 62 | marginal |
| Seasonal Inspiration | seasonal-inspiration | `ARTWORK/Encouragement Series/Seasonal Inspiration.jpg` | 2047×2047 · 4.2 MP | 51 | marginal |

> Recommendation: treat 2b as **interim** — upload as a provisional master so prints can ship at
> smaller sizes, but flag each "low-res master / re-scan for large format," and cap or warn on the
> 24×36 / 30×40 sizes until Margaret provides 600-DPI scans. 2a should be re-scanned before any
> print is offered.

---

## 3. Why `public/ARTWORK` is NOT the encouragement masters (the 19 MB question)

The big files in `ARTWORK/Encouragement Series/` (e.g. **Seeds.png 19.2 MB, Grow.png 17.6 MB,
Potential.png 10.5 MB, Lets Go.png 10.3 MB, Perspective Play_1.png 10.8 MB**) *look* like masters
because of the byte size, but:

- They are **lossless PNG**, which is 5–15× larger per pixel than JPEG. The bytes come from the
  format, not the resolution.
- Their actual pixel counts are modest — **Seeds 12.6 MP, Grow 12.5 MP, Potential 7.4 MP** — and
  the embedded DPI reads **72**, not 600. A genuine 600-DPI scan of an 18×24″ piece is
  **≈10800×14400 = 155 MP** (like the matched masters in §1, which are 23–313 MP). The
  encouragement files are **~12–25× short** on pixels.
- The `Official/*.jpg` twins (Seeds.jpg, Potential.jpg…) carry a **300-DPI tag but the same pixel
  counts** — i.e. they are processed exports, not raw flatbed scans.

The **only** genuine 600-DPI scans in `Official/` are the 21 matched products (01_8x8 … 36x24_01,
11×14, 12×16, 18×22, 18×24, 18×6.5, 18×8.5, 20×10_01/02, 22×28, 4×12, 7×10, 7×11) — all 23–313 MP.

---

## 4. Extras found (NOT in the store — possible new products / review)

Genuine high-res scans that don't map to any of the 35 products:
- `05_08_26/WORKING/` 600-DPI masters: **Saguaro** (`18X24_CACTUS.tif`), **Love Birds**
  (`LOVE BIRDS_18 x 24_1.tif`), **Don't Mind Me / Gila** (`Don't Mind Me 18X24_Gila.tif`),
  **Medical Plaza I & II** (`12X8.5_MED PLAZA1.tif`, `Medical Plaza II…tif`), **Girls Trip /
  Market** (`8X8_MARKET WATERCOLOR.tif`).
- Raw scanner PDFs (`05_08_26/SCANS/*.pdf`, triplicated in `SCANS copy/` & `public/SCANS/`): all 5
  identified — `pdf1`=Flower Power, `pdf2`=Think Again (duplicates of matched masters);
  `pdf3`=Medical Plaza + Market composite, `pdf4`=charcoal swamp/gators, `pdf5`=charcoal Saguaro
  (net-new monochrome studies).
- `Official/` extra encouragement-style pieces (300 DPI, moderate res): **HumanMind**, **RickRubin**,
  **ATimeForCertainIdeas** — additional Encouragement-series artworks not currently sold.

---

## 5. BOTTOM LINE

- **Matched & ready: 21/35** (incl. 2 upgrades). Masters exist, verified, genuine 600 DPI.
- **Missing a real master: 14/35.** 5 need a fresh scan with nothing usable; 9 have a moderate
  interim that can ship small/medium prints but should be re-scanned for large format.
- **Action only Margaret can take:** flatbed-scan the 14 at 600 DPI — priority order: the 5 in §2a
  first (esp. **Arrival** and **Curious Mind**, whose live photos are clearly candids), then the
  marginal three in §2b (Seasonal Inspiration, Due Date, Unseen Purpose).
- The web image and `master_artwork_id` for all 14 are being left untouched (no candid is replaced
  with another candid; no guessed master is written to production).

*Contact sheets: `audit/thumbs/SHEET-references.png` (the 14), `audit/thumbs/SHEET-candidates.png`
(13 scan candidates), `audit/thumbs/SHEET-verify.png` (upgrade confirmations),
`audit/thumbs/SHEET-best14.png` (best-available per missing product). Full data:
`audit/artwork-tree-inventory.json`, `audit/thumb-meta.json`.*
