# Artwork Inventory Gap Report

Date: 2026-05-19
Inventory source: `docs/artwork-inventory.md` (32 originals + 1 sold, plus class-sample folder)
Catalog source: `products` table on Supabase project `klwkajukicsoiwpsgftt`
Matching: case-insensitive on trimmed `title`; near-match by manual review for slugs that differ stylistically (e.g. "Spring Break (alt: Mountain Boat Dock)" → `spring-break-mountain-boat-dock`).

---

## A. Products in catalog, not in inventory

| Title | Slug | Status | Recommended action | Why |
|---|---|---|---|---|
| Custom House Portrait Example | `custom-house-portrait-example` | draft | **Leave as catalog-omit.** | Commission landing-page placeholder. Inventory explicitly excludes the "Custom Portrait Options" folder ("not original artworks for sale"). |
| Custom Pet Portrait Example | `custom-pet-portrait-example` | draft | **Leave as catalog-omit.** | Same as above. |
| Paintin' the Ass | `paintin-the-ass` | active | **Add to inventory** — flag to Margaret for confirmation. | Donkey painting that exists as a product (created during the home-restructure earlier this session) but has no inventory row. Suggested entry: Series 4 — Texas Themed; medium=Acrylic on canvas; size 36×48 in (catalog) — **mismatch with Margaret's note ("Acrylic on canvas board" 12×16 in)**; status `for_sale`; price $150 (per the recent reconciliation). Owner confirmation needed. |

No other catalog products are unmatched.

## B. Inventory items not in catalog

All 32 listable inventory titles are represented in the catalog. One inventory row that intentionally has no catalog match:

| Inventory entry | Why no catalog row |
|---|---|
| Encouragement Series #2 (untitled) | Inventory marks it "**Omitted from launch.** Scan quality poor; Margaret may add later." Correctly absent from catalog. |

Inventory rows that exist in catalog but flagged in inventory as `pending_show` or `not_for_sale`:

| Title | Inventory status | Catalog status | Note |
|---|---|---|---|
| Mad Cow | `pending_show` | `draft` | Catalog draft is consistent with hold-from-sale. |
| Unexpected | `pending_show` | `active` | **Discrepancy** — catalog has it active. Recommend setting to `draft` or pulling from public until show concludes. |
| Solo | `sold` | `sold` | Aligned. |
| Fun at the Beach | `not_for_sale` (prints only) | `active` (variants: original=$35) | **Discrepancy** — original variant exists with non-zero price. Recommend removing the original variant or setting it inactive; keep print variants. |

Multiple Encouragement Series titles (`not_for_sale` per inventory) are `active` in catalog with original=$35. Same recommendation applies — keep prints, remove originals or set to NFS:

- Curious Mind, Let's Go, Due Date, Unseen Purpose, Arrival, Perspective Play, Potential, Seeds, Grow, Seasonal Inspiration (all NFS in inventory, all active in catalog)

## C. Mismatched fields

Comparing inventory ↔ catalog, by inventory's reconciliation policy ("inventory wins for medium/size/description; catalog wins for slug and image refs"):

| Title | Field | Inventory | Catalog | Recommended |
|---|---|---|---|---|
| Paintin' the Ass | Medium | (no entry yet) | Acrylic on canvas | Add inventory row; confirm. |
| Paintin' the Ass | Size | (no entry yet) | 36 × 48 in | Confirm with Margaret. Catalog says 36×48, but the image looks closer to a 12×16 study. |
| Hot Air II | Suggested price | ~$395 | base_price $395 | ✓ matches |
| Hot Air | Suggested price | $450 | base_price $450 | ✓ matches |
| Solo | Catalog | base_price $0 | Sold, gallery took 30% + entry fee | Recommend leaving base_price=0 since sold; ensure CV award link wires when Phase 4 ships. |
| Graze Daze | Catalog | base_price $0 | Inventory says TBD | Set placeholder price (e.g., $1,800 for 24×36×1.5) and flag for Margaret to confirm. |
| Encouragement Series originals | Catalog | $35 originals | Inventory marks all as `not_for_sale` | Remove the original variants (keep prints), per Section B. |
| All print-enabled rows | Print categories | Inventory enumerates per piece ("paper, poster, canvas") | Catalog has implicit `prints_enabled` boolean | Out of scope until Phase 5 variant builder ships full medium taxonomy. |

## D. Images

| Folder | Files on disk | Inventory rows referencing this folder |
|---|---|---|
| `Beach and SC/` | 13 files | 10 inventory rows |
| `Cactuses/` | 10 files | 6 inventory rows |
| `Encouragement Series/` | 19 files | 11 inventory rows (10 listable + 1 explicitly omitted) |
| `Texas Themed/` | 15 files | 7 inventory rows |
| `Custom Portrait Options/` | 9 files | 0 (excluded from inventory by design) |
| `Margaret Edmondson/ARTWORK/Official/` | 33 files | 0 — master-resolution scans, intentionally git-ignored |

**Surplus images per folder:**

- Beach and SC: 3 surplus files (`_2`/`_3` framed-context shots for some pieces — not separate artworks)
- Cactuses: 4 surplus files (alternate angles)
- Encouragement Series: 8 surplus files (overview shots, alternates, "Encouragement Series Number 2" overview image)
- Texas Themed: 8 surplus files (`Paintin' the Ass.JPG`, `me-hero-1.jpg`, alternate angles)

No images are missing for the 32 listable inventory rows. The surplus files are framed-on-wall context shots, overview compositions, or assets used elsewhere (hero, share image). No action needed.

## E. Recommended next actions

Prioritized human decisions Margaret needs to make before Phase 5 (variant builder) is built on top of this catalog:

1. **Confirm `Paintin' the Ass` is the donkey piece referenced by the *Paintin' the Ass.JPG* file in `Texas Themed/`.** Add an inventory row with the right medium/size or correct the catalog to match. If the catalog's "Acrylic on canvas, 36×48 in" is wrong, fix it.
2. **Decide what to do with the Encouragement Series originals that are `not_for_sale` in inventory but `active` in catalog with $35 originals.** Either pull the original variant or change inventory.
3. **Flip `Unexpected` to `draft`** until the show concludes (it's `pending_show`).
4. **Set price for Graze Daze** (currently $0).
5. **Decide on the Spring Break / Mountain Boat Dock pricing range** ($1,500–$2,000 per inventory; catalog has $1,500). Confirm or pick.
6. **Decide whether to title the "Three Horses at Local Ranch" piece** before relaunch.
7. **Confirm Flower Power is scanned** — inventory says "Not yet scanned — needs scan before listing." Catalog has it listed; verify image quality.

Finding nothing missing **is** a valid outcome here — the catalog is already largely aligned to inventory. The discrepancies above are tractable from the admin in minutes once decisions are made.
