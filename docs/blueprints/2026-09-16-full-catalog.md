# Full LumaPrints Catalog (P0–P9) — Blueprint

Authored by DotWin

Format: v2
Status: closed
Radius: R2
Budget: agents ≤ 12 · forks ≤ 0 · rounds ≤ 1 · ultracode: off
Examine: default
Runner: `npm run build-check` (the authority on green)

> The contract for this program is `audit/FULL-CATALOG-BUILD-PLAN.md` (rev 3). This blueprint is
> the runner-facing wrapper: budget, radius, units, verify, walks, and the examine/proof receipts.
> Where the two disagree, the plan wins on scope and the blueprint wins on process.

## Mission

A customer opens any artwork and can buy it in every LumaPrints product line (8 mediums, 50
subcategories, every option group) with a live price and preview; Margaret can switch any medium,
subcategory, option group or option on or off from the admin without a deploy. Done = plan §0
Definition of Done, proven by the §10 protocol V1–V7 and `audit/CATALOG-VERIFICATION-REPORT.md`.
The live store keeps selling throughout; the storefront flag stays OFF until V6.1 parity is
cents-exact. Two human gates remain at the end: the real-money production QC order (V7.9) and the
production flag flip + per-medium enablement with margin sign-off.

## Contracts

Plan §4 (tables `lumaprints_subcategories`, `lumaprints_option_groups`, `lumaprints_options`;
`lumaprints_pricing_cache` v2 columns; `order_items.line_hash` + `solid_color_hex`), §5 ADR-2
(selection `{variantId, subcategoryRef, optionIds[], solidHex?}`, `line_hash =
sha256(subcategoryRef ‖ sorted optionIds ‖ solidHex)`, `price_key_hash = sha256(sorted optionIds)`),
ADR-3 (`quote.ts` contract: `POST /api/products/[id]/print-quote {medium, variantId|size, optionIds}`
→ `{available, priceCents, compareNote?, constraintViolations[]}`), ADR-4 (`geometry` keys
`per_side_in | requires_file_bleed_in | size_whitelist | needs_hex | probe_owed`), checkout request
schema v3 and `purchaseSpec` v3 (snapshotVersion 3). Each phase brief pins the exact TypeScript
types before fan-out.

## Security contract

- Tables: `lumaprints_subcategories`, `lumaprints_option_groups`, `lumaprints_options`,
  `catalog_sync_runs` (owner: catalog); RLS mirrors `lumaprints_mediums` — admin/artist
  `is_admin_or_artist()` for all writes, public SELECT of enabled rows only for the storefront
  (anon reads never see disabled or tombstoned rows through the public policy); service role
  writes from sync/cron only.
- Grant boundary: browser roles hold SELECT only (public: enabled + non-tombstoned rows; admins:
  all rows); NO insert/update/delete grant or policy for anon/authenticated. Sync writes as the
  service role behind `requireAdmin`/`requireCron`; P3 toggles go through SECURITY DEFINER RPCs
  that check `is_admin_or_artist()` AND `auth.jwt()->>'aal' = 'aal2'` and write the audit row in
  the same transaction. Tombstones never touch `enabled`; finalize refuses a half-empty walk.
- Doors seeded DARK: `site_settings.print_configurator_enabled = false`; every new subcategory /
  group / option `enabled = false` except the exact current live configuration (plan §4.3).
- Transaction owners: order creation stays in the Stripe webhook path (`order_items` insert keyed
  `(order_id, variant_id, line_hash)`); fulfillment claim stays `claim_fulfillment_items`.
- Egress: LumaPrints API only (production host from the deployed app; sandbox from scripts and
  previews); ≤25 req/min shared budget. No new third parties.
- PII: none new (hex colour and option labels are product data). Test-mode orders must never be
  submitted to the production LumaPrints host (router guard, P5 unit 1).

## Units

| # | Unit | Role | Owns (disjoint) | Verify expectation |
|---|------|------|------------------|--------------------|
| P0 | Catalog snapshot + probes + admin snapshot route (DONE, PR #1) | executor | scripts/catalog-snapshot.mjs, scripts/verify-catalog-geometry.mjs, scripts/lib/lumaprints-probe-client.mjs, fixtures/lumaprints/**, src/lib/catalog/walk.ts, api/admin/lumaprints/snapshot | 16 probes 0 FAIL 0 SKIPPED; build-check GREEN |
| P0b | Production snapshot + id diff (via deployed route) | architect | fixtures/lumaprints/catalog.us.api.lumaprints.com.*.json, id-diff | `--diff` exit 0 or every mismatch recorded |
| P1 | Schema + sync v2 + backfill + cron + loader | executor (+ architect on RLS/seed) | supabase/migrations/*, src/lib/catalog/{types,load,sync}.ts, api/admin/lumaprints/sync, api/cron/lumaprints-catalog-sync, scripts/backfill-catalog.mjs | npm test green; parity assert 8/8 legacy rows reproduced |
| P2 | Pricing engine v2 + rules engine | executor (+ architect on quote seam) | src/lib/pricing/quote.ts, lumaprints-cache.ts, rules.ts, availability.ts, selection.ts, print-quote route | V6.1 parity cents-exact on every active variant; V2 sandbox sweep green |
| P3 | Admin catalog manager + VariantsTab v2 + offer-coverage generator (session 2, 2026-09-17: architect wrote migration 20260917100000 — five aal2-checked SECURITY DEFINER RPCs + audit rows + in-tx cache eviction — and the shared helpers `defaultSubcategoryForMedium`, `subcategory-tiers.ts`, `variant-insert.subcategoryRef`; three executors: A catalog manager routes+UI, B VariantsTab v2 + generate-defaults, C coverage route/report/script + bulk-create) | executor ×3 + architect | src/app/api/admin/catalog/**, src/components/admin/catalog/**, VariantsTab.tsx, api/admin/variants/coverage, bulk-create, generate-defaults, builder-context.ts, scripts/generate-offer-coverage.mjs | RTL + route tests; generator idempotent; coverage report |
| P4 | Storefront configurator + preview (flag) — session 2: architect wrote `src/lib/catalog/door.ts` (flag + preview-only `PRINT_CONFIGURATOR_FORCE` env override, production ignores it) and the cart line identity (`CartItem.selection`, `cartLineKey`, reducer keyed by line, quotes applied per line); executor D builds the configurator, FramePreview, storefront allow-list serializer, PDP mount, cart surfaces | executor + architect | components/shop/PrintConfigurator/**, ProductDetail, shop/art/[slug]/page, catalog/storefront.ts, CartDrawer, cart page, CartItemTitle, print-quote route flag read | V6 walk on a preview deploy (FORCE=on), flag OFF in prod |
| P5 | Cart / checkout / order freeze v3 + snapshot-gate sweep + test-mode router guard — session 2: ALL architect: migration 20260917110000 (order_items.line_hash + solid_color_hex, upsert key (order_id, product_id, variant_id, line_hash)), checkout schema v3 + per-line dedupe + configured-line re-quote through `quoteConfiguration` + price-drift refusal + purchaseSpec v3, snapshot v3 (`hasPurchaseSnapshot`, `>= 2` everywhere), webhook gate sweep (7 sites) + upsert key, `provider-guard.ts` | architect | checkout/validation.ts, checkout/snapshot.ts, webhooks/stripe/route.ts, cart/context.tsx, cart/quoted-prices.ts, fulfillment/provider-guard.ts | tests: checkout-validation-v3 (dual depth-only lines, price drift, no-quote), checkout-snapshot-v3, provider-guard, router-guard (real router, fake client) |
| P6 | Fulfillment v2 — session 2: architect: router guard wired into `validateLumaprintsItem` (both the order path and the single-item retry), data-driven required-group + needs_hex checks from the catalog tree (`checkFrozenOptions`, legacy 102xxx arithmetic only when the catalog has no row), `solidColorHexCode` passthrough; disabled-after-purchase submits (test) | architect | fulfillment/router.ts | V4: sandbox orders per medium (owed to P9) |
| P7 | Order surfaces | executor | emails, account order page, admin order panels | email snapshot tests |
| P8 | Cleanup + help articles + docs | executor | legacy pricing files, help/articles.ts, docs/*.md | grep gate zero retired symbols |
| P9 | Verification report + launch gate | architect | audit/CATALOG-VERIFICATION-REPORT.md | every automatable V7 item green |

## Verify

- Every phase: `npm run build-check` → `status: GREEN` (13/13 required gates); `npx vitest run` →
  all files pass, skip count reported (baseline 65 files / 550 tests / 7 skipped pre-existing).
- P1: sync dry-run zero destructive diffs; parity 8/8 legacy `lumaprints_mediums` rows reproduced.
- P2: `scripts/verify-catalog-pricing.mjs` V6.1 parity: N/N active print variants cents-exact;
  V2 sandbox sweep: every subcategory priced, additivity asserted, 0 FAIL.
- P4/P5/P6: Playwright V6 on preview (flag ON) 8/8 mediums; V5 money-path suite 0 failures;
  V4 8/8 sandbox orders 201 with exact option echo.
- P9: `audit/CATALOG-VERIFICATION-REPORT.md` generated by scripts, every V-step green.

## Acceptance walks

- [ ] Admin (Margaret's account, password-gated prod): open /admin/catalog, toggle a framed-paper
      mat colour off and on; the PDP reflects it within one page load.
- [ ] Customer (preview, flag ON, desktop + phone): configure a framed fine-art paper print with
      frame + 2in mat + colour, see the preview scale, add to cart, pay with a test card, receive
      the confirmation with the full option text.
- [ ] Customer (preview): two cart lines for the same artwork + size differing only by canvas depth
      coexist and land as two order_items rows.
- [ ] Kill-switch drill on prod: `lumaprints_enabled` off → items pause; on → resume.
- [ ] Rollback drill on preview: `print_configurator_enabled` off → legacy PDP returns, prices
      identical.
- [ ] HUMAN GATE — V7.9 real-money production QC order (framed paper, frame + 2in coloured mat)
      verified in the LumaPrints dashboard and on arrival.
- [ ] HUMAN GATE — production flag flip + per-medium enablement with margin sign-off.

## Red-team

The rev 1 plan was red-teamed by an independent fresh-context reviewer on 2026-09-16
(`audit/FULL-CATALOG-PLAN-ADVERSARIAL-REVIEW.md`): 14 findings (2 critical, 6 major, 6 minor),
every one dispositioned and integrated into rev 2 (F22–F29). P0 then converted every remaining
assumption into a recorded fact (`fixtures/lumaprints/PROBES.md`, 16 probes) and rev 3 folded
those in (F30–F34). The five questions, answered for the program: missing states → the ◼ blocked
toggles, tombstoned options and `probe_owed` rolled-canvas borders are explicit states; colliding
units → phases are dependency-ordered with disjoint OWNS; a VERIFY that passes while broken → V6.1
parity is a cents-diff over every active variant, V4 reads orders back from the provider, V2
asserts additivity against the API; symptom vs root cause → the July 406 class is root-caused to
`[]` resolving to Image Wrap (P15), not to sizes; what the walk exposes → the dual-depth cart line
and the disabled-after-purchase fulfillment are walked, not inferred.

## Examine

<!-- filled per phase: diff SHA range · seams reviewed by the architect · security reviewer
     findings + closures · agents used -->
- P0 (c104e35 + fix commit): architect read route + walker; ONE security-reviewer pass over the
  admin snapshot route: verdict SAFE TO DEPLOY, 0 blocking, 2 should-fix, 6 notes. Closed in the
  fix commit: provider error text no longer reaches the payload (`optionsError` = status + code);
  `catalogHost()` never echoes a malformed base URL; kill switch stops the walk (503
  `LUMAPRINTS_UNAVAILABLE`); unknown category answered from the category list with one request.
  Carried to P1 (sync v2 owns them): key-wide DB-backed limiter shared by every provider caller
  (the ≤25/min pace is per-invocation today) and retry-aware request accounting in the client.
  Operational note: `/api/admin/*` sits behind the site gate cookie; captures need that cookie.

- P1 (61a869c..9d9ca4e + b29497c, PRs #3 #4 #5 #6 #7): architect wrote the contracts (types, keys,
  hash, cache-tag), read the migration (RLS/grants) and sync finalize; ONE security-reviewer pass over
  schema + sync + budget: 13 findings (3 blocking) → 11 closed in one corrective round (grants →
  read-only browser roles; tombstones keep `enabled`; sync at 12/min; stale-run reaping + cooldown;
  hostile-default override in default selection; public tree filters groups/options; classified error
  vocabulary; uuid + host-checked continue; conditional claim; busy race → 409; dry-run body). Two
  production incidents found and fixed by the exit run itself: provider throttle → transient chunks
  (#4, #6); provider 50-item batch cap → batched defaults probe (#5). Bootstrap corrected to the five
  live mediums (#7). Agents used: 2 executors (+2 resumes), 1 security-reviewer.
- P2 (147c1ba..6c40404, PR #8): contracts quote-types.ts by the architect; ONE security-reviewer pass over the
  public quote route + engine: 3 blocking (dark-door gate + fulfillment budget reserve; wholesale delta
  leak via labels; variant overrides dropped) + 4 should-fix + notes → all closed in one corrective round
  (two executors + 2 resumes). build-check GREEN, 817 tests, V6.1 parity 834/834 on production.
- P3 (session 2, 2026-09-17, uncommitted tree → PR): architect wrote and live-proved the migration
  (20260917100000) on production; ONE security-reviewer pass over the write path + routes + coverage:
  verdict BLOCK → 1 blocking (lumaprints_pricing_cache writable/readable by an aal1 admin through
  PostgREST, a pre-existing policy this wave made load-bearing) + 4 should-fix (audit_log INSERT
  forgeable, swatch image_path unconstrained into a CSS url(), admin check route unthrottled on the
  shared key, cookie-bearing script accepts any host) + notes. ALL closed by the architect in
  migration 20260917120000 (aal2 on every pricing-cache verb, no anon, no TRUNCATE; audit_log
  definer-only writes; CHECK on swatch.image_path) + route/script/component edits (rate limit
  'catalog-check' 30/min; quoted + validated CSS url(); https + host allowlist; `*.cookie` ignored;
  zips length guard in 5 routes; cache-tag failures logged). Not closed: duplicate
  (product_id, medium, size_label) unique index — production already holds 5 duplicate groups
  (admin cleanup owed before the index); grant-boundary gate still self-skips without credentials.
  Agents: 3 executors, 1 security-reviewer.
- P4 (session 2): executor D; architect read storefront.ts (allow-list), the door, the cart
  identity; the same security-reviewer pass as P5–P8 covers the storefront payload and the
  print-quote route change.
- P5/P6 (session 2): all architect; examined by the wave security pass: ONE security-reviewer over P4–P8
  (money path, identity, router guard, snapshot immunity, door, payloads, injection, verify integrity,
  migration): verdict BLOCK → 1 blocking (checkout deduped on the client's RAW option ids while
  order_items keys on the server-normalized line hash: two accepted lines could collapse into one
  row) + 2 should-fix (a later provider sync adding a required group or a needs_hex flag could veto a
  paid line; public re-quotes ran outside the provider reserve) + 4 notes. ALL closed by the
  architect: `validateCheckoutCatalog` refuses `duplicate_line` on `variant + server lineHash`
  (the request-level raw-id dedupe stays as the early check); the configurator stores the
  normalized ids read back from the quote's labels; `checkFrozenOptions` ignores groups/options
  first seen after the order's `created_at`; `quoteConfiguredLines` runs under
  `withProviderReserve(PUBLIC_QUOTE_RESERVE)`; the shipping quote caps configured lines at 12; the
  checkout schema refuses a half-configured line and requires `expectedPriceCents` on a configured
  one (F9 is not opt-in). Regression tests: checkout-validation-v3 (same-hash refusal, schema
  refinements) and router-guard (post-purchase group/flag ignored). Answered no-issue: money,
  identity at every other layer, guard bypass, door, payloads, injection, migration ordering.
- P7/P8 (session 2): executors F and G; P7 edited src/lib/email/send.ts and vitest.config.mts
  (`server-only` alias to a test stub) outside its OWNS with reasons; P8 registered the
  retired-symbols gate in build-check and edited HelpIndex.tsx ("N guides" no longer hardcoded).

## Proof

<!-- walks walked (date, device, by whom) · probe records · ledger read after deploy -->
- P1 exit (2026-09-17, production): sync run bf79e8ce completed — 11 chunks, 69 requests, 51 / 225 /
  1,265 rows, 0 tombstoned; dry run 1f4b624a — 62 requests, 0 new / 0 removed / 0 changed; SQL parity:
  all 8 legacy `lumaprints_mediums` rows reproduced as catalog rows with identical ids and provider bounds,
  legacy option sets = catalog defaults on every one; enabled set = [2,11] / [27,2,28] / [39] / [64,74,83,
  94,96,146,148] / [39] on the five live subcategories; live RLS proof (anon 42501 on every write, runs
  unreadable, `has_table_privilege(authenticated, INSERT|UPDATE|DELETE)` false on all four tables);
  V6.1 parity 834/834 (`audit/catalog-verification/V6.1.md`).
- P2 exit (2026-09-17): V6.1 parity 834/834 on production (`audit/catalog-verification/V6.1.md`); V2 sandbox
  sweep 190 requests / 0 x 429 with additivity 12/12 and 25/25 engine glass-ceiling assertions; F35/F36/F37
  recorded (sandbox drops rows at random in long sweeps) — the strict production run is owed to V7.2.

- Session 2 (2026-09-17, commit fe1a802 + follow-ups on PR #11):
  - V6.1 parity on production: 834/834 GREEN at fe1a802 (`audit/catalog-verification/V6.1.md`), 278 of 318 variants in scope.
  - V2 `--strict` sandbox sweep at fe1a802: 8023 assertions, 6717 passed, 282 FAILED, 1024 skipped (F36: 105016/105017/105025/105026 unpriceable on the sandbox); every one of the 282 failures is an F37 per-item silent drop across 6 framed-paper profiles (105011/105015/105019/105020/105023/105024), DIAGNOSIS cause class sandbox-drop; 194 requests, 0 x 429, additivity and glass-ceiling assertions all passed; kept as `V2.strict.{json,md}`. The default-mode run (F37 counted as classified skips) is the step file the report reads; the production host does not drop rows (P1 sync 0 drops, V6.1 parity).
  - V4 sandbox order suite at fe1a802: 49/49 GREEN — one maximal-option order per medium (8 of 8), each
    checkImageConfig 200 → POST /orders 201 → GET /orders echo EXACT (options, size, subcategory); orders
    10000339587–10000339594 on store 82222 (canvas Solid Color #c8102e + wire + matte; framed canvas Oak
    0.875 + backboard wire; paper 9.25×11 No Bleed; framed paper 105005 3in mat + French Blue + Hot Press +
    acrylic + Kraft backing + dry mount at 11×14; foam 12.5×16; metal Glossy Silver + Easel 8×10; peel & stick
    12×12; rolled canvas defaults). 32 requests, 0 × 429. The hex is asserted from the request record (P16).
  - V3 geometry step at fe1a802 (`scripts/write-v3-from-probes.mjs` over a fresh `--no-orders` run of the P0 probe
    matrix, `fixtures/lumaprints/probes.2026-09-17.json`): 16 probes, 14 passed (4 PASS + 10 recorded findings the
    engine is written to: empty option set resolves to Image Wrap / 0.25in bleed and 406s; mats price per size; framed
    paper non-additive; provider enforces group boundaries but not bounds/whitelist/dependency), 0 failed, 2 skipped
    (P6 Solid Color submit and P16 order echo, both order-dependent and both proven by V4: order 10000339587 with
    #c8102e, echo exact). 32 requests, 0 × 429.
  - V7 evidence recorded in `audit/catalog-verification/V7.checklist.json`: V7.1 green (P1 sync + dry run), V7.3 green (0 Live variants below landed cost; two 2% overrides flagged), V7.4 green (0 enabled frame/mat options without a swatch), V7.6 green (invariants pack all 0), V7.7 green (kill-switch drill off/on recorded), V7.5/V7.9/FLAG human, V7.2/V7.8 owed to the post-merge production walk.
  - Live RPC proof of migration 20260917100000 on production (see Examine P3).
  - P4 walk on the preview (de639d5, `margaret-edmondson-git-catalog-p3-13cac5-dotwinholdcos-projects.vercel.app`,
    `PRINT_CONFIGURATOR_FORCE=on` + `CATALOG_READ_HOST=us.api.lumaprints.com`, gate password typed by the owner), desktop,
    2026-09-17 14:15 UTC, by the architect through the browser: /shop/art/the-dual renders the Original / Print toggle;
    Print shows the two live print types (Stretched Canvas from $52.75, Fine Art Paper from $26.37), the size chips with
    default-configuration prices, the canvas border + hardware groups, the true-to-scale preview with "About 6 × 12 in on
    the wall", and a server-quoted price ($52.75 = the legacy price, parity); switching to Fine Art Paper re-priced all
    three sizes from the server ($20.37 / $27.34 / $41.37) and swapped the groups to Bleed Size (No Bleed); Add Print to
    Cart put ONE line in the drawer titled "The Dual — Small — 6 × 12 in" with "Archival Matte Fine Art Paper · No Bleed
    (Image goes to edge of paper)" and the quantity controls keyed by line; /cart lists the same line with its summary and
    the ZIP re-quote (78701) answered through the v3 shipping-quote path for the configured line (shipping included, total
    $20.37, 0 errors); 0 console errors throughout. Not walked on the preview:
    a paid test checkout (Stripe is LIVE on the shared settings; a test-mode window is a separate, scheduled step) and
    the phone breakpoint. Two preview facts fixed on the way: sign-in return address (dd3c1a9) and the catalog read host
    (de639d5). Owner note: the print-clarity banner still says "stretched canvas" for every medium; per-medium copy from
    `lumaprints_subcategories.description` is a follow-up. Blocked bleed/wrap options are hidden rather than shown
    disabled while they are also switched off; they render disabled-with-reason only once enabled (matches ADR-4).

- Merge + production (2026-09-17 14:17 UTC): PR #11 merged as e2b51d0 (CI: build-check step success; the
  dependency-audit step is the pre-existing red on main); Vercel production deploy dpl_DjeF9xQNjcEzzBjn8YNWugq2iCdD
  READY, githubCommitSha = e2b51d0, aliases www.artbyme.studio + artbyme.studio. Post-deploy ledger (Vercel runtime
  errors, 2h): nothing from production; the two groups are preview-only (CSP frame-src for Vercel's toolbar iframe;
  `SITE_AUTH_SECRET` missing on preview → guest cart tokens refused — now set on Vercel preview).
- V7.8 on production: door closed → legacy product page at parity (recorded in V7.checklist.json).
- V7.2 app side on production: five configurations through the admin check, provider called live, cost + shipping
  equal to the stored variant rows to the cent; the dashboard comparison is the person's step (status human).

- P3 exit on production (2026-09-17 14:35 UTC, aal2 admin session, deploy e2b51d0): /admin/catalog renders the full
  tree (sync history, "0 enabled frame/mat options need a swatch", medium and subcategory switches, NEW badges, bounds
  and DPI, groups with defaults, swatch fields); the coverage report (GET /api/admin/variants/coverage): 38 eligible
  products × the 5 live print types → 95 live cells, 4 draft, 81 none, 10 blocked (two products without a ready
  master: no master attached; master not cropped); coverage dry run (POST, dryRun): 190 cells in 19.4 s, WOULD create
  130 draft sizes (framed canvas 54, framed paper 38, foam 38), 208 existing sizes skipped, 202 tiers dropped by bounds
  or DPI, 10 blocked. The real generation is a business call (which print types to sell) and was NOT run.
- Loader defect found during the acceptance walk and fixed in PR #12: the admin/pricing tree read options in
  200-group chunks and PostgREST silently caps a response at 1,000 rows → production served 1,138 of 1,265 options with
  20 empty groups (Mat Color on 105005 among them). Every read now pages; regression test through a truncating fake.

- Admin acceptance walk on production (2026-09-17 14:33 UTC, deploy 79e1e3d, aal2 admin session, through the live
  /admin/catalog UI): expanded the live framed-paper profile 105005, switched the Mat Color option "Smooth Black" ON
  (switch false → true, "Saved" toast) and back OFF (true → false, "Saved"); audit_log holds the two rows
  (`enabled` false → true, true → false, changed_by = the admin), the option is back to `enabled = false`, and the
  subcategory's v2 pricing-cache rows were evicted in the same transactions (0 rows). The PDP half of the walk is the
  door: production is closed (legacy picker), the preview with the door open reflects the tree on the next load.

## Close

<!-- #orchestration BUILD_LOG entry + usage: line from usage-report --write -->
- Session 15e819c2 handoff (2026-09-17): BUILD_LOG `#orchestration` entry carries the printed line
  `usage: agents=8 turns=1592 out_k=2471 cache_read_M=508 architect_share=64% denied=1 sig=cf02fb37`. Status stays `executing`; P3–P9 open.
- Session 33beeda3 (2026-09-17, second session): P3–P8 built, P9 harness built and run, PRs #11 (e2b51d0) and #12
  (79e1e3d) merged and live on production with the door closed; report GO on every automatable step. BUILD_LOG
  `#orchestration` entry carries the printed line
  `usage: agents=9 turns=1443 out_k=1877 cache_read_M=441 architect_share=72% denied=0 sig=3d06ea71`
  (7 executors, 1 security reviewer counted as reviewer, 1 as verifier; 0 refuters; 2 corrective rounds, both by the
  architect). Status stays `executing` for the human gates only: V7.2 dashboard comparison, V7.5 billing address,
  V7.9 real QC order, FLAG flip + per-medium enablement with margin sign-off.
- Same-day owner follow-ups after the close (all merged and live): #15 admin guidance + door state on Print Catalog /
  Print Coverage; #16 + #17 product editor at the admin width, sizes tables measured to fit on production; #18 the
  Settings "Print configurator" switch (the FLAG gate is now the owner's own click; the storefront copy of the gate stays
  Site access). #14 (label tolerance widening) withdrawn by the owner. Handoff written to STATE.md and memory.

- Closed 2026-09-17 (session e37c5a7c): every code unit shipped and live; the remaining items are human gates
  (V7.2, V7.5, V7.9, per-medium margins) tracked in STATE.md and memory, not build units. The owner opened the
  configurator door at 16:06 UTC the same day; the two defects that surfaced (cold price cache → "print partner is
  busy"; renamed slug → 404) are the subject of `2026-09-17-print-quote-resilience.md`.
