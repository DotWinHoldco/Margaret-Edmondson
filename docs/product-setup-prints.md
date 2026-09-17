# Setting Up an Artwork for Prints (Any Shape)

Authored by DotWin · for Margaret · updated 2026-09-17

This is the complete recipe for making any artwork sellable as prints, on whichever print types
you have turned on, including odd shapes like tall-and-narrow pieces. The system enforces every
rule below; you cannot accidentally sell a print that would come out wrong. When something is
blocked, the screen tells you which step is missing.

## Before an artwork: decide what the shop offers

Print Catalog (left menu, or `/admin/catalog`) decides what the whole shop may offer: which
mediums, which print types inside them, and which frames, mats, papers, glazings and hardware a
buyer may choose. Set that up once and revisit it when you want a new option. The operator guide
is `docs/catalog-management.md`.

Two things worth knowing before you set an artwork up:

- **Frames and mats are the buyer's choice, not a file you prepare.** On the framed print types,
  the buyer picks the frame profile, the mat width and the mat colour on the product page. A mat
  is added around the print, so the framed piece arrives larger than the print while the print
  stays the size that was bought. Each frame holds a largest sheet of glass, so a wide mat on a
  large print can be unavailable while a narrower mat or a smaller print is still offered.
- **Each print type has its own size limits and its own required detail (DPI).** Paper generally
  asks for more detail than canvas, so one scan can support a large canvas and a smaller largest
  paper print. Sizes that do not clear the limits are never offered, so a buyer cannot reach a
  dead end.

## The five steps

**1. Upload the master scan** (product edit page). The highest-resolution scan you have — the
original file is never modified by anything below.

**2. Set the crop box** (product edit → the crop tool). Drag the box to exactly the artwork you
want reproduced. The crop tool's border setting changes the prepared image itself; it is not the
mat the buyer orders. Saving the crop marks the master "pending crop processing."

**3. Run the crop worker** — this is the one technical step; it runs on the studio computer:

    node scripts/process-master-crop.mjs

It processes every pending crop losslessly (no resampling, no quality loss) and flips each
master to **Print ready**. Until a master is Print ready, the Variants tab will not trust its
dimensions and the storefront will not offer prints for it. Re-cropping later is safe — old
orders keep the exact file they were placed with — but any live print variants will need to
be regenerated if the new crop changes the shape.

**4. Build the sizes** (product edit → Variants tab). The tab shows one section per medium,
listing only the print types you turned on in Print Catalog, with the fits chips and the size
bounds for each:

- **Generate S/M/L** — proposes three sizes per print type, derived from your crop's exact
  shape and snapped to a 0.05-inch grid. Fractional sizes like 5.6×12 are normal and price
  correctly.
- Some proposals may be dropped for extreme shapes — the message tells you the real reason:
  - *resolution*: the size would need more pixels than your scan has, at the required DPI of
    that print type (a bigger scan or a smaller size);
  - *bounds*: outside the printable range of that print type. The range is the provider's, read
    from the catalog, and differs per print type;
  - *aspect*: couldn't land on the grid within 1% of your crop's shape.
- **Add custom size** for anything else — the width/height fields auto-lock to your crop's
  aspect, are checked against the chosen print type's bounds, and show the live price before you
  save. This is the escape hatch for very tall/wide pieces where S/M/L is dropped.
- Every size is created as a **Draft**. Check the price and margin columns (margin settings live
  in Admin → Settings → Pricing).
- To fill gaps across the whole shop rather than one artwork at a time, use **Print Coverage**
  (`/admin/products/coverage`): it grids every artwork against every print type and generates
  the missing sizes in one pass. Dry run first, then review the new sizes here before publishing.

**5. Flip each size Live.** The Live toggle only enables when everything is right: master
Print ready, size matches the crop within 1%, real (non-zero) wholesale cost, print type enabled.
If Live is greyed out, the banner names the missing piece.

## What happens on an order (so you know what "working" looks like)

Payment → the order and its print specification are frozen exactly as purchased, including the
print type and every option the buyer chose → the fulfillment queue submits to LumaPrints within
~2 minutes (canvas edges use Mirror Wrap: the full artwork on the face, edges mirrored around the
sides, never cropped) → the buyer gets a confirmation email immediately and a tracking email when
it ships → the order shows "shipped" with a tracking link in your admin and in their account.

Because the order carries its own frozen specification, changing anything in Print Catalog
afterwards has no effect on it.

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
- **Do** run the Sellable check in Print Catalog after changing a default or enabling a group,
  before relying on a print type.
- **Don't** hand-edit print sizes to a different shape than the crop — the system will block
  the sale rather than ship a distorted print.
- **Don't** promise one fixed presentation in the description when the buyer chooses the frame,
  mat and paper on the page.
- **Don't** worry about refunds for prints already submitted: refund the payment from the
  order page, then cancel the print in the LumaPrints dashboard if it hasn't shipped.
