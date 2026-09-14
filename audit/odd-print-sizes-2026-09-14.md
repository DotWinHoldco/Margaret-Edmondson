# Live print-size audit — September 14, 2026

Read-only production snapshot captured 2026-09-14T20:59:03.966Z. No products, variants, files, or settings were changed. CSV contains every one of the 193 saved variants; source JSON also contains products with no variants.

## Findings

- Reviewed **49 products and 193 variants**. **171** variants have numeric width and height; **22** do not.
- **74 near-standard odd-size options across 21 products** meet the rule below. These are saved physical dimensions, not merely display wording.
- **28** options exactly match a listed standard; **69** are other nonstandard sizes.
- **0** dimensioned options have parsed size labels/names/fulfillment labels that disagree with their stored numeric dimensions.
- **171 of 171** dimensioned options exactly match today’s S/M/L calculation using the current effective master dimensions.
- **74 of 74** near-standard odd options exactly match that calculation.
- **72** near-standard options are flagged active on active products for the provider view; **72** for the studio view. These flags alone do not prove storefront visibility under every policy.
- No actual **16 × 19.5** or **19.5 × 16** variant was found. No saved size label includes **19.5**.
- **11 products** have no variants. Missing numeric dimensions are an audit limitation, not evidence that those products have odd print sizes.

## Why these sizes exist

The code keeps the artwork’s shape. It sets the long side to 12, 20, or 30 inches for Small, Medium, or Large, then calculates the other side from the master image’s width-to-height ratio. It rounds that other side to the nearest **0.05 inch**. It does not automatically crop the picture to a common frame size. Some source comments mention quarter-inch rounding; the actual default constant is 0.05 inch.

For example, Aikens-Rhett House, SC has a ready print file of **4,840 × 4,800 pixels**. That image is slightly wider than a square. A 12-inch-wide print therefore has height 12 × 4,800 ÷ 4,840 = 11.9008 inches, which the code rounds to **11.9 inches**. Its 20-inch print becomes **20 × 19.85**. The labels agree with those stored sizes. Calling either print square would not change the physical print.

**Stored facts:** numeric dimensions, tier fields, labels, current master pixels, crop box, print status, and current activation flags are recorded in the attached CSV/JSON. All 171 dimensioned variants have S/M/L tier values and is_custom_size=false.

**Strong inference, not a creation log:** an exact match between a saved tier and today’s algorithm strongly supports aspect-ratio generation as the cause. The snapshot does not identify who clicked Generate, the source code version at that time, the then-current crop, or all prior edits. An updated_at value is not a creation timestamp. Noncustom=false alone cannot establish the route that originally inserted a row.

When a processed print is ready, generation uses print_width_px and print_height_px. Otherwise it uses the raw master dimensions. A later crop does not, by itself, prove existing variants were regenerated. Generate defaults skips an already-existing size label for the same product/medium. Existing sizes must be reviewed deliberately rather than silently renamed.

For a real standard frame size, choose a matching-ratio crop or an intentional border/padding workflow and verify the resulting print file and variant dimensions. Renaming 16 × 19.5 to 16 × 20 does not make the image or print 16 × 20.

## Source file versus saved crop

All 39 product-linked masters in this snapshot have a full-image crop (`x=0, y=0, w=1, h=1`), full-bleed mode, and processed dimensions equal to their raw dimensions. The current saved platform crops therefore do not explain the odd shapes: those proportions are already in the uploaded files. This does not establish how each file was photographed, scanned, trimmed, or edited before upload.

For example, Aikens-Rhett House is described as an 8 × 8-inch original, but its uploaded file is 4,840 × 4,800 pixels. At a 20-inch width, the proportional height is 20 × 4,800 ÷ 4,840 = 19.8347 inches, rounded to 19.85 by the generator. Fun at the Beach uses 8,402 × 6,584 pixels: 20 × 6,584 ÷ 8,402 = 15.6725 inches, rounded to 15.65. Product dimensions describe the original; they do not override the uploaded image proportions or set a print option.

## All near-standard odd options grouped by artwork and dimensions

Counts below combine separate saved media variants with identical dimensions. Orientation is preserved.

| Artwork | Actual inches | Nearby standard | Options | Current tier algorithm match |
|---|---:|---:|---:|---:|
| Aikens-Rhett House, SC | 12 × 11.9 | 12 × 12 | 2 | 2/2 |
| Aikens-Rhett House, SC | 20 × 19.85 | 20 × 20 | 2 | 2/2 |
| Audubon Swamp | 12 × 11.95 | 12 × 12 | 2 | 2/2 |
| Audubon Swamp | 20 × 19.95 | 20 × 20 | 2 | 2/2 |
| Dig | 10.35 × 12 | 10 × 12 | 2 | 2/2 |
| Dolphin Watch | 12 × 9.6 | 12 × 10 | 2 | 2/2 |
| Drayton Hall, Charleston, SC | 12 × 11.85 | 12 × 12 | 2 | 2/2 |
| Drayton Hall, Charleston, SC | 20 × 19.7 | 20 × 20 | 2 | 2/2 |
| Fun at the Beach | 12 × 9.4 | 12 × 9 | 2 | 2/2 |
| Fun at the Beach | 20 × 15.65 | 20 × 16 | 2 | 2/2 |
| Fun at the Beach | 30 × 23.5 | 30 × 24 | 2 | 2/2 |
| Graze Daze | 12 × 7.95 | 12 × 8 | 2 | 2/2 |
| Graze Daze | 30 × 19.85 | 30 × 20 | 2 | 2/2 |
| Grow | 15.6 × 20 | 16 × 20 | 2 | 2/2 |
| Grow | 9.35 × 12 | 9 × 12 | 2 | 2/2 |
| Hot Air | 9.9 × 20 | 10 × 20 | 2 | 2/2 |
| Keepsake | 12 × 9.45 | 12 × 9 | 2 | 2/2 |
| Keepsake | 20 × 15.8 | 20 × 16 | 2 | 2/2 |
| Keepsake | 30 × 23.65 | 30 × 24 | 2 | 2/2 |
| Let's Go | 7.5 × 12 | 8 × 12 | 2 | 2/2 |
| Mad Cow | 12 × 11.95 | 12 × 12 | 2 | 2/2 |
| Mad Cow | 20 × 19.95 | 20 × 20 | 2 | 2/2 |
| Mountain Boat Dock | 12 × 9.45 | 12 × 9 | 2 | 2/2 |
| Mountain Boat Dock | 20 × 15.7 | 20 × 16 | 2 | 2/2 |
| Mountain Boat Dock | 30 × 23.6 | 30 × 24 | 2 | 2/2 |
| Perspective Play | 12 × 11.9 | 12 × 12 | 2 | 2/2 |
| Potential | 12 × 11.95 | 12 × 12 | 2 | 2/2 |
| Seaside with Gull | 11.9 × 12 | 12 × 12 | 2 | 2/2 |
| Seaside with Gull | 19.8 × 20 | 20 × 20 | 2 | 2/2 |
| Seaside with Gull | 29.7 × 30 | 30 × 30 | 2 | 2/2 |
| Seasonal Inspiration | 11.95 × 12 | 12 × 12 | 2 | 2/2 |
| Seeds | 12 × 9.45 | 12 × 9 | 2 | 2/2 |
| Seeds | 20 × 15.8 | 20 × 16 | 2 | 2/2 |
| Sweet Home Alabama | 12 × 8.4 | 12 × 8 | 2 | 2/2 |
| Three Horses | 11.85 × 12 | 12 × 12 | 2 | 2/2 |
| Three Horses | 19.75 × 20 | 20 × 20 | 2 | 2/2 |
| Unseen Purpose | 8.45 × 12 | 8 × 12 | 2 | 2/2 |

## Classification method

A variant is near-standard odd when it is not an exact listed standard and each dimension is within the greater of **0.5 inch or 2.5% of that standard dimension**. Both portrait and landscape orientations are checked. The nearest candidate minimizes the largest normalized dimension difference, then the sum of absolute differences. Square standards are included because slightly nonsquare files also create hard-to-frame sizes. This is a screening rule, not a claim that a supplier or frame manufacturer offers every listed size.

Standards checked: 4 × 6, 5 × 7, 6 × 8, 8 × 10, 8 × 12, 9 × 12, 10 × 12, 10 × 15, 10 × 20, 11 × 14, 11 × 17, 12 × 16, 12 × 18, 12 × 24, 13 × 19, 14 × 18, 16 × 20, 16 × 24, 18 × 24, 20 × 24, 20 × 28, 20 × 30, 22 × 28, 24 × 30, 24 × 36, 30 × 40, 36 × 48, 6 × 6, 8 × 8, 10 × 10, 12 × 12, 16 × 16, 20 × 20, 24 × 24, 30 × 30, 36 × 36, 40 × 40.

Other nonstandard sizes remain in the CSV even when they fall outside this screening range. The original artwork’s product_dimensions field may describe the original art and need not equal a print option.

## Master-file processing capacity

A separate read-only aggregate of **all 39 master records**, completed in the same audit session, found a maximum file_size_bytes of **48,893,307 bytes** (48.89 decimal MB / 46.63 MiB), **0 files over 100,000,000 bytes**, and **0 files over 200,000,000 bytes**. The source JSON contains file sizes for masters linked to products; the all-master aggregate includes unlinked records.

The largest linked raw image has **169,000,000 pixels**. A four-channel decoded buffer alone can require about **676 MB**, before additional working/output buffers. Fitting a source-file byte cap does not establish memory or execution-time safety. The processing implementation must bound pixel count and handle unsupported/oversized input explicitly.

## Products without variants

- Custom House Portrait (active)
- Custom House Portrait Example (archived)
- Custom Pet Portrait (active)
- Custom Pet Portrait Example (archived)
- Dog and Daughter (archived)
- Due Date (active)
- Family Gift Painting (archived)
- Play Ball (draft)
- Solo (sold)
- Stylized Color Portrait (archived)
- Test Piece 9/14 (active)

## Code and source records

- `src/lib/pricing/size-tiers.ts:40` — 12/20/30-inch tier long sides; line 49 — actual 0.05-inch rounding step; line 104 — partner dimension; line 270 — tier derivation.
- `src/lib/pricing/builder-context.ts:60` — ready print dimensions versus raw fallback.
- `src/app/api/admin/products/[id]/variants/generate-defaults/route.ts:32` — calls the tier algorithm; lines 42–60 skip existing sizes; lines 75–77 store generated flags/tier/aspect.
- `src/lib/pricing/variant-insert.ts` — persists numeric dimensions and size labels.
- `odd-print-sizes-2026-09-14.csv` — all saved variants, classifications, differences, algorithm comparisons, activation flags, and master metadata.
- `odd-print-sizes-2026-09-14-source.json` — unmodified selected production facts and exact read-only SQL.
