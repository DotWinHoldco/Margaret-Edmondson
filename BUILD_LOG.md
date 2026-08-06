# BUILD LOG — Margaret-Edmondson

Authored by DotWin

Append-only, greppable history. Newest first. `STATE.md` references entries by tag.

---

<!-- dotwin:log-entries -->

### [2026-08-06T08:20:51.152Z] #build-check
Status: green
Verified: 13/13 required gates
Failing: none


## #launch-night-2026-07-06 — sandbox-verified fulfillment; Mirror Wrap fix; US-only checkout

- **Date:** 2026-07-06
- **Module:** pricing/fulfillment options · subcategory bounds · checkout/cart/shipping-policy · prod data
- **Category:** launch-blocking fix + verification (live LumaPrints sandbox probes)
- **Summary:** Sandbox probes proved implicit `orderItemOptions` resolve to Image Wrap, whose
  +3.75in-per-axis bleed requirement 406s every aspect-exact padded master — no print could ever
  have shipped. Pinned Canvas Border to Mirror Wrap across `wholesale-lookup.ts`, `mediums.ts`,
  the catalog-sync seeds, prod `lumaprints_mediums.option_ids`, and tests (price-neutral,
  verified against /pricing/products). Also closed by probe: externalId dedup (409 — duplicate
  print risk retired), fractional-size submit (201), live bounds/DPI into
  `subcategory-bounds.ts`. Restricted checkout to US (4 code touchpoints + policy copy in tsx and
  `pages.content_html`; KNOWN_RISKS CA entry → MITIGATED). Deleted the stale legacy print draft
  variant. Full evidence: `audit/LAUNCH-VERIFICATION-2026-07-06.md`; runbook:
  `audit/LAUNCH-NIGHT-2026-07-06.md`; owner guide: `docs/product-setup-prints.md`. Native
  `build-check` + commit + push remain human-gated from the Mac.


### [2026-06-22T21:27:12.930Z] #build-check
Status: green
Verified: 11/11 required gates
Failing: none


### [2026-06-22T18:20:14.631Z] #build-check
Status: failed
Verified: 6/11 required gates
Failing: security, supabase-boundaries, authz, rls, docs


## #adopt-domain-cell-2026-06-24 — re-run adopt for the domain-cell conformance system

- **Date:** 2026-06-24
- **Module:** factory rails (scripts/gates) · src/contracts · audit packet · STATE/docs
- **Category:** adopt re-run (domain-cell conformance), behavior-preserving — no app runtime change
- **Summary:** The prior adopt (2026-06-22) certified green before the factory added the
  domain-cell conformance system (Rule 1 / ACID audit, derived `contracts/`, 8 domain-cell gates,
  `mode: adopt` hybrid enforcement). This run adds exactly those missing parts. The earlier
  security/auth/billing/RLS audit was NOT redone; it still stands (`#findings`,
  `#harden-2026-06-22`, `#adopt-green-push-2026-06-22`).
- **Why it matters:** without this, the runner would read no `mode` from
  `.dotwin/conformance.json`, default to `spawn`, and treat the legacy app as if every domain gate
  must block — wrong for a hybrid adopt. The contracts were also absent, so `check-rpc-exists`
  (the keystone that makes the transaction registry honest) had nothing to verify.

### What changed
- **Kit delta imported** (dev scripts only): 9 new gates — `check-{atomicity,domain-isolation,
  event-boundaries,no-duplicate-transactions,read-boundary,rpc-exists,state,table-ownership}.mjs`
  + `lib/cells.mjs`; 6 updated — `build-check.mjs`, `check-docs.mjs`, `check-contract.mjs`,
  `check-anchors.mjs`, `lib/report.mjs`, `check-module-isolation.mjs` (now a thin re-export shim).
  `package.json` gained the `check:*` scripts; `check:modules` → `check:domains`. CI + husky call
  `build-check` generically, so they pick up the new gates with no edit.
- **`src/contracts/`** authored from the real 73-table schema: `domain-map.ts` (17 areas),
  `table-ownership.ts` (table → owner + core/recoverable), `transaction-registry.ts`
  (`record_order_for_contact` declared, touches verified), `event-registry.ts` (implicit flows).
- **`.dotwin/conformance.json`** → `mode: adopt` + `ratchet` (4 scored gates start false). Hybrid:
  always-blocking gates run (rpc-exists ACTIVE + passing; domain-isolation/contract/read-boundary
  skip until cells exist); the data-model gates score until the staged plan ratchets them.
- **ACID register** (`#acid-register-2026-06-24`): Rule 1 audit of the real money paths. 0 P0,
  0 P1. 4 P2 atomicity-of-record gaps (webhook order write, fulfillment finalize, admin course
  delete, AI testimonial) with dated exceptions + staged owner RPCs. Full packet:
  `audit/ADOPT-2026-06-24/`.
- **Regression test** `test/acid-transaction-owners.test.ts`: proves `record_order_for_contact`
  is atomic at runtime (a failed single-use redemption rolls back the contact bump + usage_count).
  Skipped without a disposable test DB (like the existing FIN tests).

### Verified (in-sandbox)
`tsc --noEmit` PASS · `eslint src/contracts` PASS · `check-rpc-exists` PASS (1 declared tx) ·
domain gates skip cleanly · all security gates pass (advisories only). Native `next build` +
`vitest` cannot run in the Linux sandbox (macOS `node_modules`); unchanged from the prior green and
no runtime code changed. GREEN-PENDING native re-cert: `npm run build-check:write`.

### Carried context (resolving tags)
`#proxy-not-middleware`: middleware lives in `src/proxy.ts` (Next 16); never create `middleware.ts`.
`#domain-cell-conformance`: the adopt protocol this run implements (factory
`06-audit-system/domain-cell-conformance-protocol.md`).

## #adopt-green-push-2026-06-22 — clear the standards backlog to first green

- **Date:** 2026-06-22
- **Module:** API routes · Supabase RLS · webhooks · docs
- **Category:** standards conformance (security + documentation), in-place, no rebuild
- **Summary:** After the native `build-check:write` above passed build + test but failed the 5
  standards gates, cleared every blocking finding in place. All sandbox-runnable gates now pass
  (typecheck, lint, secrets, security, supabase-boundaries, authz, rls, migrations, docs). build +
  test stay native; re-run `npm run build-check:write` to certify green + write the baseline.

### What changed
- **security (65 → 0 blocking):** replaced every `select('*')` with the table's explicit column
  list (sourced from prod `information_schema`, behavior-preserving). Typecheck then surfaced one
  latent bug — `commission.messages` is not a column (always undefined under `select('*')`); cast
  to preserve the empty-list behavior and tagged it for a real follow-up. 5 `: any` remain (medium,
  advisory).
- **supabase-boundaries (1 → 0):** the lone critical was a FALSE POSITIVE — `OrderConfirmationPoll.tsx`
  named `SUPABASE_SERVICE_ROLE_KEY` only in a comment. Reworded the comment; no code change.
- **authz (1 high → 0):** shipstation verified a URL `?secret=` and lumaprints/printful verified an
  HMAC via `===`; upgraded all three to `crypto.timingSafeEqual` (constant-time AND the token the
  gate recognizes). Annotated 9 intentional public-write routes (cart, checkout, classes, funnels,
  newsletter, pixel) with `dotwin-allow:public-write` + reason.
- **rls (4 blocking → 0):** new migration `2026062205_adopt_rls_conformance.sql` — enables RLS + the
  4 prod policies on `product_categories` (was RLS-less in git); tightens anon INSERT on `carts` to
  `profile_id is null` (mirrors the existing anon UPDATE policy) and on `unsubscribe_events` to
  `email is not null`; rewrites the `social_posts` admin policy with an explicit `auth.uid()` anchor.
  Idempotent + replay-safe; safe to apply to prod (product_categories already matches; the others
  are behavior-preserving tightenings).
- **docs (177 → 0 blocking):** added an intent doc comment above every API route handler, stating
  what it does and its auth posture (admin / authenticated / public / webhook / cron). 296 non-route
  exported functions/components remain undocumented (medium, advisory, non-blocking).

### Verification (this run, in-sandbox)
- `build-check --tier=pre`: secrets/security/supabase-boundaries/authz/rls/migrations/docs all PASS;
  module-isolation + contract skipped (no `src/modules`); anchors pass.
- `tsc --noEmit`: PASS (0 errors). `eslint .`: PASS (0 errors, 54 pre-existing warnings).
- NOT run here (native/CI): `vitest`, `next build`, full `build-check:write`. The select('*') and
  RLS-policy changes should be re-verified by the native build + test.

### Apply-order / handoff (user, native)
1. Apply migration `2026062205` to prod `klwkajukicsoiwpsgftt`.
2. `git add -A && git commit -m "adopt(margaret-edmondson): clear standards backlog to green" && git push`.
3. `npm run build-check:write` → expect green; writes `.dotwin/conformance.json`.

### Related files / deps
65 route/page files (select columns), `supabase/migrations/2026062205_adopt_rls_conformance.sql`,
`src/app/api/webhooks/{shipstation,lumaprints,printful}/route.ts`, 9 public-write route banners,
~107 route files (intent docs), `src/app/(marketing)/order/[session]/OrderConfirmationPoll.tsx`.

### Search keywords
select explicit columns, timingSafeEqual, product_categories RLS, dotwin-allow public-write,
route intent docs, commission.messages latent, conformance baseline.

### Relevant history
`#adopt-finish-2026-06-22`, `#product-categories-rls-in-git`, `#harden-2026-06-22`, `#findings`.


## #adopt-finish-2026-06-22 — adopt finish: factory rails + drift verify + JS gates

- **Date:** 2026-06-22
- **Module:** tooling/build-check · docs/standards · Supabase RLS (verification) · routing boundaries
- **Category:** standardization / conformance rails / verification
- **Summary:** Completed the adopt for ArtByME after the harden phase shipped. Imported the
  factory executable kit, rule pack, and docs; verified the migration drift read-only; ran the
  in-sandbox JS gates. No app code rebuilt. Scope (user): additive standardization + drift verify.
  Build/test/conformance handed to the native toolchain (sandbox is macOS-arm64; `next build` +
  `vitest` cannot run on Linux).

### What changed (files only; UNCOMMITTED — sandbox cannot write `.git`)
- **Gates:** copied spawn-kit scripts into `scripts/` (build-check.mjs, check-{secrets,security,
  rls,migrations,supabase-boundaries,module-isolation,anchors,docs,authz,contract}.mjs) +
  `scripts/lib/{scan,report,changed}.mjs`. No collisions; `scripts/check-env.mjs` preserved.
- **package.json:** merged `check:*`, `build-check`, `build-check:write`, `build-check:strict`,
  `verify`, `verify:changed`, `check:env`; set `lint` to `eslint .`; added `prepare: husky` +
  `husky` devDependency.
- **Rule pack:** new `RULES.md`; replaced `CLAUDE.md` + `AGENTS.md` with factory versions
  (cleared the stale "ACTIVE BUILD" pointer and AI/prompt references; preserved proxy.ts, ArtByME
  branding, Supabase client policy, artwork-inventory, and stats-strip facts; kept the
  nextjs-agent-rules block).
- **Docs:** `KNOWN_RISKS.md`, `DEPLOYMENT.md`, `SECURITY.md`, `TESTING.md`, `LESSONS.md`,
  `MEMORY_INDEX.md`, `docs/api/README.md`, `docs/technical/README.md`.
- **Boundaries:** `src/app/{error,loading,not-found}.tsx` (COM-7 partial). RLS deny-test
  `test/rls/unauthorized-write.test.ts` (anon insert into orders; guarded by `SUPABASE_TEST_URL`).
- **CI/hooks:** `.github/workflows/ci.yml`, `.husky/pre-commit`.
- **NOT imported (deliberate divergence):** kit `src/kernel` + `src/modules/_example`
  (route-handler architecture, not modular); kit `src/lib/supabase/*` + guards/helpers (project
  has its own). Recorded in `KNOWN_RISKS.md`.

### Migration drift 2026061501-05 (verified read-only on prod)
- All schema objects present on prod (`categories.default_margin_pct`, `product_categories` +
  `sort_order`, `product_variants.updated_at`, `reprice_variants`, `product_images.original_*`);
  `royal` rename applied; `reprice_variants` body uses `(cost + shipping) * (1 + margin)` (the
  2026061502 gross-margin formula).
- The five versions are NOT in the prod migration ledger. Verdict: applied-but-unrecorded, low
  risk (idempotent files in git). Optional ledger repair noted in DEPLOYMENT/KNOWN_RISKS.

### In-sandbox JS gate results (`node scripts/build-check.mjs --tier=pre`)
- PASS: typecheck (tsc, 0 err), lint (eslint, 0 err / 54 warn), secrets, migrations (1 medium:
  no generated types), anchors. SKIP: module-isolation, contract (no `src/modules`).
- FAIL (legacy P2 backlog, NOT regressions from this run): security 65 blocking (mostly
  `select('*')` + some `: any`); authz 1 high (shipstation webhook unmatched by the guard regex)
  + mediums (intentional public writes); rls 4 blocking; docs 177 blocking of 473 (route/action
  intent-doc gap).

### Two gate criticals investigated and proven
- **supabase-boundaries critical on `OrderConfirmationPoll.tsx`: FALSE POSITIVE.** The file is
  `'use client'` but only names `SUPABASE_SERVICE_ROLE_KEY` in a comment (imports are react +
  next/navigation only). No key reaches the browser. Silence with `// dotwin-allow:
  service-in-client` + reason, or reword the comment.
- **rls critical "product_categories created without RLS" (migration 2026061501): PROD IS SAFE.**
  On prod the table has RLS enabled with 4 policies (admin-only INSERT/UPDATE/DELETE via
  `is_admin_or_artist()`; public SELECT). The GIT migration omits the RLS enable + policies, so a
  from-zero replay would be world-writable (anon holds full DML grants). Real schema-in-git /
  reproducibility gap. Tag `#product-categories-rls-in-git`.

### Handoff (user, native toolchain)
1. `git add -A && git commit -m "adopt(margaret-edmondson): factory rails + docs + boundaries" && git push`
2. `npm install` (pulls husky and activates the pre-commit hook).
3. `npm run build-check:write` to certify status + write `.dotwin/conformance.json`.
4. Toward first green: close the docs route-intent gap and the security/rls/authz backlog; add a
   `product_categories` RLS migration; generate `database.types.ts`.

### Related files / deps
`scripts/`, `package.json`, `RULES.md`, `CLAUDE.md`, `AGENTS.md`, the new docs,
`src/app/{error,loading,not-found}.tsx`, `test/rls/unauthorized-write.test.ts`,
`.github/workflows/ci.yml`, `.husky/pre-commit`. Deps: husky (added), @supabase/supabase-js.

### Search keywords
adopt finish, spawn-kit, build-check, gates, conformance baseline, migration drift,
product_categories RLS, schema in git, false-positive service-role, docs route intent, husky.

### Relevant history
`#harden-2026-06-22`, `#findings`, `#migration-drift`.

---

## #harden-2026-06-22 — harden: P0 + 7 P1 (money path + comms + cron auth)

- **Date:** 2026-06-22
- **Module:** Stripe webhooks · fulfillment · crons/authz · Supabase RLS · email/newsletter
- **Category:** security hardening / idempotency / fail-closed authz
- **Summary:** Fixed every release-blocker from the 2026-06-21 adopt audit (1 P0 + 7 P1) in code, with
  one regression test each. DB side delivered as migration files only (user decision) — NOT applied to
  prod this run.

### What changed
- **FIN-1b (P0)** `supabase/migrations/2026062201_orders_payment_intent_unique.sql` — partial
  `UNIQUE(stripe_payment_intent_id) WHERE NOT NULL` so the webhook's existing 23505 guard is reachable
  for the embedded Payment Elements flow.
- **FIN-1 (P1)** `2026062202_order_items_idempotency.sql` + `src/app/api/webhooks/stripe/route.ts` —
  `UNIQUE(order_id,product_id,variant_id) NULLS NOT DISTINCT` + item upsert; one-shot side effects (CRM
  revenue, Meta Purchase, confirmation + owner emails) gated on an atomic flip of new column
  `orders.side_effects_completed_at` (NULL→now). Fulfillment routing stays ungated (idempotent).
- **FIN-2 (P1)** `2026062203_order_items_submitting_state.sql` + `src/lib/fulfillment/router.ts` — added
  `submitting` status; router atomically pre-claims pending/failed items to `submitting` before the
  LumaPrints/Printful call (both batch router and single-item retry). Lost write/retry no longer
  double-submits a real provider order.
- **AZ-1 (P1)** new `src/lib/auth/require-cron.ts` (`requireCron`, timingSafeEqual, 503 when CRON_SECRET
  unset) applied to all 7 `src/app/api/cron/*` routes. (fulfillment/submit+retry and admin/revalidate
  already fail closed — left as-is.)
- **DB-2 (P1)** `2026062204_newsletter_subscribers_admin_read.sql` — dropped
  `"Authenticated can read newsletter_subscribers"`, replaced with `is_admin_or_artist()` SELECT.
- **COM-1 (P1)** `src/lib/email/render.ts` — `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click`
  headers on marketing sends (POST handler already exists at `/api/unsubscribe`).
- **COM-2 (P1)** new `src/lib/email/suppression.ts` (`isSuppressed`) gating renderAndSend +
  abandoned-cart steps 1/2/3 + welcome + post-purchase. Transactional sends unaffected.
- **COM-3 (P1)** `src/lib/email/unsubscribe.ts` — signing secret is `UNSUBSCRIBE_SECRET` only (dropped
  CRON_SECRET/RESEND_API_KEY/hardcoded fallbacks); fail-closed in production; dropped the
  no-timestamp "accept forever" branch. `.env.example` + `scripts/check-env.mjs` updated.
- **Tests:** `test/require-cron.test.ts`, `test/unsubscribe-hardening.test.ts`,
  `test/email-suppression.test.ts`, `test/email-list-unsubscribe.test.ts`,
  `test/order-fulfillment-db-invariants.test.ts` (DB-guarded by `SUPABASE_TEST_URL`).

### Decisions / why it matters
- **Dedicated idempotency column, not a `processing→confirmed` status transition** (the audit's suggested
  mechanism): live `orders_status_check` has no `confirmed` value and `status` is customer-visible, so a
  status transition would violate the constraint / change observable state. Proven by reading the live
  constraint before coding.
- **DB-2 / FIN-1b applied via files only** (user choice). Respects git-discipline: the matching code is
  unpushed (no sandbox GitHub creds), so prod schema must not lead it.
- Prod verified read-only: **0 orders / 0 order_items** → all unique indexes build clean; P0 is latent
  (no live duplicate-order damage yet) but a correct stop-ship before launch.

### Apply-order (for the deploy that the user controls)
1. `2026062201` (FIN-1b) and `2026062204` (DB-2): pure tightenings, safe to apply anytime.
2. `2026062202` (FIN-1) and `2026062203` (FIN-2): **must ship together with the matching code** — the
   webhook writes `side_effects_completed_at` and the router writes `submitting`; applying schema without
   the code (or vice versa) breaks the live path.
3. Set `UNSUBSCRIBE_SECRET` in prod env (COM-3 fail-closed) — `openssl rand -hex 32`.

### Verification (this run)
- typecheck `tsc --noEmit`: PASS (0 errors). lint `eslint .`: PASS (0 errors, 53 pre-existing warnings).
- AZ-1 + COM-3 executed against real source via `node --experimental-strip-types`: 8/8 assertions pass.
- NOT run here (native/CI): `vitest` (5 specs), `next build`, DB constraint/RLS tests, prod migration apply.

### Related files / deps
`src/app/api/webhooks/stripe/route.ts`, `src/lib/fulfillment/router.ts`, `src/lib/auth/require-cron.ts`,
`src/lib/email/{render,suppression,unsubscribe,triggers}.ts`, `src/app/api/cron/*`, `supabase/migrations/2026062201..04`.
Deps: @supabase/supabase-js, stripe, resend, node:crypto.

### Search keywords
idempotency, payment_intent unique, side_effects_completed_at, NULLS NOT DISTINCT, submitting pre-claim,
double-submit, requireCron, timingSafeEqual, fail closed, List-Unsubscribe, RFC 8058, suppression,
UNSUBSCRIBE_SECRET, newsletter RLS, is_admin_or_artist.

### Relevant history
`#findings` (audit register), `#reg-financial`, `#reg-comms`, `#migration-drift`.
