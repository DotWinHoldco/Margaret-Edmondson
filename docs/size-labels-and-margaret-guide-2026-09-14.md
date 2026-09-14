# Familiar print sizes and Margaret's guide

Near-standard print dimensions now show the familiar size first and a separate 9px line such as `(actual cropped size: 15.6 × 20 in)`. This is presentation only: saved dimensions, variant IDs, prices, artwork pixels, and Lumaprints production dimensions remain unchanged. Exact standard sizes omit the redundant note; distant custom sizes remain exact. Each edge must be within the greater of half an inch or 2.5% of the candidate standard dimension. Orientation is preserved.

The shared presentation covers the Lumaprints size column, studio variant headings, storefront chooser, all three funnel templates, and newly added cart/checkout titles. Editable saved names remain intact. Existing cart titles retain their original wording.

The product markup preview now preserves an inherited 0% shop markup. An empty value still inherits; an invalid value falls back through the existing resolver. Intimate Journal also handles a product without images without its scroll animation throwing.

Verification includes size thresholds and orientation, untouched input dimensions, keyboard and click selection, original-artwork labels, cart title formatting, all three funnel selection-to-cart flows, studio headings, missing-image rendering, and zero-markup pricing. A browser check of the actual shared picker confirmed a block-level 9px note and correct selection at a 350px width.

The editable document is `deliverables/Margaret ArtByMe Product Pricing and Sales Tax Guide.docx`. Its ten rendered pages were visually checked. It explains pixel proportions versus DPI, approximate display versus exact crop preparation, product creation, per-material variants, S/M/L and additional sizes, markup versus gross margin, inheritance and overrides, tax setup and registrations, included versus added tax, and the reporting limits of the sales tax tracker. Examples include 100% and 200% markup and a fully explained `1 + markup / 100` multiplier.
