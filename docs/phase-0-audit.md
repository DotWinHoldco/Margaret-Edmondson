# Phase 0 audit

Date: 2026-05-19
Branch baseline: `main`
Phase status: **In progress.** This doc is the deliverable; production code is not modified.

## Executive summary

The site is a Next.js 16 / React 19 / Tailwind v4 storefront on Vercel with a Supabase Postgres backend and a fully wired Lumaprints client. The admin panel is large and live (37 API routes, ~15 builder pages), with consistent auth and RLS but no automated test suite of any kind. To meet BUILD-PROMPT.md's four-gate requirement on Phases 1–5, the repo first needs (a) a `typecheck` npm script, (b) a `test` runner + the first test, and (c) lint cleanup of 7 pre-existing errors. The Lumaprints integration is real, in production, and uses `/api/v1/pricing/shipping` for live quotes; do not rewrite it.

Sign-offs needed before phases ship:

- [ ] **Phase 1** can ship as-is.
- [ ] **Phase 2 (Classes)** needs: chosen email transport (Resend is already wired; confirm); Venmo handle + Zelle email values; cron mechanism (Vercel Cron currently in use for emails/abandoned cart — can reuse); PDF lib (none installed today — `pdf-lib` is already a dep via the testimonial extractor).
- [ ] **Phase 3 (About)** needs: confirmation that the existing `about_split` block + `site_content` table should be replaced by the new `bio_sections` model, or rebuilt alongside it. Recommended: build the new model; migrate content in.
- [ ] **Phase 4 (CV)** needs: confirmation that `/cv` is a new public route (no existing one).
- [ ] **Phase 5 (Variants)** needs: the existing `product_variants` schema diff against the spec — five columns the spec calls for already exist on a different name (`fulfillment_metadata` JSONB carries `size`/`lumaprints_type`; explicit `medium`, `size_label`, `width_in`, `height_in`, `lumaprints_sku`, `lumaprints_cost_cents`, `shipping_cost_cents`, `last_priced_at` do not). Recommendation: extend in place via additive migration; keep `fulfillment_metadata` for back-compat during cutover.

---

## 1. Stack

| Item | Value |
|---|---|
| Framework | Next.js **16.2.1** (App Router) |
| React | **19.2.4** |
| Language | TypeScript (strict via `tsconfig.json`) |
| Package manager | npm (`package-lock.json` present, no yarn/pnpm lock) |
| Node version | Not pinned (no `.nvmrc` or `engines` block) |
| Hosting | Vercel (`vercel.json` minimal, `.vercel/project.json` present) |
| Styling | Tailwind CSS **v4** (`@theme inline` in `globals.css`, no `tailwind.config`) |

`package.json` scripts:

```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"lint": "eslint"
```

**Gap vs BUILD-PROMPT gates:** no `typecheck` or `test` scripts. Both are needed before Phases 1–5 can be gated. Suggested additions:

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest"
```

## 2. Routing

Marketing pages (under `src/app/(marketing)/`):

| Route | File |
|---|---|
| `/` | `page.tsx` (block-driven from `page_blocks`) |
| `/about` | `about/page.tsx` |
| `/account`, `/account/orders` | `account/...` |
| `/art/[slug]` | funnel landing (read from `artwork_funnels`) |
| `/blog`, `/blog/[slug]` | blog |
| `/cart` | cart |
| `/classes`, `/classes/[slug]` | **stub today — Phase 2 rebuild target** |
| `/commissions`, `/commissions/request` | commission flow (form + admin) |
| `/contact` | contact form |
| `/forgot-password`, `/login`, `/signup` | auth |
| `/gallery` | redirect → `/shop` (hidden per recent ask) |
| `/privacy`, `/shipping-policy`, `/tos` | static legal |
| `/shop`, `/shop/[category]`, `/shop/art/[slug]` | shop + detail |
| `/v2`, `/v3` | legacy marketing variants |

There is **no `/cv` route** today. Phase 4 is greenfield.

## 3. Admin panel

Path: `src/app/(admin)/admin/*`. Auth: Supabase Auth + `profiles.role IN ('admin','artist')` enforced via `is_admin_or_artist()` SQL function on RLS + the `requireAdmin()` helper on every admin API route (`src/lib/auth/require-admin.ts`).

Single-tenant. Layout shell: `src/app/(admin)/layout.tsx` renders `AdminSidebar` (sticky left rail, mobile bottom tabs) wrapping all `/admin/*` routes.

**Existing admin builder read end-to-end:** `src/app/(admin)/admin/products/[id]/edit/page.tsx` (1082 lines). Patterns to mirror for every new builder:

- **Client component** (`'use client'`); fetches via `fetch('/api/admin/...')`; persists by PATCH to a matching server route under `src/app/api/admin/...`.
- **Form lib:** plain React state + `<form onChange>` for dirty tracking. No `react-hook-form` in the repo.
- **Validation lib:** `zod` (just adopted; only `products/[id]` PATCH currently uses it via `src/lib/api/respond.ts:parseBody`). Other routes still use ad-hoc checks.
- **Persistence:** Supabase client returned from `requireAdmin()`; never service-role from a route handler.
- **Image upload:** browser → Supabase Storage direct (browser supabase client), then PATCH metadata to server. Pattern in `src/app/(admin)/admin/products/[id]/edit/page.tsx::MasterFooter` and `src/app/api/admin/products/[id]/images/route.ts`.
- **Toasts:** none. Pattern is an inline teal `Saved at H:MM` banner above the form (see `savedAt` state in product edit).
- **Audit log:** `src/lib/api/audit-log.ts` writes per-field rows to `audit_log` — wired only into product PATCH/DELETE so far.
- **Confirm dialogs:** `src/components/admin/ConfirmDialog.tsx` exists; only the product editor's image-delete uses it. Other admin pages still use `window.confirm()`.

Shared response helpers: `apiOk()` / `apiError()` / `parseBody()` in `src/lib/api/respond.ts`. Only the product PATCH uses them; rest of admin still returns ad-hoc shapes.

## 4. Database

| Item | Value |
|---|---|
| Engine | Postgres (Supabase managed, project ref `klwkajukicsoiwpsgftt`) |
| ORM | None — `@supabase/supabase-js` client (PostgREST under the hood) |
| Schema location | Live in Supabase; types mirror in `src/lib/types/database.ts` |
| Migration tool | Supabase CLI; only one migration committed: `supabase/migrations/20260515_margin_protected_pricing.sql` |
| Seed | None at the repo level. Inline scripts under `scripts/` (`home-restructure.mjs`, `backfill-image-dimensions.mjs`, etc.) |
| RLS | Enabled on every public table; admin writes gated by `is_admin_or_artist()`; public selects scoped to `status='published'` / `is_published=true` / etc. Storage policies match. |

`is_admin_or_artist()` body is a `SECURITY DEFINER` function joining `auth.uid()` against `profiles.role IN ('admin', 'artist')`.

## 5. Lumaprints integration

**Working. Do not rewrite.**

| Item | Value |
|---|---|
| Client | `src/lib/integrations/lumaprints.ts` |
| Wholesale lookup helper | `src/lib/pricing/wholesale-lookup.ts` (maps variant.fulfillment_metadata → subcategoryId + options) |
| Shipping quote helper | `src/lib/pricing/shipping-quote.ts` (CONUS worst-case + live by zip) |
| Pricing formula | `src/lib/pricing/compute.ts::computeCustomerPrice({wholesaleCost, shippingCost, marginPct})` |
| Site default margin | `site_settings.default_margin_pct` (0.65 today) |
| Per-product margin override | `products.margin_pct` (nullable) |
| Variant pricing cache | Persisted directly on `product_variants` (`wholesale_cost`, `worst_case_shipping`, `shipping_quoted_at`, `price`). No separate cache table. |
| Endpoints used | `GET /api/v1/stores` (probe), `GET /api/v1/products/categories`, `/products/categories/{id}/subcategories`, `/products/subcategories/{id}/options`, `POST /api/v1/pricing/shipping` |
| Env vars | `LUMAPRINTS_API_KEY`, `LUMAPRINTS_API_SECRET`, `LUMAPRINTS_STORE_ID`, optional `LUMAPRINTS_BASE_URL`, `LUMAPRINTS_WEBHOOK_SECRET` |
| Category taxonomy | Stretched Canvas 1.25" = subcategoryId `101002`; Framed Canvas 1.25" = `102002` (frame style option `27` = 1.25" Black Floating Frame). Other mediums not yet wired. |
| Refresh entry point | `POST /api/admin/pricing/refresh` (admin-only); recomputes all variants. Has `useDefaults` fallback when API keys missing. |
| Test coverage | **None.** |

**Phase 5 contract implications:**

- Spec wants `lumaprints_cost_cents`, `shipping_cost_cents`, `last_priced_at` and a separate `lumaprints_pricing_cache` table. Today's schema stores the same data on the variant row in numeric (not cents) form with `worst_case_shipping` and `shipping_quoted_at`.
- Spec wants per-medium taxonomy; today only canvas + framed canvas are mapped. The other six mediums need a similar mapping before bulk variant creation works.
- Spec's "Three price columns always visible" doesn't exist in the UI today — only the final `price` is rendered to the admin and the public.

## 6. Products / catalog schema

Table: `public.products`. Image join: `product_images` (with `width`, `height`, `print_master_path` columns added recently). Variant table: `product_variants` (`variant_type: 'original' | 'canvas_print' | 'framed_canvas_print' | null`, `fulfillment_metadata` JSONB carrying `size` and `lumaprints_type`). Cross-category support added via `product_categories` junction.

Originals vs prints distinction:

- `products.is_original = true` + a single `product_variants` row with `variant_type='original'` (price = product.base_price post-sync).
- `products.prints_enabled = true` + N variants with `variant_type` in (`canvas_print`, `framed_canvas_print`).

Status enum: `draft | active | archived | sold`.

## 7. Content & CMS

There is no third-party CMS. Page content lives in:

| Source | Use |
|---|---|
| `page_blocks` table | Homepage block sequence (hero, featured_grid, about_preview, categories_showcase, commission_feature, testimonials) with per-block JSON `config` |
| `site_content` table | Global SEO settings + miscellaneous keyed content; not heavily used |
| `testimonials` table | 14 real testimonials seeded; homepage reads `is_featured=true` via the browser supabase client |
| `categories` table | 4 active categories + 1 commission category |
| `blog_posts` table | Blog content (admin builder lives at `/admin/blog/[id]`) |
| `pages` table | Generic CMS pages (admin at `/admin/pages/[id]`) |
| `artwork_funnels` table | Per-product funnel landing pages at `/art/[slug]` |
| `faqs` table | FAQ admin |

Draft/publish: `status='published'` (blog), `is_published=true` (funnels), `is_visible=true` (page_blocks). No revalidation hooks beyond Next's default.

Image hosting: Supabase Storage. Public buckets: `product-images`, `testimonials`. Private: `print-masters`, `shared-files`. Anonymous-INSERT: `commission-references`. Newest WebP assets are 2400px long edge at quality 85.

## 8. Testing infrastructure

**None.** No test runner. No test files. No CI workflow.

This is the single biggest gap relative to BUILD-PROMPT.md's gate requirements. Recommended Phase 1 prerequisite: add `vitest` + `@testing-library/react` + `happy-dom`, a `test/` folder, and a smoke test. This is non-negotiable for Phases 1–5 to gate cleanly.

## 9. Code style

ESLint extends `next/core-web-vitals` and `next/typescript` (via `eslint.config.mjs`). No Prettier config; relies on editor defaults. No pre-commit hooks installed. Path alias `@/*` → `src/*`. Tailwind v4 with `@theme inline` tokens (no `tailwind.config`).

Component library: bespoke. No shadcn/ui, no Mantine, no Radix base. Form primitives are raw `<input>`/`<select>`/`<textarea>` styled with Tailwind. Rich text: `@tiptap/react` (used in notes/feedback/work-requests, **not** in product/blog/page editors which use `<textarea>` + raw HTML).

Lint baseline today: **7 errors, 0 warnings.** Per-file breakdown (current `npx eslint . --quiet` output):

- `src/app/(admin)/admin/email/page.tsx` — `setState-in-effect` x3 (already silenced inline in newer admin files; these missed)
- `src/app/(admin)/admin/faq-testimonials/FaqTestimonialsClient.tsx` — `setState-in-effect` x2
- `src/app/(admin)/admin/settings/SettingsClient.tsx` — `setState-in-effect` x1
- `src/app/(admin)/admin/testimonials/TestimonialsClient.tsx` — `setState-in-effect` x1

All require the same one-line disable comment used elsewhere in this repo. These are not behavior bugs.

## 10. Email / notifications

| Item | Value |
|---|---|
| SDK | `resend` (`RESEND_API_KEY`) |
| Send helper | `src/lib/email/send.ts` (`sendEmail`, `sendOrderConfirmation`, `sendShippingUpdate`, `sendWelcomeSubscriber`) |
| Templates | Inline HTML strings in `send.ts` (no template directory) |
| From address | `process.env.EMAIL_FROM`, today `hello@artbyme.studio` via `mail.playsolo.soccer`... actually `mail.playsolo.soccer` is SOLO; this repo uses Resend's default unless configured otherwise. Confirm in Vercel env. |

Phase 2 will need an `email/templates/classes/` directory and snapshot tests on each template.

## 11. Environment variables

Every `process.env.*` reference in `src/`:

| Var | Required | Public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | needed for signed-URL minting in fulfillment | server |
| `NEXT_PUBLIC_SITE_URL` | yes | yes |
| `NEXT_PUBLIC_SITE_NAME` | optional | yes |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | required for checkout + webhooks | server |
| `LUMAPRINTS_API_KEY`, `LUMAPRINTS_API_SECRET`, `LUMAPRINTS_STORE_ID` | required for fulfillment + pricing | server |
| `LUMAPRINTS_BASE_URL`, `LUMAPRINTS_WEBHOOK_SECRET` | optional / required | server |
| `PRINTFUL_ACCESS_TOKEN`, `PRINTFUL_STORE_ID`, `PRINTFUL_WEBHOOK_SECRET` | currently unused at runtime; webhook handler exists | server |
| `SHIPSTATION_API_KEY`, `SHIPSTATION_BASE_URL`, `SHIPSTATION_WEBHOOK_SECRET` | webhook only; not actively pushing orders to ShipStation today | server |
| `RESEND_API_KEY`, `EMAIL_FROM` | yes for email | server |
| `META_CAPI_ACCESS_TOKEN`, `META_PIXEL_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `META_TEST_EVENT_CODE` | Meta CAPI optional | mixed |
| `SITE_PASSWORD`, `SITE_AUTH_SECRET` | required (site is currently gated) | server |
| `CRON_SECRET` | required for cron routes + fulfillment internal endpoints | server |
| `ANTHROPIC_API_KEY` | required for testimonial AI extraction in admin | server |

Phase 2 will add `MARGARET_VENMO_HANDLE`, `MARGARET_ZELLE_EMAIL`.

## 12. Known issues

Grep for `TODO`/`FIXME`/`XXX`/`HACK` in `src/` returned **zero results.** Clean.

Pre-existing operational concerns surfaced earlier this session:

- 7 lint errors documented under §9 above
- No test infra (§8)
- `src/proxy.ts` is the Next.js middleware (renamed from `middleware.ts`) — the password gate is active in production via `SITE_PASSWORD` + `SITE_AUTH_SECRET`
- `commissions.reference_images` is now wired (Phase 0 ship of commission-references bucket)
- `artwork_funnels` view counter routes through SECURITY DEFINER RPC `increment_funnel_metric`

---

## Phases 1–5 impact map

### Phase 1 — Artwork inventory MD

- **New files:** `docs/artwork-inventory.md` (copy of `claude-code-build/reference/artwork-inventory.md` verbatim), `docs/artwork-inventory-gap-report.md`, `CLAUDE.md` (append section), `test/inventory-validator.test.ts` (after Phase 0 adds test infra).
- **Modified files:** none in `src/`.
- **Owner sign-off:** none — pure documentation phase.

### Phase 2 — Classes page + Classes builder

- **New files:**
  - DB migration creating `class_sessions`, `class_bookings` (with RLS policies mirroring existing pattern)
  - `src/app/(marketing)/classes/page.tsx` (rebuild; today's file is a stub)
  - `src/app/(marketing)/classes/[slug]/page.tsx` (rebuild)
  - `src/app/(marketing)/classes/[slug]/signup/page.tsx` + `thank-you/page.tsx`
  - `src/app/api/classes/[slug]/signup/route.ts` (public POST with rate limit)
  - `src/app/(admin)/admin/classes/...` (replace existing class CRUD; today the admin classes routes exist for `courses`/`course_modules`/`lessons` — different schema)
  - `src/app/api/admin/classes/...` (PATCH/POST/DELETE)
  - `src/app/api/classes/flyer.pdf/route.ts`
  - `src/lib/email/templates/classes/{margaret-notify,payment-instructions,confirmation}.ts`
  - `src/components/marketing/ClassSessionCard.tsx`
- **Modified files:**
  - `src/components/admin/AdminSidebar.tsx` (point existing "Classes" link at the new admin route or rename — depends on owner call below)
  - `src/lib/email/send.ts` to register the three new templates
  - `package.json` to add `qrcode` and `pdf-lib` (`pdf-lib` already a dep)
  - `.env.example` to add `MARGARET_VENMO_HANDLE` and `MARGARET_ZELLE_EMAIL`
- **Owner sign-offs needed:**
  - Coexist with or replace the existing `courses`/`course_modules`/`lessons` admin? Recommend **replace** — the existing one is unused and overlaps.
  - Confirm Venmo handle + Zelle email values.
  - Confirm capacity is per-session (default in spec).
  - Confirm "2-week notice" reminder wording.

### Phase 3 — About / Bio page + Bio builder

- **New files:**
  - DB migration: `bio_sections`, `bio_callouts`, `bio_credentials_block`
  - `src/app/(marketing)/about/page.tsx` (rewrite — today renders a static one-page bio + the `about_split` block)
  - `src/app/(admin)/admin/about/page.tsx` + Sections/Callouts/Credentials tab components
  - `src/app/api/admin/about/...` PATCH routes for each tab
  - `src/lib/markdown.ts` (restricted markdown renderer — paragraphs, br, em, strong, links only)
- **Modified files:**
  - `AdminSidebar.tsx` — replace generic "Pages" or add "About" entry. Recommend adding alongside.
  - The current `about_split` `BlockRenderer` entry can stay; nothing on the homepage depends on `bio_sections`.
- **Owner sign-offs:**
  - Drop the old `about_split` content row once migrated, or keep both? Recommend keep for now, hide via `is_visible=false`.
  - Hero image source: site_settings vs. own column. Spec says column on `bio_credentials_block.hero_image_url`. Recommend per spec.

### Phase 4 — CV page + CV builder

- **New files:**
  - DB migration: `cv_entries`
  - `src/app/(marketing)/cv/page.tsx` (new public route)
  - `src/app/cv.pdf/route.ts` (PDF endpoint)
  - `src/app/(admin)/admin/cv/...` builder
  - `src/app/api/admin/cv/...` API
  - `src/components/marketing/CVEntry.tsx`
- **Modified files:**
  - `AdminSidebar.tsx` — add "CV" entry
  - `src/components/shared/Footer.tsx` — add `/cv` link under About section
- **Owner sign-off:** confirm `is_solo` boolean is genuinely out of scope (no current solo shows).

### Phase 5 — Lumaprints variant builder

- **New files:**
  - DB migration extending `product_variants` with the spec columns; new `lumaprints_pricing_cache` table
  - `src/components/admin/variants/VariantsTab.tsx`, `AddVariantsModal.tsx`, `VariantRow.tsx`
  - `scripts/refresh-lumaprints-prices.ts` (if cron not wired)
  - Many test files
- **Modified files (significant):**
  - `src/lib/pricing/shipping-quote.ts`, `wholesale-lookup.ts` — extend taxonomy beyond canvas 1.25" / framed canvas 1.25" to all 8 mediums in the spec
  - `src/lib/integrations/lumaprints.ts` — add the four read endpoints the spec needs if not present (categories list, sizes-for-medium list)
  - `src/app/api/admin/pricing/refresh/route.ts` — rewrite to drive off cache + diff toast data
  - `src/app/(admin)/admin/products/[id]/edit/page.tsx` — replace inline variant editor with the new tabbed builder
  - `src/components/shop/ProductDetail.tsx` — switch from current variant pricing display to the formal `customerPriceCents` calculator
- **Owner sign-offs needed:**
  - Default product margin: spec says 100% (2× cost), current site default is 65%. Recommend keep 65% as the site-wide default and let per-product override per spec.
  - Cents vs numeric: current schema uses numeric dollars (`price`, `wholesale_cost`, `worst_case_shipping`). Spec uses integer cents. Migrate or adapt? Recommend **adapt** — cents adds breaking-change blast radius; keep numeric, document the unit.
  - Whether to keep `fulfillment_metadata` JSONB as the source of truth for medium/size or migrate every variant to explicit `medium` + `size_label` + dimensions columns. Recommend **migrate** — explicit columns enable the new admin UI cleanly.
  - Stripe checkout already exists and reads `variant.price` directly. After cents migration (if done) or new computed customer price, the checkout server route needs to recompute against the variant on the server.

---

## What needs to happen before Phase 1 ships

1. Add `typecheck` and `test` scripts to `package.json`.
2. Install `vitest` + `@testing-library/react` + `happy-dom`, add `vitest.config.ts`.
3. Silence the 7 outstanding `setState-in-effect` lint errors with the same inline disable comment used elsewhere in this repo.
4. Add a single placeholder smoke test so `npm test` exits 0.
5. Confirm `npm run build` is clean on `main`.

This is the realistic Phase 0 "make gates green" companion work; the audit above is the documentation deliverable.
