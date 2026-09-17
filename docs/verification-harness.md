# The catalog verification harness

Authored by DotWin.

The build plan's §10 protocol says every Definition-of-Done clause maps to a
machine-run check, and that the launch gate is a generated report rather than
confidence. This page is how to run the pricing half of that harness: **V2**, the
full-matrix sandbox pricing sweep, and **V6.1**, legacy parity.

Both live in one script, `scripts/verify-catalog-pricing.ts`, and both write their
result into `audit/catalog-verification/` (see the README there for the file shape and
how P9 assembles them).

## Why a script and not a test

`npm test` must stay fast, offline and free. These two runs are neither: the sweep
spends real provider budget for tens of minutes against the sandbox, and parity reads
the production database. They are run deliberately, by a person, with a printed
receipt that names the commit and the host it ran against.

They are plain-node scripts: no build step, no Next. Run them through the loader hook.

```bash
node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts …
```

## The loader hook

`scripts/lib/register-ts.mjs` is a module customization hook (Node >= 20.6, no
dependency) that teaches node the project's own module resolution: an extensionless
relative specifier gets `.ts` / `.tsx` / `/index.ts`, and `@/x` becomes `<repo>/src/x`.
It answers only specifiers node could not have meant literally and only when the file
is actually on disk; everything else falls through to the default resolver untouched.
Node still does the type stripping; the hook rewrites no code.

Without it, `import { canonicalGroupKey } from './keys'` inside a source module fails at
the first hop, and the alternative — writing `.ts` on every import — needs a `tsc`
suppression on every line, because this project does not enable
`allowImportingTsExtensions`.

With it, the harness imports the REAL modules rather than copies of them: the rules
engine (`catalog/rules.ts`), the assembler (`catalog/assemble.ts`), the canonical group
keys, and — the point of the exercise — `catalog/seed-rules.ts`, so the sweep prices
exactly the default option set the catalog seeds and hands the rules engine exactly the
geometry the catalog stores.

One replica remains, marked in the file: the margin cascade, because
`pricing/margin.ts` imports the Next server client and cannot be loaded by any node
script. It mirrors `resolveEffectiveProductMargin` (product > category > site > 100);
the variant-level override comes from the real `customerPriceCents`.

## V2 — full-matrix sandbox pricing sweep

```bash
node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --sweep \
  --env .env.luma \
  --snapshot fixtures/lumaprints/catalog.us.api-sandbox.lumaprints.com.2026-09-16.json
```

Optional: `--subcategories 101002,105005` to limit the run, `--sizes small,mid,max` to
choose which representative sizes options are swapped at, `--yes` to proceed past the
request budget.

What it does, per subcategory in the snapshot:

1. **The size grid at the default option set.** The standard grid from
   `pricing/mediums.ts`, clipped to the subcategory's published bounds (sizes outside
   them are documented drops, listed in the table, never failures). The default set is
   derived from the provider's option NAMES, exactly as the catalog seeds it: Mirror
   Wrap, No Bleed, No Mat, Archival Matte, wire or sawtooth, No Backing, White,
   Acrylic, Dry Mounted, Inset Frame, the depth's Black Floating Frame, the 2in rolled
   border. It comes from `seed-rules.ts` itself (`pickSeededDefault`), not from a copy
   of those rules. It is never `[]`: an empty array resolves to Image Wrap on canvas and
   a 0.25in bleed on paper, which 406 an aspect-exact master (P15/F30).
2. **Every option swapped into that default**, one at a time, at up to three in-bounds
   sizes (small, mid, max).
3. **The maximal distinct-group configuration** at two sizes: one option per group,
   each the largest measured delta, combined only across DISTINCT groups (the P14
   method).

Assertions:

- every in-bounds item prices (`success: true`, `price > 0`);
- every requested option id comes back echoed with a numeric price, except the Canvas
  Finish group (**F35**: the provider accepts 212 / 213 / 259 and never echoes them, so
  pricing cannot confirm the group was applied). That exemption is recorded once per
  subcategory as a `FINDING F35` line and is not a failure; every other group stays
  asserted;
- **additivity** — `apiTotal === base + Σ deltas` — asserted on canvas, framed canvas
  and metal (101/102/106), and RECORDED on framed paper (105), which P0 measured as
  non-additive (F26) and which therefore prices whole configurations;
- **the glass-ceiling edge** on framed paper: the largest in-bounds print plus a 5in
  mat is priced by the provider (recorded: pricing enforces no geometry, P4/F31) and
  must be REJECTED by `rules.ts` with `glass_ceiling` (asserted: the engine is the only
  pre-payment gate, and it has to be stricter than the provider).

`apiTotal` is `price + Σ options[].price`: a pricing row's `price` is the BASE price
for that subcategory and size, and each option's own price sits in `options[]`. A
harness that read `price` as the total would score every delta at zero and pronounce
the whole catalog additive.

Safety and cost. The sweep refuses to run against anything but the sandbox
(`assertSandbox`), never places an order, and goes through the shared throttled probe
client at ≤ 25 requests/minute so the live storefront keeps its share of the 40/min key
(F29). It prints its request estimate before sending anything and refuses to start
above 900 requests without `--yes`. Items are batched 40 to a call, so a two
subcategory run costs about 5 requests and a full 50-subcategory sweep a few hundred.

## V6.1 — legacy parity

```bash
node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --parity
```

Reads the production database (service role from `.env.local`) and makes **no provider
call at all**. For every active print variant (medium set, not an original, not
studio-only) it asserts:

1. the catalog's default option set for that medium's subcategory equals the legacy
   `lumaprints_mediums.option_ids` as a set, computed by `rules.ts` itself rather than
   by a replica;
2. the catalog subcategory id equals the legacy one;
3. `customerPriceCents(...)` recomputed from the variant's stored cost and shipping,
   through the margin chain (variant override → product → category → site → 100),
   equals the stored price to the cent.

This is the gate the storefront cutover flag waits on: with only today's configuration
enabled, the new engine must reproduce today's prices exactly.

### Optional live sample

```bash
node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts \
  --parity --live-sample 5 --live-env .env.luma.production
```

Prices N variants on the PRODUCTION pricing endpoints (read-only, no orders) with the
legacy option set and with the catalog default set in one batch each, asserts the two
agree, and records drift against the stored cost as INFO. Production credentials are
not in the repo: without them the run prints `SKIPPED: live sample (no production
credentials)` and carries on. It never substitutes the sandbox and never invents a
number.

## Reading the result

Both modes exit non-zero when any assertion failed, print a one-line summary in the
same shape the JSON records, and write `audit/catalog-verification/<step>.{json,md}`.

- `RECORDED:` notes are observations the plan keeps but does not assert on.
- `FINDING:` notes are provider behaviour we did not expect and need to triage.
- `SKIPPED:` notes are assertions that could not be made, each with its reason. A
  skipped guard is no guard: read them before calling a step green.

A red step is not automatically a bug in the code under test. The first parity run is
the example: it fails every default-set comparison while the production catalog carries
structure (51 subcategories, 1265 option rows) but not one seeded `is_default`, and it
says so in a single `DIAGNOSIS (cause class: …)` line above the per-medium table. That
is the harness doing its job; the fix is the §4.3 backfill, not a softer assertion.
