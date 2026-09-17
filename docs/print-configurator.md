# Print configurator: the storefront door

Authored by DotWin

What a shopper sees when the print configurator is open, the one switch that opens it, the
preview-only override, and the rollback.

## What the shopper sees

On an artwork page, in place of the legacy size list:

1. **Print type** — the mediums with at least one enabled subcategory, at least one live variant
   and a ready print master. Nothing else appears.
2. **Refine** — shown when a medium has more than one enabled subcategory, shaped by the axis
   that medium actually varies on: depth for canvas and framed canvas, paper for fine art paper
   and foam-mounted, a frame-profile swatch row for framed fine art paper, surface for metal.
3. **Size** — the live sizes for that artwork and print type, each with its price.
4. **Options** — the enabled groups in sort order: frame style, border or wrap, mat size and mat
   colour, paper type, glazing, hardware, backing, mounting, finish. A choice that cannot be
   made is shown disabled with the reason, never hidden and never a dead end.
5. **Preview** — the artwork in the chosen frame and mat at true relative scale.
6. **Add to cart** — each distinct configuration is its own cart line, labeled with its options.

Every change re-quotes on the server; the price on screen is the price that is charged.
What the catalog offers is set in Print Catalog (`docs/catalog-management.md`); what a
configuration costs is `docs/pricing-engine-v2.md`.

## The flag

`site_settings.print_configurator_enabled` is the whole door. It is read in one place,
`src/lib/catalog/door.ts`, so the artwork page, the public print-quote route and checkout
validation can never disagree about whether the configurator is open.

- `false` (the seeded value): the legacy size picker serves the artwork page and the public
  print-quote route does not answer.
- `true`: the configurator serves the artwork page and the quote route answers.

A read error is thrown, never swallowed into "open" or "closed", so a database problem can
neither expose a dark feature nor silently hide a live one.

## Preview-only override

Preview deploys share the production database, so the flag alone cannot open the door on a
preview without opening it on the live store. `PRINT_CONFIGURATOR_FORCE=on|off` overrides the
flag for that deploy, and is honoured **only** when `VERCEL_ENV` is not `production`.
Production ignores the variable entirely, so a stray value cannot flip the live store.

- `on` — walk the configurator on a preview while production stays dark.
- `off` — run the rollback drill on a preview while production stays open.

## Rollback

Set `print_configurator_enabled` to `false`. The artwork page returns to the legacy size picker
and the quote route stops answering, within the page cache. Nothing else is undone: the catalog
rows, the labels, the swatches and the generated sizes all stay as they were, and a paid order is
untouched either way, because an order carries its own frozen specification.
