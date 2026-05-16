# Artwork High-Res Swap — Report

**Date:** 2026-05-15
**Source:** `public/Margaret Edmondson/ARTWORK/Official/`
**Strategy:** Replace each existing image with its high-res counterpart at the exact same path and filename, so all existing code/database references continue to work. JPG→PNG counterparts had the new bytes re-encoded as PNG (not just renamed) so the file format on disk matches the extension.

---

## Replaced (21 files)

All file content was swapped while the path and filename stayed identical. No code or DB changes needed.

### Beach and SC

| Official source | Replaces | Old → New size |
| --- | --- | --- |
| `01_8x8.jpg` | `Drayton Hall Charleston SC.jpg` | 326 KB → 11.6 MB |
| `03_8x8.jpg` | `Aikens-Rhett House SC.jpg` | 327 KB → 11.0 MB |
| `05_8x8.jpg` | `Magnolia Plantation and Gardens SC.jpg` | 424 KB → 11.9 MB |
| `11x 14 Children on Beach.jpg` | `Fun at the Beach_1.jpg` | 521 KB → 29.3 MB |
| `12 x 12 Seaside with Bird.jpg` | `Seaside with Seagull_1.jpg` | 448 KB → 22.7 MB |
| `4 x 12 Red Chairs.jpg` | `Poolside_1.jpg` | 345 KB → 8.6 MB |

### Texas Themed

| Official source | Replaces | Old → New size |
| --- | --- | --- |
| `02_8x8.jpg` | `Three Horses.jpg` | 534 KB → 11.6 MB |
| `04_8x8.jpg` | `Mad Cow.jpg` | 334 KB → 12.0 MB |
| `18x22.jpg` | `Keepsake_2.jpg` | 298 KB → 82.3 MB |
| `22x28 Mountain Boat Dock.jpg` | `Spring Break Mountain Boat Dock.jpg` | 607 KB → 116.3 MB |
| `36x24_01.jpg` | `Graze Daze_1.jpg` | 804 KB → 182.0 MB |

### Cactuses

| Official source | Replaces | Old → New size |
| --- | --- | --- |
| `18x6.5.jpg` | `Sometime.jpg` | 189 KB → 20.3 MB |
| `18x8.5.jpg` | `Solo.jpg` | 331 KB → 25.8 MB |
| `20x10_01.jpg` | `Hot Air_1.jpg` | 499 KB → 33.8 MB |

### Encouragement Series (JPG converted to PNG to preserve original extension)

| Official source | Replaces | Old → New size |
| --- | --- | --- |
| `ADueDate.jpg` | `Due Date.png` | 369 KB → 5.5 MB |
| `Let'sGo.jpg` | `Lets Go.png` | 338 KB → 10.1 MB |
| `LetYourImaginationGrow.jpg` | `Grow.png` | 469 KB → 17.8 MB |
| `Perspective.jpg` | `Perspective Play_1.png` | 352 KB → 10.5 MB |
| `Potential.jpg` | `Potential.png` | 622 KB → 10.3 MB |
| `Seeds.jpg` | `Seeds.png` | 808 KB → 20.5 MB |
| `UnseenPurpose.jpg` | `Unseen Purpose.png` | 596 KB → 5.4 MB |

---

## Verification performed

- All 21 replaced files were re-opened with PIL and passed `verify()` — none corrupted.
- `file(1)` confirmed every PNG is real PNG-format bytes (not a JPG renamed) and every JPG is real JPEG with EXIF intact.
- Dimensions of each replaced file match the Official source dimensions (no resizing or quality loss).
- Grepped `src/` for the 21 filenames — all existing references (in `HeroBlock.tsx`, `FeaturedGridBlock.tsx`, `ClassPreviewBlock.tsx`, V2-V6 home clients, about page, ProjectHubClient) point at the exact same paths that were preserved.
- `git status` shows exactly 21 modified files in `public/Margaret Edmondson/ARTWORK/` — no other side effects.

---

## NOT replaced — flagged for your review

These files in `Official/` had no clear counterpart in the existing artwork tree. They look like new pieces, support assets, or pieces that need a deliberate placement decision from you.

### Likely new artwork (no existing counterpart)

| Official file | Best guess |
| --- | --- |
| `12 x 16 Indian Paintbrushes.jpg` (48 MB) | Texas wildflower painting — `Flower Power_1/_2` are actually a cow with sunflowers, NOT this. This is a different piece. |
| `18X24_600DPI (1).jpg` (37 MB) | Three cactuses with a metal pail — likely one of the three new 18x24 B&W mixed-media cactus drawings Margaret described. |
| `20x10_02.jpg` (31 MB) | Tall cactus with sky — could be a second Hot Air piece (Hot Air II?) but I wasn't confident enough to overwrite anything. |
| `7x11_01.jpg` (16 MB) | Tall narrow cactus with collage texture — looks like a new mixed-media cactus piece, doesn't match any existing one cleanly. |
| `7 x 10 Beach in Pastels.jpg` (13 MB) | Pastel beach scene — could replace either `Sweet Home Alabama.jpg` or `Dolphin Watch.jpg`; both are visually similar pastel beaches and I couldn't tell them apart with confidence. |
| `ATimeForCertainIdeas.jpg` (5.4 MB) | Tall narrow Encouragement-style piece — composition doesn't match any of the four `Arrival_*` files. Probably a new piece. |
| `HumanMind.jpg` (3.1 MB) | Mixed-media collage piece — name suggests it could be a renamed "Curious Mind," but the visual content doesn't match the existing `Curious Mind.png`. Could be a new piece. |
| `RickRubin.jpg` (5.8 MB) | Mountain scene with text overlay — likely a new Encouragement piece (possibly the one tied to Margaret's "Use your talents" motto). |

### Support assets (not paintings)

| Official file | Likely use |
| --- | --- |
| `20260220_141927.jpg` / `20260220_141934.jpg` | MLE signature / logo studies. These belong somewhere like `/public/Margaret Edmondson/Logo/` or `/branding/` rather than in `ARTWORK/`. |
| `28X22_WHITE BORDER.pdf` (248 MB) | Print-ready file — not for the web. Keep in `Official/` or move to a print archive. |
| `Margarets CV.pdf` (67 KB) | Margaret's CV. Needs a home for the CV page mentioned in `HOMEPAGE_V7_PROMPT.md` §6. Suggest moving to `/public/Margaret Edmondson/Artist and Artwork Details/Margaret L Edmondson CV.pdf` and linking from the footer + Meet the Artist page. |

### Photo variants left untouched

For pieces where the existing tree has multiple shots of the same painting (`_1` framed, `_2` angled, etc.), I only replaced the canonical `_1` version with the high-res. The angled-photo variants (`_2`, `_3`, `_4`) were left alone because they show the painting in context (on a wall, framed) which is a different kind of asset. If you'd rather have those replaced too, say the word and I can mirror the high-res into them.

Specifically untouched: `Fun at the Beach_2`, `Seaside with Seagull_2`, `Keepsake_1/_3/_4`, `Graze Daze_2/_3`, `Poolside_2`, `Hot Air_2/_3/_II`, `The Dual_1/_2`, `Perspective Play_2`.

---

## Suggested next steps

1. Spot-check the website locally (or on a Vercel preview) for the 21 swapped images — verify each renders correctly and there's no aspect-ratio shift in the gallery grid.
2. Decide where the eight "likely new" pieces in the Skip list above belong, and add them as new rows in the artworks table (this fits cleanly into the §3 facet model from the V7 prompt — each new piece gets multi-axis tags).
3. Move `Margarets CV.pdf` into the project and wire it up to a `/cv` route (or a footer download link).
4. Move the signature/logo JPGs (`20260220_*`) out of `ARTWORK/` into a branding folder — they're not gallery content.
5. Consider whether `ARTWORK/Official/` should be `.gitignore`'d going forward — it's a source archive, not deployment content. Cuts repo size dramatically (it currently holds ~1 GB of source files).
