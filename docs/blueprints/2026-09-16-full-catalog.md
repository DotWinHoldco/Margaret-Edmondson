# Full LumaPrints Catalog (P0–P9) — Blueprint

Authored by DotWin

Format: v2
Status: executing
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
- Grant boundary: browser roles never write these tables directly; every toggle goes through
  `/api/admin/catalog/*` (requireAdmin aal2) and is audit-logged.
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
| P3 | Admin catalog manager + VariantsTab v2 + offer-coverage generator | executor | admin/catalog page + API, VariantsTab.tsx, bulk-create, scripts/generate-offer-coverage.mjs | RTL + route tests; generator idempotent; coverage report |
| P4 | Storefront configurator + preview (flag) | executor | components/shop/PrintConfigurator*, ProductDetail mount | V6 E2E all 8 mediums on preview, flag OFF in prod |
| P5 | Cart / checkout / order freeze v3 + snapshot-gate sweep + test-mode router guard | executor (architect owns webhook gates) | cart/*, checkout/*, webhooks/stripe/route.ts, quoted-prices.ts | V5 suite green; dual-line order incl. depth-only difference |
| P6 | Fulfillment v2 | executor (architect owns router seam) | fulfillment/router.ts, fulfillability.ts | V4: 8 sandbox orders 201 + echo |
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

## Proof

<!-- walks walked (date, device, by whom) · probe records · ledger read after deploy -->

## Close

<!-- #orchestration BUILD_LOG entry + usage: line from usage-report --write -->
