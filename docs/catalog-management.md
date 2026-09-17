# Print Catalog management

Authored by DotWin

The operator guide to `/admin/catalog` (Print Catalog) and `/admin/products/coverage`
(Print Coverage): what each control writes, what a sync will and will not touch, and how to
prove a configuration still sells before a customer finds out that it does not.

How a run refreshes the catalog tables is a separate document: `docs/catalog-sync.md`.
What turns a configuration into money is `docs/pricing-engine-v2.md`. Neither is repeated here.

## The two screens

| Screen | Route | Answers |
|---|---|---|
| Print Catalog | `/admin/catalog` | What may the shop offer at all? |
| Print Coverage | `/admin/products/coverage` | Which artworks actually have something to buy? |

Both are in the left admin menu, Print Catalog above Print Coverage. Print Coverage also sits
under Products in its breadcrumb, because it is a per-artwork view of a storewide decision.

## Print Catalog: the tree

Four levels, each a row with an `enabled` switch:

```
Medium (Canvas, Framed Canvas, Fine Art Paper, Framed Fine Art Paper,
        Foam-Mounted Paper, Metal, Peel & Stick, Rolled Canvas)
  └─ Subcategory  the print type a customer buys (a depth, a paper, a frame profile, a surface)
       └─ Option group  Frame Style, Border, Mat Size, Mat Color, Paper Type, Glazing,
            └─ Option    Hardware, Backing, Print Mounting, Finish, Underlayer
```

The switches cascade downward (plan ADR-5). An option is offered only when its group, its
subcategory and its medium are all on. Turning a medium off closes everything beneath it in one
write; turning it back on restores the labels, swatches and defaults underneath, because those
are stored per row and nothing clears them.

Per-row controls:

- **Switch** — `enabled`. The only thing that decides whether a customer can pick the row.
- **Default** (options) — writes `default_option_id` on the parent group. Every enabled group
  wants one: it is what an untouched group contributes to the first price on the product page,
  and what the rules engine fills in when a customer never opens that group.
- **Label** — `display_label`, your wording in place of the provider's name. Customer-facing.
- **Description** / **Customer note** (subcategories) — the one-line explanation under the
  print type on the product page.
- **Sort order** — the order of the row on the product page.
- **Swatch** (frame and mat options) — a colour (`#rrggbb`), or a swatch image, plus the frame
  face and depth in inches. A live frame or mat option with no swatch is flagged `needs swatch`:
  a customer would be choosing a frame sight unseen.

## Badges

| Badge | Means | What to do |
|---|---|---|
| **New** | The sync found the row and nobody has looked at it (`acknowledged_at` is null). It arrived `enabled = false`. | Read it, turn it on if you want it, then choose **Acknowledge**. |
| **Removed by provider** | The provider stopped listing it. The row is tombstoned, never deleted, so its history and any order that used it stay readable. | Nothing, unless it is still enabled: turn it off. |
| **Blocked** | Its geometry cannot be sold from our print masters at all (ADR-4). The reason is printed beside the badge. | Nothing. A blocked row cannot be switched on; the reason is the answer. |
| **needs swatch** | Live, in a swatch group, with nothing to show. | Set a swatch colour or image before launch. |

The two permanently blocked families, and why: **Image Wrap** on canvas needs 3.75 inches of
extra artwork wrapped around each side, and our masters are produced at the ordered aspect with
the whole artwork on the face; **paper bleed** sizes expect a shrunken image inside the sheet.
Canvas edges therefore ship Mirror Wrap, which mirrors the edge of the artwork around the sides
and crops nothing.

## Provider sync

In **Provider sync** at the top of the screen:

1. **Preview changes (dry run)** — walks the provider catalog and writes nothing. The summary
   line reads `N new · N removed · N changed`; open it for the row-by-row diff.
2. **Sync from LumaPrints** — the same walk, applied.

A run reports `status · chunks · requests` while it works, and `waiting for the run in flight`
if another one already holds the lock. A sync owns provider facts (names, bounds, required DPI,
`required`, dependency links, tombstones). It never touches `enabled`, `is_default`,
`display_label`, `description`, `customer_note`, `sort_order`, `swatch`, `geometry`,
`pricing_mode` or `acknowledged_at` on a row that already exists. Re-running a sync cannot undo
your configuration. The merge rules and the outage guard are in `docs/catalog-sync.md`.

## Sellable check

Per subcategory, **Sellable check** takes a **Width (in)**, a **Height (in)** and a multi-select
of **Options**, and answers with the live price or with the same plain sentence a customer would
see. It runs the real rules engine and the real quote path, so it is the fastest way to prove
that a change did not quietly close a size:

- after changing a default in any group,
- after enabling a group that was off,
- after a sync reports changed bounds,
- before turning a medium on for the first time.

A refusal names the constraint (a mat past the frame's glass ceiling, a size past the
subcategory bounds, an option not offered at that size, a colour with no mat). It is a verdict
about that configuration, not a screen to work around.

## Print Coverage

`/admin/products/coverage` is a grid of artworks by print type: a cell says whether that artwork
has a live size on that print type, so a gap is visible storewide rather than one product at a
time. **Generate missing sizes** fills the gaps by running the same size builder the Variants
tab uses. Run it as a dry run first, read what it proposes, then run it for real and review the
new sizes inside each product before making them live. Sizes it cannot propose are reported with
their reason (resolution, bounds, aspect); that is information, not a failure.

## Order of work

1. Print Catalog: turn on the mediums and print types you want, set a default in every enabled
   group, label and swatch the frames and mats, acknowledge anything New.
2. Sellable check: one real size per print type.
3. Print Coverage: find the gaps, generate the missing sizes, review them.
4. The product's Variants tab: make the sizes live per artwork.
5. The storefront flag: `docs/print-configurator.md`.

## What a toggle never does

Nothing here reaches a paid order. A purchase records the exact print type and option ids it was
bought with, and fulfillment submits from that record, so turning an option off afterwards
changes what the next customer may choose and nothing else.
