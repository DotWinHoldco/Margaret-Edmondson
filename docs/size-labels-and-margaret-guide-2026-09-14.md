# Familiar print sizes and Margaret's guide

Near-standard print dimensions now show the familiar size first and a separate 9px line such as `(actual cropped size: 15.6 × 20 in)`. This is presentation only: saved dimensions, variant IDs, prices, artwork pixels, and Lumaprints production dimensions remain unchanged. Exact standard sizes omit the redundant note; distant custom sizes remain exact. Each edge must be within the greater of half an inch or 2.5% of the candidate standard dimension. Orientation is preserved.

The shared presentation covers the Lumaprints size column, studio variant headings, storefront chooser, all three funnel templates, and newly added cart/checkout titles. Editable saved names remain intact. Existing cart titles retain their original wording.

The product markup preview now preserves an inherited 0% shop markup. An empty value still inherits; an invalid value falls back through the existing resolver. Intimate Journal also handles a product without images without its scroll animation throwing.

Verification includes size thresholds and orientation, untouched input dimensions, keyboard and click selection, original-artwork labels, cart title formatting, all three funnel selection-to-cart flows, studio headings, missing-image rendering, and zero-markup pricing. A browser check of the actual shared picker confirmed a block-level 9px note and correct selection at a 350px width.

The editable document is `deliverables/Margaret ArtByMe Product Pricing and Sales Tax Guide.docx`. Its ten rendered pages were visually checked. It explains pixel proportions versus DPI, approximate display versus exact crop preparation, product creation, per-material variants, S/M/L and additional sizes, markup versus gross margin, inheritance and overrides, tax setup and registrations, included versus added tax, and the reporting limits of the sales tax tracker. Examples include 100% and 200% markup and a fully explained `1 + markup / 100` multiplier.

## Release verification

`npm run build-check` printed **GREEN** on 2026-09-14 at 21:57 UTC, with typecheck, lint, tests, and production build passing. Source commit `9d5731d` was deployed to `https://www.artbyme.studio` through Vercel deployment `margaret-edmondson-7erjbtqkp-dotwinholdcos-projects.vercel.app`.

Live browser checks confirmed Grow's medium print shows 16 × 20 with actual 15.6 × 20, at the unchanged $90.62 canvas price. The Lumaprints size cells, studio headings, and storefront notes render as separate 9px lines. Selecting that print and adding it to an empty cart preserved both labels and its price in the drawer and cart page; the temporary item was removed afterward. Seaside with Gull's Intimate Journal funnel showed 20 × 20 with actual 19.8 × 20 and enabled its purchase button after selection. No order or payment was submitted.

The live exact-size path was also checked: Add print size → 16 × 20 → Prepare crop for 16 × 20 opens the crop editor with 4:5 portrait selected. The preview was closed without saving or changing Margaret's artwork. Approximate labels do not themselves crop a print.

The guide was subsequently rewritten throughout as Skylar speaking directly to Margaret. Development history and audit details were removed from the client document. The practical steps and worked pricing/tax examples remain, including the distinction between a familiar display label and an exact-size crop.
