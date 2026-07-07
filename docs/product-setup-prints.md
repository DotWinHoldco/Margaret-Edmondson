# Setting Up an Artwork for Prints (Any Shape)

Authored by DotWin · for Margaret · 2026-07-06

This is the complete recipe for making any artwork sellable as canvas / framed-canvas
prints — including odd shapes like tall-and-narrow pieces. The system enforces every rule
below; you cannot accidentally sell a print that would come out wrong. When something is
blocked, the screen tells you which step is missing.

## The five steps

**1. Upload the master scan** (product edit page). The highest-resolution scan you have —
the original file is never modified by anything below.

**2. Set the crop box** (product edit → the crop tool). Drag the box to exactly the artwork
you want reproduced. For pieces that need a border, choose the matte option and a color —
the matte preserves your crop's shape, so every print size still matches the artwork.
Saving the crop marks the master "pending crop processing."

**3. Run the crop worker** — this is the one technical step; it runs on the studio computer:

    node scripts/process-master-crop.mjs

It processes every pending crop losslessly (no resampling, no quality loss) and flips each
master to **Print ready**. Until a master is Print ready, the Variants tab will not trust its
dimensions and the storefront will not offer prints for it. Re-cropping later is safe — old
orders keep the exact file they were placed with — but any live print variants will need to
be regenerated if the new crop changes the shape.

**4. Build the sizes** (product edit → Variants tab):

- **Generate S/M/L** — proposes three sizes derived from your crop's exact shape, snapped
  to a 0.05-inch grid. Fractional sizes like 5.6×12 are normal and price correctly.
- Some proposals may be dropped for extreme shapes — the message tells you the real reason:
  - *resolution*: the size would need more pixels than your scan has (bigger scan or
    smaller size);
  - *bounds*: outside the printable range (canvas: 6–100in wide, 6–52in tall; 0.75in
    canvas: 6–65 × 6–36);
  - *aspect*: couldn't land on the grid within 1% of your crop's shape.
- **Add custom size** for anything else — the width/height fields auto-lock to your crop's
  aspect, validate live, and show the live price before you save. This is the escape hatch
  for very tall/wide pieces where S/M/L is dropped.
- Every size is created as a **Draft**. Check the price and margin columns (margin settings
  live in Admin → Settings → Pricing).

**5. Flip each size Live.** The Live toggle only enables when everything is right: master
Print ready, size matches the crop within 1%, real (non-zero) wholesale cost, medium enabled.
If Live is greyed out, the banner names the missing piece.

## What happens on an order (so you know what "working" looks like)

Payment → the order and its print specification are frozen exactly as purchased → the
fulfillment queue submits to LumaPrints within ~2 minutes (Mirror Wrap edges: the full
artwork on the face, edges mirrored around the sides — never cropped) → the buyer gets a
confirmation email immediately and a tracking email when it ships → the order shows
"shipped" with a tracking link in your admin and in their account.

## If something goes wrong, you get an email

Every failure mode alerts you by email and shows in the admin — nothing fails silently:

- **"Needs attention"** — a print couldn't be submitted automatically. The order page shows
  why. Fix the cause; the queue retries on its own (duplicate orders can't happen — the
  printer rejects a duplicate submission of the same item).
- **"Failed validation"** — the file/shape check caught a mismatch BEFORE anything was
  printed. Usually means the variant was built against an old crop: regenerate that
  product's variants.
- A paid order with no items, a price mismatch, or an oversold original each alert you
  separately, at most once per order.

## Do / Don't

- **Do** run the crop worker after every batch of new crops.
- **Do** regenerate a product's variants after re-cropping it.
- **Don't** hand-edit print sizes to a different shape than the crop — the system will block
  the sale rather than ship a distorted print.
- **Don't** worry about refunds for prints already submitted: refund the payment from the
  order page, then cancel the print in the LumaPrints dashboard if it hasn't shipped.
