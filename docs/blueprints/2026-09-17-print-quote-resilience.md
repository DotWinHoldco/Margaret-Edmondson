# Print quotes never fail the shopper; renamed products never 404 — Blueprint

Authored by DotWin

Format: v2
Status: executing
Radius: R2
Budget: agents ≤ 3 · forks ≤ 0 · rounds ≤ 1 · ultracode: off
Examine: default
Runner: `npm run build-check` (the authority on green)

## Mission

Two production defects seen on 2026-09-17 after the owner switched the print configurator on:

1. **"Our print partner is busy"** on every print product page within a minute of browsing. The
   public print-quote route was refused by OUR key-wide request budget (25/min, 8 held for
   fulfillment, 5 provider requests per uncached size), not by LumaPrints. The production
   pricing cache for the new catalog held 7 rows, so every size change was a cache miss.
2. **`/shop/art/think-again` → Page not found.** The product's slug was renamed on 2026-09-14;
   the homepage Featured grid stores a snapshot of the slug and nothing redirects old slugs.

Done = neither can reach a shopper again: every offered (print type, size) carries a priced
row before a shopper asks for it and is kept fresh by a cron; a refusal serves the last row
(never with free freight) and the page waits and retries instead of going red; a renamed
product's old URL redirects permanently and featured tiles always link to the live slug.

## Radius

R2 + S: provider seam (`src/lib/pricing`, `src/lib/integrations`), a migration with a trigger
and RLS, a cron route, an admin route, the public product page.

## Units

1. **Quote engine** (`src/lib/pricing/quote.ts`, `quote-cache.ts`): stale fallback never returns
   shipping 0 (exact class → same class → max freight seen for the size → refuse); cache TTL
   24h → 72h; `QuoteUnavailableError.reason` names the refusing class for the log line.
2. **Warmer** (`src/lib/pricing/warm.ts`): the offer surface = active, prints-enabled products
   with a ready master × their active sized variants × the enabled subcategories of that medium
   that the size fits, deduplicated by (subcategory, size). A pass prices the default
   configuration for targets in priority order (missing → expired → expiring within 12h), one
   target per 25s, under `withProviderReserve(WARM_RESERVE=13)` so shoppers always keep slots,
   bounded by a deadline and a per-pass cap, and stops on the first provider refusal.
3. **Routes**: `GET /api/cron/pricing-warm` (requireCron, lease via `rate_limit_hit`, maxDuration
   300, every 5 min in `vercel.json`); `GET/POST /api/admin/catalog/warm` (requireAdmin; GET =
   coverage counts, POST = one pass after the response via `after()`).
4. **Storefront hook** (`useConfiguratorQuote.ts`): a 503/network failure enters a retry ladder
   (4s, 8s, 16s, 32s) shown as "Checking the price…", and only then the red copy.
5. **Slug redirects** (migration `20260917130000_product_slug_redirects.sql`): table
   `product_slug_redirects(old_slug pk, product_id)`; SECURITY DEFINER trigger on
   `products.slug` UPDATE records the old slug and clears any redirect that now collides with a
   live slug; backfill from `audit_log`; anon/authenticated SELECT only. Product page resolves a
   miss through it with `permanentRedirect`.
6. **Featured grid** (`getPageBlocks`): tiles take `slug`/`title` from the live product row the
   loader already reads; a tile whose product is no longer live is dropped.
7. **Settings card**: readiness line ("Prices ready for N of M sizes"), "Warm prices now",
   and a warning in the switch-on confirmation while sizes are missing.
8. **Print-master crop, added mid-session** (owner hit "Could not upload the cropped print
   file" on The Dual; Keepsake had failed the same way on 09-15): the worker keeps a master's
   previous print file IN SERVICE when a re-crop fails (`failedJobState`: status back to
   `ready`, the failure in `print_error`), because every consumer reads `print_status =
   'ready'` and a failed re-crop used to take the product off the shelf; the upload error
   now carries the storage service's own answer and file size; a new admin route
   `POST /api/admin/master-artworks/[id]/crop/revert` makes the uncropped original the
   print file again (crop cleared, fresh request stamp fences out an in-flight job), with a
   "Revert to original" button in the crop editor. Root cause of the upload failures is a
   Supabase PROJECT upload cap (every crop that ever uploaded is < 48 MB; the two failures
   are 62 and 130 megapixel PNGs) — an owner dashboard change, recorded in Close.

## Contracts

- `WarmTarget { subcategoryRef, subcategoryId, medium, widthIn, heightIn, productId }`
- `WarmCoverage { surface, fresh, stale, missing, expiringSoon, lastWarmedAt }`
- `WarmRunReport { considered, priced, skippedFresh, unavailable, refused, stopped: string|null, elapsedMs }`
- Cron/admin JSON: `{ ok: true, ...WarmRunReport }` or `{ ok: true, skipped: string, retryAfterMs }`.
- Hook state adds `{ status: 'retrying'; attempt: number }`.

## Security contract

- Table `product_slug_redirects`: RLS on; SELECT for anon + authenticated (old slugs are public
  URLs); no INSERT/UPDATE/DELETE grant for browser roles; writes only by the trigger function
  (`security definer`, `set search_path = public`) and the service role. Transaction owner: the
  trigger. No PII.
- Routes: cron behind `requireCron` (fail-closed); admin behind `requireAdmin` (aal2). The warm
  pass runs as the service role and reads only catalog/product/variant/cache rows.
- Doors: none new. Kill switch `site_settings.lumaprints_enabled` still stops every provider
  call (the client throws before spending a slot).
- Egress: LumaPrints pricing + shipping endpoints only, paced.

## Verify

- `npm run typecheck` → 0 errors.
- `npx vitest run test/pricing test/api/pricing-warm-routes.test.ts test/api/print-quote-route.test.ts test/shop/use-configurator-quote.test.tsx test/page-blocks test/products/slug-redirect.test.ts test/rls test/admin/print-configurator-section.test.tsx` → all files pass, 0 new skips.
- `npm run build-check` → GREEN, 0 unexplained skips.
- Migration applied to production before merge; `database.types.ts` regenerated in the same commit.

## Walks

1. Production: `curl -sI https://www.artbyme.studio/shop/art/think-again` → 308 to
   `/shop/art/think-again-paintin-the-ass`; homepage HTML carries the new slug.
2. Production: cron `pricing-warm` runs; Vercel logs show `[pricing-warm]` lines; admin GET
   coverage shows `missing` falling to 0 over successive runs.
3. Production PDP: change sizes repeatedly on a warmed product; no "busy" copy; quotes served
   from cache (no provider lines in the logs for those sizes).

## Red-team

- Missing states: the shipping-only miss under refusal (was free freight) → now max-of-size or
  refuse. A warm pass and a shopper racing → the reserve keeps shopper slots; the lease keeps
  two passes from overlapping.
- Colliding units: the trigger and the app both write `products.slug`; only the trigger writes
  redirects. Eviction on admin toggles empties a subcategory; the cron refills within 5 min and
  the hook waits instead of failing.
- A VERIFY that passes while broken: the cron could be green with a wrong surface → the surface
  is a pure function with fixture tests, and the walk reads coverage on production.
- Symptom vs cause: the error copy blamed the provider; the cause was our budget + cold cache.
  Both are addressed, not the copy.
- What the walk exposes: whether the production key throttles the warmer's pace (logged as
  `[lumaprints] throttled`; the pass stops and resumes next tick).

## Examine

- **Runner:** `npm run build-check` → `status: GREEN`, 15 gates ✓ / 0 ✗, docs 0 blocking (runs
  2, 3 and 4 in this session; run 1 failed on one route handler without an intent comment and
  one component test written for the old instant-error behaviour, both fixed).
- **Security pass (1 `security-reviewer`, Opus, 17 tool calls, diff pasted by path):** 11
  findings. Fixed in commit `381e930`: S1 redirect rows readable for drafts → policy predicate
  on `products.status` (migration 20260917140000, live); S2 retry ladder amplifies charged
  refusals → `retryAfterMs` from the budget through the 503 body + `Retry-After` to the hook,
  plus jitter; S3 stale answer counted as priced → pass ends with `stale_fallback`; S4 freight
  failure priced with shipping 0 → refuses; S5 search_path pin → `''` (DEFINER stays: products
  has an admin UPDATE policy, so the reviewer's "unnecessary" claim was checked live and is
  wrong); S6 redirect target encoded + slug shape enforced both sides; S7 id list chunked,
  coverage is one paged read; S9 lease 280 s + released in `finally` on both routes.
  Triaged by the architect against live facts, no refuter spent: S8 (`sold` invisible to anon)
  is the pre-existing products policy, out of scope, noted; S10 (slug takeover via `on conflict
  do update`) cannot occur — `products.slug` is UNIQUE and the trigger deletes the row before
  any product can hold the slug again, so the "update" branch is unreachable in that sequence;
  S11 (`select('*')` in getPageBlocks) is the pre-existing query moved, and only three fields
  reach the tile — recorded as debt.
- **Correctness review:** a second `reviewer` agent was refused by the governor (the previous
  program's blueprint was still `executing`; closed in this PR), so the architect examined the
  seams directly: the warmer's default key is computed by the server's own normalizer from an
  empty selection, which is exactly what the public route normalizes a shopper's first request
  to; the hook's stale-key derivation makes a late answer from an aborted request unreachable;
  checkout accepts a stale quote (no `stale` check in validation.ts), so a warmed-then-expired
  row never blocks a sale.
- **Crop unit (8):** examined inline; the readiness rule is enforced in five consumers
  (`product-utils`, `checkout/snapshot`, `checkout/validation`, `fulfillability`, the RPC), so
  the fix keeps `print_status = 'ready'` semantics and changes what a failure writes instead.

## Proof

(walks + probe record appended at close)
