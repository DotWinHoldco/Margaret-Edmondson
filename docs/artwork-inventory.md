# Margaret Edmondson — Artwork Inventory

> **Internal reference document.** Source of truth for every original artwork: title, year, medium, dimensions, original-for-sale status, suggested price, print availability, and description. Maintained by Margaret. Read by Claude Code when working on any product, variant, or catalog feature.
>
> **Update protocol:** When a new artwork is added or status changes (sold, framed, listed, withdrawn), update this file in the same PR. The site's product seed/admin should be derivable from this file.

## Legend

- **Original status:** `for_sale` · `not_for_sale` · `sold` · `pending_show` (entered in an upcoming show — hold)
- **Frame status:** `framed` · `matted_no_frame` · `unframed` · `needs_matte_and_frame`
- **Prints:** `paper` · `poster` · `canvas` · `card` — comma-separated list of allowed Lumaprints categories for this piece
- **Image folder:** path under `Extracted Art Images/` where reference images live
- **Notes column:** free-form context (gallery commission %, story behind a sale price, copyright concerns, etc.)

---

## Series 1 — Beach & Charleston, SC

Image folder: `Extracted Art Images/Beach and SC/`

| # | Title | Year | Medium | Size (in) | Frame | Original | Suggested Original Price | Prints | Notes |
|---|-------|------|--------|-----------|-------|----------|--------------------------|--------|-------|
| 1 | Drayton Hall, Charleston, SC | 2025 | Watercolor on paper | 8 × 8 | needs_matte_and_frame | for_sale | $95 unframed / $150 framed | paper, poster, canvas | Writing at bottom-left may be cropped or moved to matte. Plantation visit, summer 2025. |
| 2 | Aikens-Rhett House, SC | 2025 | Watercolor on paper | 8 × 8 | needs_matte_and_frame | for_sale | $95 unframed / $150 framed | paper, poster, canvas (optional) | Antebellum architecture, Charleston. |
| 3 | Magnolia Plantation and Gardens, SC | 2025 | Watercolor on paper | 8 × 8 | needs_matte_and_frame (12×12 frame works) | for_sale | $95 unframed / $150 framed | paper, poster, canvas | Egret, alligator swamp, spanish moss. |
| 4 | Seaside with Seagull (Gulf Shores Gull) | 2020 | Acrylic on canvas | 12 × 12 | unframed | for_sale | TBD | paper, poster, canvas | Fort Morgan, Alabama. Dusk light. |
| 5 | Fun at the Beach | 2022 | Acrylic on canvas | 11 × 14 | unframed | not_for_sale | — | paper, poster, canvas | Fort Morgan, Alabama. Prints only. |
| 6 | Poolside | 2023 | Acrylic on canvas | 4 × 12 | unframed | for_sale | $125 or less | paper, poster, canvas | Red adirondack chairs, Gulf Shores. |
| 7 | Sweet Home Alabama | 2023 | Pastel on paper | 5 × 8 | matted_no_frame (9×12 matte) | for_sale | $85 unframed / $120 framed | paper, poster, canvas | Plein-air, Alabama oil platforms. |
| 8 | Dig | 2025 | Acrylic on paper | 9.25 × 11 | matted_no_frame (white 11×14, needs 11×14 frame) | for_sale | $85 / $115 framed | paper, poster, canvas | Kids' sand castles, Mobile Bay oil rig. |
| 9 | Road Trip | 2026 | Watercolor + water gouache on paper | 6 × 12 | framed (final 11 × 16.5) | for_sale | $125–$150 | paper, poster, canvas | Coronado Beach, CA. VW van. |
| 10 | Dolphin Watch | 2023 | Watercolor on paper | 7.5 × 9.5 | matted_no_frame (double white matte, final 11×14) | for_sale | $85 | paper, poster, canvas | Dolphin pod + distant cargo ship. |

## Series 2 — Cactuses (Arizona)

Image folder: `Extracted Art Images/Cactuses/`

| # | Title | Year | Medium | Size (in) | Frame | Original | Suggested Original Price | Prints | Notes |
|---|-------|------|--------|-----------|-------|----------|--------------------------|--------|-------|
| 1 | Pins and Needles | 2025 | Mixed media — collage (painted papers + thread) | 6 × 10 | needs_matte_and_frame | for_sale | $95–$115 | paper, poster, canvas | Saguaro landscape. Needle/thread used for cactus needles. May need white border on custom-size prints. |
| 2 | Sometime | 2024 | Water gouache on paper | 6 × 16.75 | unframed | not_for_sale | — | paper, poster, canvas | Phoenix/Tucson trips. Prints only. |
| 3 | Hot Air II | 2025 | Water gouache on paper | 8 × 17 | needs_matte_and_frame | for_sale | ~$395 (smaller than companion piece) | paper, poster, canvas (optional) | Smaller variant of "Hot Air". Cactus + balloons. |
| 4 | Hot Air | 2025 | Water gouache on paper | 9 × 19 | framed (white matte + black frame, final 20×28) | for_sale | $450 | paper, poster, canvas | Cactus + hot air balloons. |
| 5 | The Dual | 2025 | Water gouache on paper | 9 × 19 | framed (white matte + black frame, final 20×28) | for_sale | $395 (weaker than "Hot Air"; same size sold $450) | paper, poster, canvas | Cactuses "duking it out" + ground squirrel. |
| 6 | Solo | 2025 | (Cactus painting — merchant award piece) | Same size as other cactus paintings (~9 × 19) | framed (custom matted + framed) | sold | Sold $450 (gallery took 30% + entry fee) | paper, poster, canvas, card | **Sold.** Merchant Award, Richardson Civic Art Society's 59th Annual Regional Art Show. Juror Keith Williams. No professional scan — consider boxed greeting card set as licensed product. Should appear on CV page as award piece. |

## Series 3 — Encouragement Series (Mixed Media Collaboration with Jenny Donaldson)

Image folder: `Extracted Art Images/Encouragement Series/`

Collaborative project using Rick Rubin's *The Creative Act: A Way of Being*. Pieces are encouragement-themed found poetry, mixed media collage, and drawing. **Copyright note for Claude Code:** Series #6 ("Arrival") contains a Rick Rubin quote — when displaying or listing this piece on the public site, credit must read: *"Quote by Rick Rubin from* The Creative Act: A Way of Being*."* Margaret expressed concern about copyright; flag in admin if displaying full piece publicly.

| # | Title | Year | Medium | Size (in) | Frame | Original | Suggested Original Price | Prints | Notes |
|---|-------|------|--------|-----------|-------|----------|--------------------------|--------|-------|
| #1 | Curious Mind (HumanMind) | 2025 | Mixed media — pen and ink, water gouache, book page | 5.25 × 8.5 | unframed | not_for_sale | — | paper, card (small only) | Saguaro, Phoenix Mountains, hot air balloons, love bird. |
| #2 | (untitled #2) | 2025 | Mixed media | — | — | — | — | — | **Omitted from launch.** Scan quality poor; Margaret may add later. |
| #3 | Let's Go | 2025 | Mixed media — cereal box, book + magazine pages, colored pencil, pen and ink | 7.75 × 12.25 | unframed | not_for_sale | — | paper, poster, card | Super Bowl LIX inspiration. Cheering-team rally cry. |
| #4 | Due Date | 2025 | Mixed media — pen and ink, water gouache, book pages | 5.5 × 7.5 (6.25 × 8.25 with black border) | unframed | not_for_sale | — | paper, card (actual-size or card only recommended) | Ecclesiastes 3:4 + finality-for-an-artist theme. |
| #5 | Unseen Purpose | 2025 | Mixed media — sheet music, water gouache, pen and ink, produce netting, paper cuttings | 6 × 8.5 | unframed | not_for_sale | — | paper, card | About the soul's drive to create. |
| #6 | Arrival (A Time for Certain Ideas) | 2025 | Pen and ink on book pages | 5.25 × 16 | recommended: black matte + frame | not_for_sale | — | paper, poster | **Rick Rubin quote — must credit on display.** Stork dropping inspiration. |
| #7 | Perspective Play | 2025 | Mixed media collage — acrylic, pen and ink, magazine cuttings | 5 × 5 (full: 9 × 9) | unframed | not_for_sale | — | paper, card (small) | Two crop variants — list both as alternates. |
| #8 | Potential | 2025 | Mixed media collage — ink, acrylic, watercolor, magazine clippings, book page, tape, thread | 9 × 9 | unframed | not_for_sale | — | paper, poster, canvas | First piece using sewing machine. |
| #9 | Seeds | 2025 | Mixed media collage — acrylic, book pages, tissue paper, magazine cuttings, chalk pastel | 11 × 14 (framed 16×20 with double matte) | framed (white + black inner matte, black frame) | not_for_sale (NFS for now) | — | paper, poster | Black-out poetry on "Seeds". |
| #10 | Grow (Let Your Imagination Grow) | 2025 | Mixed media — acrylic, magazine cuttings, book pages, colored pencils | 8.25 × 11.25 | unframed | not_for_sale | — | paper, poster | Pumpkin negative-space + paper weaving. |
| #11 | Unexpected | 2025 | Mixed media — pastel, paper, book pages, music, magazine cuttings, thread, tissue paper, watercolor | 18 × 24 (framed 24×30, double matte cream + charcoal grey, black frame) | framed | pending_show | (not for sale yet — entering in a show this year) | paper, poster (canvas uncertain) | Three squirrels with paint-brush sticks. Most narratively developed piece in the series. |
| — | Seasonal Inspiration | 2025 | Mixed media collage — pen and ink, watercolor, ink, acrylic, tissue paper, book pages | 10 × 10 | unframed | not_for_sale | — | paper, card (actual-size or card recommended); may need white border or matte option | Winter landscape with Rubin quote — same credit rule applies as #6. |

## Series 4 — Texas-Themed + Winter

Image folder: `Extracted Art Images/Texas Themed/`

| # | Title | Year | Medium | Size (in) | Frame | Original | Suggested Original Price | Prints | Notes |
|---|-------|------|--------|-----------|-------|----------|--------------------------|--------|-------|
| 1 | (Untitled — Three Horses at Local Ranch) | 2025 | Water gouache on paper | 8 × 8 | needs_matte_and_frame | for_sale | $95 / $150 framed | paper, poster, canvas | **Needs title from Margaret before listing.** |
| 2 | Mad Cow | 2025 | Watercolor + water gouache on paper | 8 × 8 | needs_matte_and_frame (12×12 frame) | pending_show | ~$150 (after framing) | paper, poster, canvas | Entering in a small works exhibit this fall. Hold from sale until after show. |
| 3 | Graze, Graze Daze (alt: Lazy Days?) | 2023 | Acrylic on canvas | 24 × 36 × 1.5 | unframed | for_sale | TBD | paper, poster, canvas | Black angus cattle + yellow wildflowers. |
| 4 | Flower Power | 2021 | Acrylic on canvas (palette knife) | 24 × 24 × 1.5 | unframed | for_sale | $450 | paper, poster, canvas | **Not yet scanned — needs scan before listing.** Cow with sunflower headdress. |
| 5 | Keepsake | 2024 | Watercolor + water gouache on paper | 16 × 21 (framed 22 × 28 with ~4" white matte + black frame) | framed | for_sale | $450 | paper, poster, canvas | Red tractor, gold-hour light. |
| 6 | Deep in the Heart of Texas | 2024 | Acrylic on canvas board | 12 × 16 × 0.75 | unframed | for_sale | $95–$125 | paper, poster, canvas | Plein-air at Connemara Meadow, Allen, TX. Indian Blanket Flower. |
| 7 | Spring Break (alt: Mountain Boat Dock) | 2023 | Acrylic on canvas | 22 × 28 × 1.5 | unframed (wired to hang) | for_sale | $1,500–$2,000 | paper, poster, canvas | Lake Tahoe, Sierra-Nevada. (Margaret's son prefers a high price — she's open to either.) |

---

## Custom Portrait Options

Image folder: `Extracted Art Images/Custom Portrait Options/`

This folder contains 10 reference images of past student paintings from kids/teens/adult Paint Your Pet classes — these are **not** original artworks for sale. They are sample images for the Classes page hero/gallery and class marketing. Do not list as products.

---

## Gap Analysis — Items in Folders Not Yet in Margaret's Docs

When the site product catalog is reviewed, Claude Code should:

1. Diff this inventory against `/products` table (or equivalent) in the database
2. List any products in the DB that don't appear here (likely older work or commissions)
3. List any folders in `Extracted Art Images/` with images not represented here
4. Report findings as a markdown checklist for Margaret to triage. Add new rows to this file as Margaret confirms title/year/dimensions/pricing.

Folders currently inventoried: Beach and SC ✓ · Cactuses ✓ · Encouragement Series ✓ · Texas Themed ✓ · Custom Portrait Options (excluded — class samples)

**Action for Phase 1:** After Claude Code clones this file into the repo, run the gap analysis above and append any missing artwork rows under a new section `## Series 5 — Unclassified / Pre-Series` with as much data as can be inferred. Flag rows with `(needs confirmation)` next to fields the user must supply.

---

## Field Definitions

- **Size:** Width × Height (× Depth where relevant). Inches.
- **Frame:**
  - `framed` — sale-ready, displays as-is
  - `matted_no_frame` — matte applied, awaiting frame
  - `unframed` — bare canvas/paper
  - `needs_matte_and_frame` — neither yet
- **Original:**
  - `for_sale` — listable now
  - `not_for_sale` — prints-only piece
  - `sold` — original gone; prints still allowed if rights held
  - `pending_show` — committed to an upcoming exhibition; hold from public sale
- **Suggested Original Price:** Margaret's working estimate. Final list price set in admin and may include framing/cost adjustments.
- **Prints:** Subset of Lumaprints categories Margaret has approved for this piece. Pieces with unusual dimensions may require a white-border or matte option to fit a standard Lumaprints size — note in `Notes`.

---

## Related Files

- Source docs: `uploads/Art Details_ Beach and SC.docx`, `uploads/Art Details_ Cactuses.docx`, `uploads/Art Details_ Encouragement Series 2.docx`, `uploads/Art Details_ Texas themed plus a winter one.docx`
- Bio source: `uploads/Margarets Bio 2026.pdf`
- CV source: `uploads/Margarets CV.pdf`
- Class flyer reference: flyer images in original conversation context (April 24/25 2026 dates — current versions can be downloaded from QR code link, scan results in `claude-code-build/content/classes-content.md`)
