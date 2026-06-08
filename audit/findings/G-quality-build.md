# Agent G — Enterprise Code Quality, Dead Code, Tests, Config, Build Health

Audited: 2026-06-07  
Repo: `/Users/skylarwebber/Margaret-Edmondson`  
Scope: Build health, secrets-in-git, dead code, modularity, TypeScript, tests, observability, config, SEO, performance.

---

## Severity Summary

| Severity | Count |
|---|---|
| Critical | 0 (secrets NOT in git — clear) |
| High | 5 |
| Medium | 8 |
| Low / Informational | 7 |

---

## Build / Lint / Test Verdict

### Typecheck: PASS
`npm run typecheck` (`tsc --noEmit`) exits 0. Zero type errors. `strict: true` is set in `tsconfig.json`. Clean.

### Lint: PASS (47 warnings, 0 errors)
`npm run lint` exits 0 — no blocking errors. Warnings by category:
- **13 `<img>` instead of `next/image`** — spread across 8 files (AdaptiveArtwork, ProductCard, ProductDetail, BoldShowcaseTemplate, GallerySpotlightTemplate, IntimateJournalTemplate, BookingsTable, AdminSidebar, PixelScript). LCP/bandwidth impact.
- **8 unused-variable warnings** — `ext` in MasterArtworkUpload, `detailImage2` in IntimateJournalTemplate, `useEffect`/`Image`/`priority`/`sizes`/`quality`/`loaded` in AdaptiveArtwork, `options` in supabase/middleware.ts.
- **8 stale `eslint-disable` directives** — `react-hooks/set-state-in-effect` suppressions in MediaPicker (5), RichTextEditor (1), PageEditorClient (1), BookingsTable (1) that suppress a rule that no longer fires; they are dead noise.

### Tests: FAIL (environment error, not test logic)
`npm test` fails at Vitest startup with:
```
Error: Cannot find native binding. Cannot find module '@rolldown/binding-linux-arm64-gnu'
```
Root cause: `node_modules` was installed on macOS (arm64) and the VM runs Linux arm64. This is a cross-platform `node_modules` mismatch — **not a code defect**, but it means CI cannot currently run the test suite in this environment. On the actual CI/CD runner (or after `npm ci` in the VM) this resolves. **There is no CI configuration (no `.github/` directory)**, so this is never actually run automatically.

---

## Findings

---

### G-1: No CI Pipeline
**Severity: High**  
**Type: Build Health / Process**  
**Evidence:** `ls /Users/skylarwebber/Margaret-Edmondson/.github` → directory does not exist. No `.github/workflows/*.yml` found.  
**Impact:** Typecheck, lint, and tests never run automatically on push or PR. Regressions are only caught manually or in production. With 101 API routes and critical payment/fulfillment paths, this is a meaningful operational risk.  
**Fix:** Create `.github/workflows/ci.yml` that runs on push/PR to main:
```yaml
- name: Typecheck
  run: npm run typecheck
- name: Lint
  run: npm run lint
- name: Test
  run: npm test
```
Add a Vercel preview deployment gate as a required status check.

---

### G-2: Tests Cannot Run in VM / No Platform-Native node_modules
**Severity: High**  
**Type: Build Health**  
**Evidence:** `npm test` → `Cannot find module '@rolldown/binding-linux-arm64-gnu'`. The `node_modules` directory was installed on the host OS (macOS) and is committed or synced without re-install on Linux. `rolldown` and `vitest` v4 use platform-native bindings.  
**Impact:** Tests fail in any Linux environment (CI, Docker, Vercel build preview hooks). Without CI, this is dormant but will block any future automation.  
**Fix:** Never commit `node_modules`. Run `npm ci` at the start of every CI job. Add `node_modules/` to `.gitignore` if not already present (it is ignored via default, but ensure the directory was never force-added).

---

### G-3: 63 of 101 API Routes Bypass the Shared `respond.ts` Helper
**Severity: High**  
**Type: Modularity / Consistency**  
**Evidence:**
```
src/lib/api/respond.ts  — exists and is well-designed (apiError, apiOk, parseBody, zod integration)
Total routes: 101
Using respond.ts:  38
NOT using:        63
```
Example ad-hoc patterns found in the 63:
- `return Response.json({ error: error.message }, { status: 500 })` — leaks raw Supabase error messages to clients (PG constraint names, column names, etc.)
- `return Response.json({ error: 'Internal server error' }, { status: 500 })` — inconsistent shape vs `{ error, code, details }`
- `return Response.json({ error: 'Unauthorized' }, { status: 401 })` — missing `code` field that admin UI expects
- Routes found in: `src/app/api/commissions/route.ts:25,53`, `src/app/api/contact/route.ts:21`, `src/app/api/admin/settings/**`, `src/app/api/admin/products/**`, `src/app/api/admin/testimonials/route.ts` (8 instances), and ~55 more.

**Impact:** Inconsistent error shapes break frontend error handling. Raw DB error messages are an information-disclosure risk. Maintenance burden: two error patterns to maintain.  
**Fix:** Migrate all 63 routes to use `apiError()`/`apiOk()` from `@/lib/api/respond`. Grep anchor: `Response.json.*error.*status` in `src/app/api`.

---

### G-4: N+1 Supabase Queries in Checkout and Cron Routes
**Severity: High**  
**Type: Performance**  
**Evidence:**
```
src/app/api/checkout/route.ts:38  — for (const item of items) { await supabase.from('products')... }
src/app/api/checkout/route.ts:77  — for (const item of validatedItems) { await supabase.from('product_images')... }
src/app/api/webhooks/stripe/route.ts:194  — for (const item of items) { await supabase.from('products')... }
src/app/api/cron/abandoned-cart/route.ts:67,75,83  — sequential per-cart email sends in 3 loops
src/app/api/cron/email-campaigns-send/route.ts:51  — sequential per-campaign batch sends
```
**Impact:** Checkout with a 5-item cart fires 10 sequential DB round-trips (5 product lookups + 5 image lookups) before creating the Stripe session. At low cart volume this is fine; at scale (or slow DB) it adds ~50-200ms per item. The cron loops are sequential by design but could time out on Vercel's default 10s function limit.  
**Fix:**
- Checkout: collect all `variantId`s, fetch with `.in('id', variantIds)`, then build a lookup map. Same for images.
- Webhook: same pattern — batch fetch all `lineItem.price.product` IDs at once.
- Cron: these sequential loops are acceptable for rate-limiting email sends, but add `export const maxDuration = 60` (see G-5).

---

### G-5: Long-Running Cron/Fulfillment Routes Missing `maxDuration`
**Severity: High**  
**Type: Config / Reliability**  
**Evidence:**
```bash
grep -rn 'export const maxDuration' src/app/api/ 
# Only found in: src/app/api/admin/shared-files/process-ai/route.ts:13 (maxDuration = 120)
# Missing from all cron routes and fulfillment router
```
- `src/app/api/cron/email-campaigns-send/route.ts` — drains email batches in a loop, no maxDuration
- `src/app/api/cron/abandoned-cart/route.ts` — sequential per-cart email sends, no maxDuration
- `src/app/api/cron/email-automations/route.ts` — no maxDuration
- `src/app/api/cron/meta-event-sync/route.ts` — no maxDuration
- `src/lib/fulfillment/router.ts` (670 lines) — called from fulfillment route, no maxDuration on the caller

Vercel's default function timeout is 10s on Hobby, 60s on Pro. If the fulfillment router or a campaign send iteration exceeds this, it silently times out mid-operation — partial order processing with no error.  
**Fix:** Add to each long-running route:
```ts
export const maxDuration = 60 // or 300 on Pro plan
```
Also add `export const runtime = 'nodejs'` explicitly (these routes use Node APIs; being explicit prevents accidental edge deployment).

---

### G-6: `database.ts` is Hand-Written and Covers Only 33 of 68 Tables
**Severity: Medium**  
**Type: TypeScript / Maintainability**  
**Evidence:**
- `src/lib/types/database.ts` — 646 lines, hand-authored. `grep 'Row:' | wc -l` = 33.
- Shared reference confirms 68 tables in the live Supabase project.
- Missing tables include: `audit_log`, `commission_messages`, `commission_milestones`, `contact_lists`, `contact_list_members`, `crm_contacts`, `email_automation_steps`, `email_campaign_recipients`, `email_sends`, `feedback_audit_log`, `funnel_metric events`, `lesson_comments`, `lesson_progress`, `lumaprints_pricing_cache`, `master_artworks`, `media_library`, `meta_events`, `page_revisions`, `promo_code_redemptions`, `shared_file_tags`, `testimonial_media`, `unsubscribe_events`, `webhook_logs`, `work_request_audit_log`, and more.
- `Views: Record<string, never>` and `Functions: Record<string, never>` — no type coverage for RPCs.

**Impact:** Queries on uncovered tables fall back to `unknown` or `any`, losing type safety. Schema drift between DB and types is invisible to TypeScript. The existing 3 `any` casts (all in email-related routes: `src/app/api/admin/email-campaigns/[id]/send/route.ts:39`, `src/app/api/webhooks/stripe/route.ts:313`, `src/app/api/cron/email-campaigns-send/route.ts:179`) exist specifically because the join result shape isn't typed.  
**Fix:** Generate with Supabase CLI: `supabase gen types typescript --project-id klwkajukicsoiwpsgftt > src/lib/types/database.ts`. Add to a `package.json` script. Re-run after every migration. Delete the hand-written file.

---

### G-7: No Observability — Console-Only Logging, No Error Tracking
**Severity: Medium**  
**Type: Observability**  
**Evidence:**
- `grep -i 'sentry\|datadog\|rollbar\|bugsnag\|pino\|winston'` in `package.json` and `src/` → zero results.
- 103 `console.error/warn/log` calls across 40 API route files. All errors are dropped to Vercel's function log stream with no aggregation, alerting, or retention beyond the Vercel dashboard's rolling window.
- Critical paths (stripe webhook failure, fulfillment router error, email send failure) emit `console.error` only.

**Impact:** Production errors are invisible unless actively tailing Vercel logs. A failed webhook or fulfillment route silently drops the error. No alerting when the payment path breaks.  
**Fix (recommended):**
1. Add `@sentry/nextjs` (free tier covers this scale): `npm install @sentry/nextjs && npx @sentry/wizard@latest -i nextjs`.
2. Instrument `src/app/api/webhooks/stripe/route.ts` and `src/lib/fulfillment/router.ts` first — highest-value paths.
3. At minimum, add a thin `logger.ts` wrapper that writes structured JSON to stdout so Vercel log drains (Datadog, Logtail, etc.) can parse and alert.

---

### G-8: Dead Code — v2–v6 Homepage Variants Are Abandoned Pages (Still Routable)
**Severity: Medium**  
**Type: Dead Code**  
**Evidence:**
```
src/app/(marketing)/v2/page.tsx          — 1,101 lines
src/app/(marketing)/v3/V3HomeClient.tsx  — 1,085 lines
src/app/(marketing)/v4/V4HomeClient.tsx  — 561 lines
src/app/(marketing)/v5/V5HomeClient.tsx  — 647 lines
src/app/(marketing)/v6/V6HomeClient.tsx  — 774 lines
```
Owner confirmed these are abandoned design iterations. They are **not imported** by any production module (grep for `import.*/(v[2-6])/` returns zero results). They ARE referenced as href links in `ProjectHubClient.tsx:97-129` — purely as live preview URLs for client review during the build phase, not as production navigation.  
Total dead code: ~4,168 lines, ~5 route files, actively built into the production Next.js bundle (each gets its own JS chunk), increasing cold start and build time.  
**Fix:** Delete the 5 directories once the client has finished reviewing and selected a homepage design:
```bash
rm -rf src/app/\(marketing\)/v2 src/app/\(marketing\)/v3 src/app/\(marketing\)/v4 src/app/\(marketing\)/v5 src/app/\(marketing\)/v6
```
Also remove the `HOMEPAGE_VARIANTS` array and "Homepage Designs" section from `ProjectHubClient.tsx` at that time.

---

### G-9: Dead Artifacts — `archives/`, `claude-code-build/`, `BUILD-PROMPT.md`, Phase Docs
**Severity: Medium**  
**Type: Dead Code / Hygiene**  
**Evidence:**
```
/archives/           — contains ARTBYME_CLAUDE_CODE_PROMPT.md, ARTBYME_CONTENT_POPULATION_PROMPT.md,
                       ARTBYME_PASTOR_FUNNELS_PROMPT.md, ARTBYME_PRODUCT_PAGE_FIX.md,
                       ARTBYME_PROJECT_PLAN.md, ARTWORK_SWAP_REPORT.md, HOMEPAGE_V7_PROMPT.md
/claude-code-build/  — content/, reference/ subdirectories (build-phase scaffolding)
/BUILD-PROMPT.md     — repo root (build instructions for Claude Code, not product docs)
```
`/tmp/` is empty. `/scripts/` contains a mix: `backfill-image-dimensions.mjs` and `backfill-media-library.mjs` appear to be one-time migration scripts; `refresh-lumaprints-prices.mjs` is described as "nightly" and may be legitimate (though its function is now covered by the cron route).  
**Impact:** No runtime impact, but these bloat the repo, confuse onboarding, and `archives/` contains detailed system prompts that should not be public if the repo is ever opened.  
**Fix:**
- Move `archives/` and `claude-code-build/` out of the repo or add to `.gitignore`.
- Delete `BUILD-PROMPT.md` from the repo root.
- Review `scripts/`: keep `refresh-lumaprints-prices.mjs` (ongoing utility), delete or archive `backfill-*.mjs` and `home-restructure.mjs` (one-offs that have already run).

---

### G-10: Dashboard Stats Strip is a Manually-Maintained Hardcoded Array
**Severity: Medium**  
**Type: Maintainability / Fragility**  
**Evidence:**
```
src/app/(admin)/admin/ProjectHubClient.tsx:1453-1457
{ value: '31', label: 'Public Pages' },
{ value: '36', label: 'Admin Pages' },
{ value: '15', label: 'Sales Funnels' },
{ value: '94', label: 'API Routes' },
{ value: '45k+', label: 'Lines of Code' },
```
`CLAUDE.md` contains explicit instructions to update these counts manually after every significant code push, including shell commands to run. Current values are already stale: actual API route count is 101 (not 94), public pages is 31 (matches), but funnels is live-DB data that can't be known at build time.  
**Impact:** Stats will drift and mislead. The CLAUDE.md instruction will be missed or ignored by future agents and developers.  
**Fix:** Replace the static array with a server-computed `page.tsx` data fetch:
- Public/Admin page counts: compute at build time via `generateStaticParams` or pass from the server page component.
- API Routes: hardcode is fine as a build-time constant (or read from a config).
- Sales Funnels: fetch `COUNT(*)` from `artwork_funnels` in the page's server component and pass as a prop.
- Lines of code: acceptable as a ~periodically-updated build constant; remove the CLAUDE.md manual update instruction.

---

### G-11: Missing `sitemap.ts`, `robots.ts`, and OpenGraph Images
**Severity: Medium**  
**Type: SEO**  
**Evidence:**
```bash
ls src/app/sitemap* src/app/robots* src/app/opengraph-image* → None found
```
9 public marketing pages also lack `metadata` or `generateMetadata` exports:
- `gallery/page.tsx`, `cart/page.tsx`, `commissions/request/page.tsx`
- `signup/page.tsx`, `login/page.tsx`, `forgot-password/page.tsx`
- `account/page.tsx`, `account/orders/page.tsx`, `classes/[slug]/thank-you/page.tsx`

22 of 31 public pages DO export metadata (good); the 9 above are missing it.  
**Impact:** No `sitemap.xml` means search crawlers discover pages only via links. No `robots.ts` means no crawl control. No OG image means social shares show no preview image. Missing metadata on gallery, commissions request, and cart pages hurts SEO and social sharing for key conversion pages.  
**Fix:**
1. Create `src/app/sitemap.ts` — dynamic, fetches published products/blog posts from Supabase.
2. Create `src/app/robots.ts` — disallow `/admin`, `/api`, `/account`; allow everything else.
3. Create `src/app/opengraph-image.tsx` — default OG image using artist name and a hero image.
4. Add `export const metadata: Metadata = { title: '...', description: '...' }` to the 9 pages listed above.

---

### G-12: `<img>` Used Instead of `next/image` in 8 Production Files
**Severity: Medium**  
**Type: Performance / Lint**  
**Evidence:** 13 lint warnings across:
- `src/components/shared/AdaptiveArtwork.tsx:131,157,241` (3 instances — core artwork display component)
- `src/components/shop/ProductCard.tsx:74` — shop listing thumbnail
- `src/components/shop/ProductDetail.tsx:124,265` — product detail
- `src/components/funnels/BoldShowcaseTemplate.tsx:388`
- `src/components/funnels/GallerySpotlightTemplate.tsx:236`
- `src/components/funnels/IntimateJournalTemplate.tsx:255`
- `src/components/admin/BookingsTable.tsx:78`
- `src/components/admin/AdminSidebar.tsx:252`
- `src/components/marketing/PixelScript.tsx:43` (tracking pixel — intentional raw img for Meta CAPI, acceptable)

**Impact:** `AdaptiveArtwork` is the highest-impact miss — it renders artwork images sitewide with no automatic WebP conversion, resizing, or lazy loading. `ProductCard` and `ProductDetail` are direct LCP/CLS contributors on the shop.  
**Fix:** Replace with `<Image>` from `next/image` in `AdaptiveArtwork`, `ProductCard`, and `ProductDetail` first. The `PixelScript.tsx` `<img>` is a Meta tracking pixel — add `// eslint-disable-next-line @next/next/no-img-element` with a comment explaining it's intentional. Funnel templates can follow; admin components are lower priority.

---

### G-13: `tsconfig.json` Lacks `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
**Severity: Low**  
**Type: TypeScript**  
**Evidence:**
```json
// tsconfig.json — strict: true is set, but enterprise-grade additions missing:
// noUncheckedIndexedAccess — array/object index access returns T | undefined
// exactOptionalPropertyTypes — { a?: string } vs { a?: string | undefined }
```
`strict: true` covers: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`. The 3 `any` casts and some of the typing gaps in join results would be caught sooner with stricter index access.  
**Fix:** Add to `tsconfig.json` compilerOptions:
```json
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true
```
Then fix resulting errors (likely 20-50, mostly array access patterns). This is a one-time migration.

---

### G-14: `secrets/` Verdict — NOT Tracked in Git (CLEAR)
**Severity: N/A**  
**Type: Security Verification**  
**Evidence:**
```bash
git ls-files | grep -E '\.env'  → (empty, exit 1)
.gitignore line 33: .env*       → all .env files globally ignored
```
The repo root contains `.env.local`, `.env.luma`, `.env.lumaprints`, `.env.preview` — all are untracked. `git log --oneline -5` shows no commit that would have staged them. `.env.example` is the only tracked env file and contains no real secrets (only key names with placeholder values). **No secrets are tracked in git.**  

Note: `.env.example` is missing `STRIPE_SECRET_KEY_TEST` and `STRIPE_WEBHOOK_SECRET_TEST` — these are read by `src/lib/stripe/index.ts` in test mode but not documented. This is a developer-experience gap (confirmed critical finding from the reference doc, tracked there as the missing-test-vars issue).

---

### G-15: `adhere` Dependency Pins Use `^` — Supply-Chain Note
**Severity: Low**  
**Type: Config / Security**  
**Evidence:** All `package.json` dependencies use `^` (caret) semver ranges:
```
"stripe": "^21.0.1"
"@supabase/ssr": "^0.10.0"
"next": "16.2.1"   ← pinned (good, Next is pinned exactly)
"framer-motion": "^12.38.0"
"zod": "^4.4.3"
```
`next` itself is pinned exactly (good practice). However, `stripe`, `@supabase/ssr`, `framer-motion`, `@anthropic-ai/sdk`, and `resend` are all caret-pinned — minor/patch updates install automatically on `npm ci`.  
**Impact:** Low risk given `package-lock.json` is present (locks to exact installed versions). The lock file protects `npm ci`. Risk exists only if `package-lock.json` is deleted and `npm install` is re-run — possible during major upgrades.  
**Fix:** No immediate action required. Consider switching payment-critical packages (`stripe`) to exact pinning: `"stripe": "21.0.1"`. Run `npm audit` regularly (no audit step in CI currently).

---

### G-16: Stale `eslint-disable` Directives (8 Occurrences)
**Severity: Low**  
**Type: Code Quality**  
**Evidence:** 8 `// eslint-disable-next-line react-hooks/set-state-in-effect` comments in:
- `src/components/admin/MediaPicker.tsx:54,62,78,80,82`
- `src/components/admin/RichTextEditor.tsx:69`
- `src/components/admin/page-editor/PageEditorClient.tsx:63`
- `src/components/admin/BookingsTable.tsx:76`

ESLint reports all 8 as "Unused eslint-disable directive (no problems were reported)" — the rule either no longer exists in the installed config or the code was refactored. The directives are dead noise.  
**Fix:** Run `npm run lint -- --fix` to auto-remove unused disable directives, or delete them manually.

---

### G-17: `framer-motion` Imported in 24 Files — Bundle Size Note
**Severity: Low**  
**Type: Performance**  
**Evidence:**
```bash
grep -rl "from 'framer-motion'" src/ | wc -l  → 24 files
grep -c "from 'framer-motion'" src/ → 32 imports
```
`framer-motion` v12 is ~100KB gzipped. It is used extensively across marketing pages, funnel templates, and admin pages. The library is not tree-shaken at the import level — `import { motion, AnimatePresence }` still pulls a significant chunk.  
**Impact:** At 24 files, framer-motion is load-bearing for UX. The concern is not removal but ensuring it's not imported in server components (which would bundle it into the server payload). Current usage appears to be in `'use client'` files, which is correct.  
**Fix:** Audit that zero framer-motion imports appear in server components. Consider `LazyMotion` + `domAnimation` feature bundle for lower-traffic pages to reduce the animation chunk by ~30%.

---

## Dead Code Removal List

| Path | Lines | Safe to Delete? | Notes |
|---|---|---|---|
| `src/app/(marketing)/v2/` | 1,101 | YES (after client approval) | No production imports; linked as preview only |
| `src/app/(marketing)/v3/` | 1,085 | YES (after client approval) | Same |
| `src/app/(marketing)/v4/` | 561 | YES (after client approval) | Same |
| `src/app/(marketing)/v5/` | 647 | YES (after client approval) | Same |
| `src/app/(marketing)/v6/` | 774 | YES (after client approval) | Same |
| `archives/` (7 .md files) | ~1,500 | YES | Build-phase prompts, not product docs |
| `claude-code-build/` | unknown | YES | Scaffolding directory |
| `BUILD-PROMPT.md` | ~200 | YES | Build instructions, not product |
| `scripts/backfill-image-dimensions.mjs` | ~60 | YES (if backfill ran) | One-time migration |
| `scripts/backfill-media-library.mjs` | ~60 | YES (if backfill ran) | One-time migration |
| `scripts/home-restructure.mjs` | ~50 | YES | One-time |
| `scripts/upload-hero.mjs` | ~40 | YES (if run) | One-time |
| `scripts/upload-bio-photos.mjs` | ~40 | YES (if run) | One-time |

**Keep:** `scripts/refresh-lumaprints-prices.mjs` (nightly utility), `scripts/discover-lumaprints-catalog.mjs` (catalog refresh), `scripts/generate-test-files.mjs` (test support).

**v2–v6 note:** The `HOMEPAGE_VARIANTS` array in `ProjectHubClient.tsx` (lines 87-137) and the "Homepage Designs" section (lines 1192-1250) should also be deleted when the variants are removed. The stats strip hardcoded values at line 1453-1457 should be replaced per G-10.

---

## Test Coverage Map

| Critical Path | Test Exists | Test Quality |
|---|---|---|
| Variant pricing logic | YES (`test/variant-pricing.test.ts`) | Good — 12 cases |
| Email placeholder substitution | YES (`test/placeholders.test.ts`) | Basic — 3 cases |
| Unsubscribe token sign/verify | YES (`test/unsubscribe-token.test.ts`) | Good |
| Page editor revisions | YES (`test/page-editor-revisions.test.ts`) | Good — mocked Supabase |
| Page editor schema types | YES (`test/page-editor-schema.test.ts`) | Type-level only |
| CV sort/compare logic | YES (`test/cv.test.ts`) | Good |
| Markdown rendering | YES (`test/markdown.test.ts`) | Basic |
| Classes public API contract | YES (`test/classes.test.ts`) | Stub/comment-only ("no DB") |
| Inventory validation | YES (`test/inventory-validator.test.ts`) | Good |
| Stripe webhook handler | **NO** | **CRITICAL GAP** |
| Checkout session creation | **NO** | **HIGH GAP** |
| Fulfillment router | **NO** | **HIGH GAP** |
| Email campaign send | **NO** | **HIGH GAP** |
| `requireAdmin()` auth guard | **NO** | **HIGH GAP** |
| Discount/promo code validation | **NO** | Medium gap |
| Commission submission | **NO** | Medium gap |
| RLS / authz (integration) | **NO** | Medium gap |

### Recommended Tests to Add (Highest ROI)

1. **Stripe webhook handler** (`test/stripe-webhook.test.ts`) — mock `stripe.webhooks.constructEventAsync`, verify `payment_intent.succeeded` writes correct records, verify `createServiceClient` is used (not `createClient`), verify idempotency on duplicate event IDs. This directly validates the critical bug from finding A-2.

2. **`requireAdmin()` guard** (`test/require-admin.test.ts`) — verify 401 when no session, 403 when role is 'customer', 200 when role is 'admin' or 'artist'. Mock Supabase auth.

3. **Checkout route** (`test/checkout.test.ts`) — verify inventory validation blocks oversell, verify variant ID lookup is batched (no N+1), verify correct Stripe session params.

4. **Fulfillment router** (`test/fulfillment-router.test.ts`) — verify Lumaprints vs Printful routing by `fulfillment_type`, verify `createServiceClient` is used, verify error on missing master artwork.

5. **Promo code validation** (`test/promo-code.test.ts`) — verify expired codes rejected, verify usage-limit enforcement, verify percentage calculation.

---

## Config Notes

### `next.config.ts`
- Security headers are well-configured (HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, COOP, CORP). 
- **Missing: Content-Security-Policy.** Without CSP, XSS attacks can exfiltrate data, load arbitrary scripts, or hijack the admin session. This is the most impactful missing header. Add a strict CSP allowing `script-src 'self'`, the Stripe JS CDN, and the Meta pixel domain.
- `images.remotePatterns` is correctly scoped to `*.supabase.co/storage/v1/object/public/**`. The private buckets (`print-masters`, `shared-files`) use signed URLs, not `next/image` — correct.

### `vercel.json`
- Contains only `crons`. No `functions` config.
- **Missing `maxDuration` on cron routes** (see G-5). Vercel Pro allows up to 300s; cron jobs need this configured or risk silent timeout mid-send.
- `email-campaigns-send` runs every 2 minutes. If a send batch takes >10s (the Hobby default), consecutive invocations can overlap. The route should have `maxDuration = 60` AND implement a lock/lease (e.g., update `campaigns.status = 'sending'` before processing) to prevent double-send on overlap.

### `eslint.config.mjs`
- Uses `eslint-config-next/core-web-vitals` + `typescript` — good baseline.
- No custom rules for: no-console in production, no-floating-promises, import/no-cycle.
- Consider adding `no-console` as a warning in `src/app/api/**` to encourage the logger migration (G-7).

---

## Cross-Area Notes

- **G-3 + Agent B/C**: The 63 routes using ad-hoc `Response.json({ error: error.message })` leak Supabase/Postgres error messages (constraint names, column names) to clients. This is both a modularity issue (G-3) and a security/information-disclosure issue that agent B should reference.

- **G-4 + Agent C**: The N+1 in `src/app/api/checkout/route.ts:38-77` is in the checkout critical path — batching the variant and image queries is a prerequisite for checkout to perform reliably at scale.

- **G-5 + Agent C/E**: Missing `maxDuration` on `email-campaigns-send` and `abandoned-cart` cron routes means these can silently time out, causing half-processed email batches or missing cart recovery emails.

- **G-8 (v2-v6)**: These 5 routes add ~4,168 lines and 5 additional JS chunks to the production Next.js build. Removing them will measurably reduce build time and cold start size.

- **G-10 (stats strip)**: The CLAUDE.md manual-maintenance instruction is an anti-pattern that will produce stale data as the codebase evolves. Compute at runtime.
