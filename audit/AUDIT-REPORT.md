# ArtByME Platform — Full Platform Audit

**Site:** artbyme.studio · **Artist:** Margaret Edmondson
**Stack:** Next.js 16.2.1 (App Router, React 19) · Supabase (Postgres 17) · Stripe · Resend · TipTap · dnd‑kit
**Repo audited:** `/Users/skylarwebber/Margaret-Edmondson` (local) · **Supabase:** `klwkajukicsoiwpsgftt` · **Vercel team:** `dotwinholdcos-projects`
**Date:** 2026‑06‑07 · **Auditor:** Claude (7 parallel deep‑audit agents + DB/live verification)

> **How to read this report.** This is the consolidated, prioritized master audit. Every finding has a stable ID (e.g. `B-1`) that maps to a detailed entry — with `file:line` evidence and a copy‑pasteable fix — in the per‑area files under `audit/findings/`. The companion `audit/OVERNIGHT-PLAN.md` turns all of this into an ordered, executable plan Claude Code can run autonomously.

---

## 1. Methodology & scope

Seven agents audited the platform in parallel, each tracing flows end‑to‑end (UI submit → API route → DB write under RLS → external API → user feedback) and reading the actual source:

- **A — Security & authorization** (`findings/A-security.md`)
- **B — Payments, checkout & fulfillment** (`findings/B-payments.md`)
- **C — Page builder, blog, media, CV/bio** (`findings/C-builder-content.md`)
- **D — Social calendar, scheduling, cron, funnels** (`findings/D-social-cron.md`)
- **E — Email marketing, CRM, integrations** (`findings/E-email-crm-integrations.md`)
- **F — Commissions, classes, courses/LMS, products, workspace, settings, account** (`findings/F-commerce-lms-admin.md`)
- **G — Enterprise code quality, dead code, tests, config, build** (`findings/G-quality-build.md`)

In addition I verified the live Supabase schema, all RLS policies, Postgres functions, storage buckets and the Supabase security/performance advisors directly via MCP, and probed the live site. Per your direction, this is **primarily a platform/dashboard‑functionality audit** — does everything actually work end‑to‑end (payments, page/blog builders, social scheduling, real integrations, admin CRUD with archive/edit/delete) — with the public website scanned for **broken functionality**; purely **aesthetic/design** items are flagged in §9 for us to do together, not fixed by the overnight run.

---

## 2. ⚠️ Correction: two "critical" findings were false positives (Next.js 16 rename)

Three agents (A, E, F) independently reported the single scariest issue — *"there is no `middleware.ts`, so `/admin` is completely unauthenticated and anyone can load the dashboard."* **This is incorrect.** I verified it against the live site and the code:

- The middleware **exists** as **`src/proxy.ts`**. Next.js 16 renamed the middleware entrypoint from `middleware.ts` to `proxy.ts` (the repo's own `AGENTS.md` warns: *"This is NOT the Next.js you know… APIs and file structure may differ"*). The agents searched for `middleware.ts`, didn't find it, and concluded it was missing — a training‑data assumption about an older Next.js.
- `src/proxy.ts` exports `proxy(request)` and a `config.matcher`, and runs **`gateCheck()` → `updateSession()`** on every matched request. `updateSession` (`src/lib/supabase/middleware.ts`) performs the session refresh and the `/admin` + `/account` role‑gated redirects.
- **Live proof:** every route on artbyme.studio — including `/admin` and `/shop` — currently returns the app's custom **password gate** ("This site is private. Enter the password to continue."). That gate is enforced by `proxy.ts`, which proves the middleware is active in production.

**Therefore these are NOT vulnerabilities and must NOT be "fixed":** `A-1`, `A-2`, `A-5`, `A-24` (middleware half), and `F-1`. **Do not add a `src/middleware.ts`** — it would collide with `proxy.ts`. The residual, real point is minor and kept as a Low: admin **pages** rely on the proxy guard rather than re‑checking in each server component; defense‑in‑depth in `(admin)/layout.tsx` is nice‑to‑have, not required (API routes already enforce `requireAdmin()`).

This correction is exactly why the plan in §11 includes a verification gate before each destructive change. Everything else below has been re‑checked against the live schema and stands.

> **Why the tables are empty.** All transactional tables show 0 rows. That is consistent with a **pre‑launch, password‑gated site with no real traffic yet** — not, by itself, proof that writes fail. The write‑failure findings below are proven independently by **RLS‑policy inspection** (anon role cannot satisfy `is_admin_or_artist()`), and remain launch‑blocking.

---

## 3. Verdict

The platform is genuinely large and, in most areas, well‑architected: a unified page editor with revision history, a margin‑protected pricing engine, a real Lumaprints integration, sensible RLS on the vast majority of tables, strong HTTP security headers, `requireAdmin()` on **all 73** admin API routes, rate‑limiting on most public endpoints, and a clean TypeScript build (`tsc --noEmit` passes, `strict: true`). This is not a prototype.

But it is **not yet launch‑ready**, and the gaps cluster in a few decisive places:

1. **The money path does not complete.** The Stripe webhook (and all other webhooks/crons) use the **anon** Supabase client, so under RLS no order, enrollment, booking, or email is ever written. Until this is fixed the site can take a payment and do nothing else. *(This is the headline; it's a 1‑line root cause with several dependent fixes.)*
2. **Background jobs can't even run yet** because the password gate also intercepts `/api/cron/*` and `/api/webhooks/*` (Stripe/Vercel don't send the gate cookie).
3. **A primary requested feature — the social content calendar — does not exist at all** (no table, route, UI, or cron).
4. **The student‑facing LMS is 0% built** (backend ~70% exists; no catalog/player/progress UI).
5. **The blog builder is missing the featured‑image upload you explicitly asked for**, and user‑generated HTML is rendered **without sanitization** (stored‑XSS risk) even though the sanitizer library is already installed.
6. **Commissions are broken** (status update hits a non‑existent `PATCH`; milestones have no RLS policy).

**Counts (after the §2 correction, de‑duplicated across agents):**

| Severity | Count | Examples |
|---|---:|---|
| **Critical** (launch‑blocking) | **9** | anon webhooks/crons (B‑1, E‑1), webhook idempotency (B‑2), unsanitized HTML/XSS (C‑1/C‑2), `handle_new_user` missing (A‑9), commission PATCH 405 (F‑2), commission_milestones no RLS (A‑14/F‑3), gate blocks cron+webhooks (new, §5) |
| **High** | **~34** | refunds never issued (B‑14), Printful never confirmed (B‑15), `items_json` 500‑char truncation (B‑5), client‑trusted shipping (B‑6), PII buckets public (A‑15), Resend webhook unverified (A‑6), blog featured image missing (C‑3), LMS front‑end absent (F‑7), `record_order_for_contact` anon‑callable (A‑7), oversell races (B‑9/B‑10), missing settings (F‑15), social calendar build (D‑1) |
| **Medium** | **~38** | promo single‑use bypass (B‑19/B‑20), funnel metric RPC name wrong (D‑4), error‑message leakage in 63 routes (G), no `maxDuration` on crons (G), no CSP (A‑10), settings stubs (F‑13) |
| **Low** | **~22** | duplicate RLS policies (A‑17), dead `site_content` table (C), v2–v6 dead code (G), rate‑limiter per‑instance (A‑20) |
| **Total unique** | **~103** | (raw agent findings ≈128 before de‑dup/correction) |

With the Critical and High items resolved, the platform reaches end‑to‑end working order; the overnight plan sequences them safely.

---

## 4. Launch‑blocking criticals (fix first, in this order)

These are consolidated and de‑duplicated. Full fixes (with code) are in the referenced files.

### C‑BLOCK‑1 — Webhooks & crons use the anon client → nothing persists *(B‑1, B‑12, E‑1, E‑2, D‑2, D‑3; root for ~15 findings)*
`src/app/api/webhooks/stripe/route.ts:43`, all of `src/app/api/webhooks/{lumaprints,printful,shipstation,resend}/route.ts`, and all four `src/app/api/cron/*/route.ts` call `createClient()` (cookie/anon). In a webhook/cron there are no cookies, so the client is **anon**, and every RLS‑gated write (`orders`, `order_items`, `enrollments`, `class_bookings`, `email_sends`, `email_campaign_recipients`, `meta_events`, `webhook_logs`) is silently denied. **Fix:** use `createServiceClient()` in every webhook and cron handler, and **confirm `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel** (CLAUDE.md says it isn't — this must be verified/added or *every* fix here is moot). Detail: `findings/B-payments.md` §B‑1/B‑12, `findings/E-email-crm-integrations.md` §E‑1/E‑2.

### C‑BLOCK‑2 — The password gate also blocks Stripe & Vercel callbacks *(new — found via live scan)*
`src/proxy.ts:49‑53` matcher intercepts `/api/webhooks/*` and `/api/cron/*`. While `SITE_PASSWORD` is set, Stripe/Vercel requests (which can't present the `site-auth` cookie) are rewritten to `/gate` and the handler never runs. **Fix:** allowlist these path prefixes in `gateCheck()` (add `pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/cron')` to the early‑return in `src/proxy.ts:20‑30`). Without this, even a correct webhook can't fire pre‑launch.

### C‑BLOCK‑3 — No webhook idempotency → duplicate orders/charges on retry *(B‑2)*
`orders.stripe_checkout_session_id` has no UNIQUE constraint and the handler doesn't dedupe on `event.id`. Stripe retries → duplicate orders, double fulfillment, double emails. **Fix:** add UNIQUE on `orders.stripe_checkout_session_id` + `webhook_logs.stripe_event_id` and pre‑check before processing. Detail: `findings/B-payments.md` §B‑2.

### C‑BLOCK‑4 — Stored XSS: user/admin HTML rendered without sanitization *(C‑1, C‑2)*
`isomorphic-dompurify` is installed but **never imported**. ~11 `dangerouslySetInnerHTML` sites render unsanitized HTML, e.g. `src/app/(marketing)/blog/[slug]/page.tsx:160`, `src/components/marketing/PageBodyShell.tsx:47`, `src/components/.../ProductDetail.tsx`, admin `commissions/[id]` and `orders/[id]`. **Fix:** sanitize all rich‑text/HTML on render (and ideally on write) with DOMPurify. Detail: `findings/C-builder-content.md` §C‑1/C‑2 (full site list in its cross‑area note).

### C‑BLOCK‑5 — New signups get no `profiles` row *(A‑9 / A‑24)*
No `handle_new_user` trigger on `auth.users` exists in any migration; `profiles` has no INSERT policy. New users therefore have no profile → `requireAdmin()` 403s, `is_admin_or_artist()` is false, `/account` and LMS FKs break. **Fix:** add the standard `handle_new_user` trigger (SQL in `findings/A-security.md` §A‑9).

### C‑BLOCK‑6 — Commission management is broken *(F‑2, A‑14/F‑3)*
Admin commission status update calls `PATCH /api/commissions` but only `POST` is exported → always **405** (`src/app/(admin)/admin/commissions/[id]/page.tsx:419` vs `src/app/api/commissions/route.ts`). And `commission_milestones` has RLS enabled with **no policy**, so milestone CRUD via the normal client always returns nothing. **Fix:** add the `PATCH` handler (+ convert detail page interactions to a client component) and add an admin RLS policy for `commission_milestones`. Detail: `findings/F-commerce-lms-admin.md` §F‑2, `findings/A-security.md` §A‑14.

### C‑BLOCK‑7 — `audit_log` / `meta_events` / `webhook_logs` unusable *(A‑14)*
RLS enabled, no policies → audit logging silently fails and admins can't read these. **Fix:** add admin‑read policies; writes go through the service client (C‑BLOCK‑1). SQL in `findings/A-security.md` §A‑14.

*(Note: the social content calendar — §7 / `D-1` — and the LMS front‑end — `F-7` — are large missing features rather than security criticals; they are scheduled in the plan's feature phase.)*

---

## 5. Security & RLS (Agent A)

The security posture is **much better than the raw agent counts suggest** once the §2 correction is applied: all admin API routes gate on `requireAdmin()`, the proxy enforces `/admin` + the site gate, HTTP security headers are strong, and most public routes are rate‑limited. Real issues that remain:

**High**
- **A‑6** Resend webhook signature verification is a `TODO` — route accepts unauthenticated POSTs; spoofed bounce/complaint events can corrupt CRM and mass‑unsubscribe. Install `svix`, verify before parsing. `src/app/api/webhooks/resend/route.ts:33`.
- **A‑7** `record_order_for_contact` is `SECURITY DEFINER` and **granted to `anon`** — anyone can inflate promo `usage_count`, burn single‑use codes, and fabricate CRM contacts. Restrict to `service_role`. `supabase/migrations/20260522_crm_anon_rpcs.sql:120`.
- **A‑8** `rls_auto_enable()` (a DDL event‑trigger function) is RPC‑executable by anon/authenticated — revoke EXECUTE.
- **A‑9** Missing `handle_new_user` trigger (see C‑BLOCK‑5).
- **A‑10** No **Content‑Security‑Policy** header (all other headers present). Add CSP (start `Report‑Only`). `next.config.ts:4`.
- **A‑11** No rate limit on `POST /api/checkout` (promo enumeration / Stripe cost abuse).
- **A‑14** Policy‑less RLS tables (see C‑BLOCK‑7).
- **A‑15** **PII exposure:** `commission-references` (customer reference photos/PDFs) and `class-pet-photos` (customer pet photos) are **public, listable** buckets — anyone can enumerate and download them. Make private + serve via signed URLs. `storage.buckets`.
- **A‑4** `GET /api/fulfillment/status/[orderId]` has **no auth** and returns buyer email + tracking for any UUID. Gate it.

**Medium:** A‑12 (no rate limit on `/api/gate` brute‑force), A‑13 (no rate limit on `/api/cart/shipping-quote` → Lumaprints cost amplification), A‑19 (leaked‑password protection disabled in Supabase Auth), A‑23 (ShipStation secret in URL query param → appears in logs), B‑18 (fulfillment submit/retry gated by shared `CRON_SECRET` rather than `requireAdmin()`).

**Low:** A‑16 (`contact_lists` anon‑readable), A‑17 (duplicate RLS policies on `blog_posts`, `artwork_funnels`, audit logs, `site_settings`), A‑18 (`is_admin_or_artist()` anon‑executable — harmless but least‑privilege), A‑20 (in‑memory rate limiter is per‑lambda; move to Upstash before scale), A‑22 (`requireAdmin` called after work in settings route).

A consolidated, idempotent **remediation SQL block** is at the end of `findings/A-security.md` (functions/grants, the four policy‑less tables, PII buckets, `handle_new_user`, dedupe). `site_settings` being world‑readable is **acceptable** — it holds only margin %, shipping zips, and the Stripe‑mode boolean, **no secrets**.

---

## 6. Payments, checkout & fulfillment (Agent B) — 25 findings

This is the most consequential functional area. Beyond C‑BLOCK‑1/2/3:

**High**
- **B‑5** `checkout/route.ts:170` packs line items into Stripe `metadata.items_json`; Stripe caps metadata values at **500 chars**, so 4+ item carts truncate → webhook `JSON.parse` yields `[]` → order created with **no line items**. Store items in the `carts` row instead (and wrap the parse in try/catch).
- **B‑6** Shipping surcharge is **client‑trusted** (`checkout/route.ts:87`); a buyer can POST `shippingSurcharge:0`. Re‑derive server‑side from the cart row.
- **B‑7** `fulfillmentType` falls back to absent client fields, so **originals route to Lumaprints** (which will reject them) instead of `self_ship`. Use server‑fetched `product.fulfillment_type` + `variant.variant_type`.
- **B‑9 / B‑10** Non‑atomic inventory decrement and class‑capacity check → **oversell** of one‑of‑a‑kind originals and classes under concurrency. Use guarded `UPDATE … WHERE inventory_count>0` / a `SELECT … FOR UPDATE` RPC.
- **B‑11** No `checkout.session.expired` handling → abandoned `awaiting_payment` class bookings hold seats forever. Add handler + an expiry cron.
- **B‑14** **Refunds are never issued.** Admin "refunded" only writes a status; `stripe.refunds.create()` appears nowhere. Wire it.
- **B‑15** **Printful orders are never confirmed** — created as Draft, `POST /orders/{id}/confirm` is never called → nothing ships. Add the confirm call. `src/lib/integrations/printful.ts:30`.
- **B‑4** Only `checkout.session.completed` is handled; no `payment_failed`/`refunded`/`dispute` cases → order statuses never reflect reality.
- **B‑3** Full Stripe event (email, address) stored verbatim in `webhook_logs` (PII, no retention). Store a redacted summary + add retention.

**Medium:** B‑8 (webhook N+1 product/variant lookups — batch with `.in()`), B‑13 (free‑course enroll uses anon client), B‑16 (Lumaprints `options` built as `{id:id}` self‑map — likely wrong shape), B‑17 (ShipStation integration has no router case — dead), B‑18 (auth on fulfillment endpoints), B‑19/B‑20 (promo single‑use bypass: redemption only recorded in the delayed webhook, and the `stripe_coupon_id` write uses the anon client so a fresh coupon is minted every checkout), B‑25 (no admin UI to enter tracking for self‑ship items).

**Low:** B‑21 (shipping always collected even for non‑physical), B‑22 (hardcoded canvas cost table drifts from Lumaprints), B‑23 (**two different margin formulas** — `compute.ts` uses gross‑margin `cost/(1‑m)`, `variant-pricing.ts` uses cost‑plus `cost*(1+m)`; prices may be well below target — verify which sets `product_variants.price`), B‑24 (Stripe mode cache not cleared on settings change).

Full code‑level fixes: `findings/B-payments.md`.

---

## 7. Content builders, social calendar, scheduling (Agents C & D)

### Blog builder (C) — High/Critical
- **C‑3 (High, your explicit ask):** the blog cover/featured image is a plain `<input type="url">` — **no upload, no media picker**. `admin/blog/new/page.tsx:116`, `[id]/page.tsx:195`.
- **C‑4 (High):** a real `RichTextEditor` component exists and is used by the page editor but the blog form uses a raw `font-mono` textarea — TipTap is not wired into blog.
- **C‑1/C‑2 (Critical):** unsanitized HTML render (see C‑BLOCK‑4).
- **C‑5:** blog status `<select>` has no `archived` option though the schema/list support it (your archive requirement).
- **No scheduled publishing:** no `publish_at`/`scheduled` status, no cron — all publishes are immediate (C + D).

### Page builder (C) — generally strong, with rough edges
The unified `/admin/pages` editor with section schemas and **revision history + revert** is a highlight. Issues: legacy raw‑HTML "new page" forms coexist with the unified editor and confuse the flow (C‑6); a PATCH response‑shape mismatch means the edit form doesn't refresh after save (C‑7); the generic‑pages adapter is single‑section only, so multi‑section editing isn't extensible without code (C‑11); `media/upload` has no server‑side MIME/size validation (C‑8). The parallel `site_content` table (0 rows) is dead and should be removed (C‑13).

### Media / CV‑bio (C)
Media library upload→register→reuse works; CV PDF export at `/cv.pdf` is implemented (but uncached — hammering risk, C‑14). Dead `AboutEditor.tsx` (about now redirects to the unified editor) should be removed (C‑15).

### Social content calendar (D) — **ENTIRELY ABSENT (your primary ask)**
There is **nothing**: zero matches for `social_post`, `social_account`, `instagram`, `content_calendar` — no table, route, UI, nav link, or cron. `D‑1` in `findings/D-social-cron.md` contains a **full, concrete build spec** the plan adopts: tables `social_accounts` / `social_posts` / `social_post_media` (status enum draft→scheduled→publishing→published→failed, `scheduled_at`, progress/error, links to blog/product), admin‑only RLS + indexes; CRUD + calendar‑feed + status‑transition API routes; a month/week calendar UI with drag‑to‑reschedule (reusing the existing `dnd-kit` dep) and a composer that reuses the media library; and a phased publisher — **Phase 1 "reminder + mark‑as‑posted"** (no OAuth) then **Phase 2 Meta Graph API** for IG/FB. Tokens must be stored encrypted (Supabase Vault), not plaintext.

### Funnels & cron (D)
Funnels are **fully wired** (admin CRUD, 3 templates, public `/art/[slug]`, view tracking) — but **D‑4:** the admin route calls a non‑existent `increment_funnel_views` RPC (the real one is `increment_funnel_metric`) so view counts silently drop, and `add_to_cart`/`purchase` metrics are never tracked. Cron: in addition to C‑BLOCK‑1/2, there's no execution logging (silent failures) and a potential double‑send race in campaign promotion (also E).

---

## 8. Email, CRM, integrations, commerce, LMS, admin (Agents E & F)

### Email & CRM (E)
Architecturally complete (campaign lifecycle, recipient materialization, templates, placeholders, one‑click unsubscribe with HMAC) but **inert in production** until C‑BLOCK‑1 (crons use anon client → **0 emails ever sent**). Also: unsubscribe tokens never expire (E‑4), Resend webhook unverified (A‑6/E‑3), only the `cart_abandon_nurture` automation trigger is implemented (welcome/post‑purchase are TODO, E‑10), and Resend open/click updates match by email without `campaign_id` (cross‑campaign stat pollution, E‑8).

### Integrations — real vs stub (E)
| Integration | Real? | Key gaps |
|---|---|---|
| Stripe | ✅ | webhook anon client + idempotency + refunds (B) |
| Resend | ✅ | webhook signature is a TODO; bounces/complaints not processed |
| Lumaprints | ✅ (most complete) | `options` shape (B‑16); no admin "test" button |
| Printful | ✅ but **broken** | Draft never confirmed (B‑15); no sync UI |
| ShipStation | ✅ lib, **unused** | no router case (B‑17); secret in URL (A‑23) |
| Meta CAPI/Pixel | ✅ | access token in URL param (logged); meta_events anon (C‑BLOCK‑1); pixel not in root layout |
| Anthropic | ✅ | used in shared‑files AI processing; `ANTHROPIC_API_KEY` missing from `.env.example` |

A read‑only "configured?" status block exists in `/admin/settings`, but there are **no test buttons or connect flows**. Recommendation (matches your "actually connect integrations" ask): a proper **Integrations** settings surface with per‑provider status + a "Send test" / "Verify credentials" action.

### Commissions, classes, LMS, products, workspace, account (F)
- **Commissions:** broken (C‑BLOCK‑6); messages read a `commissions.messages` JSON column while the `commission_messages` table is unused and there's no reply UI (F‑4).
- **Products admin:** core CRUD + variant builder + margin editor are solid, but the **list page has no archive/delete button** (the working `DELETE` API is unreachable) (F‑5) — your archive/edit/delete requirement.
- **Promo codes:** no edit/delete, only activate toggle (F‑6).
- **LMS:** backend ~70% (enroll, progress, comments, admin module/lesson CRUD) but **front‑end 0%** — no catalog, course page, lesson player, or progress UI; `/account/classes` 404s (F‑7). Also both progress/enroll routes query a non‑existent `profiles.auth_user_id` column (F‑9).
- **Account:** `/account/wishlist`, `/account/classes`, `/account/settings` are linked but 404; no password/address management (F‑8).
- **Admin settings:** only 3 settings exist; ~20 platform‑essential settings are missing — business/contact info, email from‑name/address, shipping origin + rates, tax, social links, SEO/OG defaults, announcement bar, maintenance mode, currency, order‑notification recipients, integration toggles (F‑15). "Clear All Carts" / "Revalidate Cache" are explicit **placeholder stubs** (F‑13).
- **Classes:** booking flow exists (free + paid) but shares the capacity race (B‑10) and pet‑photo PII bucket (A‑15).

Full CRUD coverage checklist + missing‑settings model: `findings/F-commerce-lms-admin.md`.

---

## 9. Enterprise code quality & build health (Agent G)

**Build:** `tsc --noEmit` **passes**, `strict: true`. `eslint` passes with **47 warnings, 0 errors** (mostly `<img>` vs `next/image`, unused vars, stale `eslint-disable`). `vitest` couldn't run in the Linux sandbox (macOS‑installed `node_modules`; resolves with a clean `npm ci`) — and there is **no CI pipeline at all** (no `.github/`), so the 10 existing tests never run automatically. **Secrets‑in‑git: CLEAR** — `.env*` is gitignored and untracked (verified).

Highest‑value quality items:
- **63 of 101 API routes** bypass the shared `src/lib/api/respond.ts` helper and return raw Supabase error strings → **information disclosure** + inconsistent shapes. Standardize on `apiOk`/`apiError`.
- **No `export const maxDuration`** on cron/long routes → silent Vercel timeouts (campaign send every 2 min, fulfillment). Add per‑route runtime config + an overlap lock on `email-campaigns-send`.
- **No observability** — 100+ `console.error` calls, no Sentry/structured logging on the payment path.
- **Generated types are stale** — `src/lib/types/database.ts` is hand‑written and covers 33/68 tables; regenerate via `supabase gen types`.
- **Dead code** (~4,168 lines): `(marketing)/v2`–`v6` homepage variants (you confirmed these are abandoned), plus `archives/`, `claude-code-build/`, dead `AboutEditor.tsx`, dead `site_content` paths.
- **No `sitemap.ts` / `robots.ts` / default OG image**; 9 public pages export no `metadata`.
- **Dashboard stats strip** is a hand‑maintained array (CLAUDE.md tells you to update counts by hand — already stale at 94 vs 101 routes); compute at runtime.
- **N+1** in `checkout/route.ts` (per‑item product/image fetches) — batch.
- No tests on the 5 highest‑risk paths (Stripe webhook, checkout, fulfillment router, `requireAdmin`, discounts).

---

## 10. Your five requested dimensions — explicit mapping

1. **Enterprise‑ready code (modular, maintainable, secure).** Foundations are strong (typed, `requireAdmin` everywhere, good headers, revision system). Gaps: response/error standardization (63 routes), observability, CI, generated types, dead‑code removal, CSP, `maxDuration`. → Plan **Phase 5**.
2. **Security (RLS, CORS, etc.).** No permissive CORS found. RLS is broadly correct; real fixes: 4 policy‑less tables, anon‑executable SECURITY DEFINER functions, PII buckets, Resend signature, `record_order_for_contact` grant, leaked‑password protection, CSP, `handle_new_user`. The "no middleware/admin exposed" reports were **false positives** (§2). → Plan **Phase 1**.
3. **Incomplete / lacking functionality (down to the submit button).** Covered exhaustively: payments completion, blog featured‑image upload, page multi‑section/image editing, **social content calendar (entirely missing)**, scheduling, LMS front‑end, commissions, archive/edit/delete coverage, integration connect/test, refunds, tracking entry. → Plan **Phases 2–4**.
4. **Embellishments / where it can be better.** Integrations settings hub with test buttons; unified scheduler abstraction; admin order‑item tracking UI; SEO (sitemap/robots/metadata/OG); observability/alerting; webhook PII redaction + retention; pricing‑sync staleness warnings; account self‑service (address book, password). → Plan **Phases 3–5**.
5. **Gap‑analysis of your prompt (what it didn't ask but should have).** See §12.

---

## 11. Live‑site scan (artbyme.studio)

The deployed site is **up and globally gated** behind the custom password wall on every route (intentional pre‑launch state). Confirmed via fetch: `/`, `/admin`, `/shop` all return the gate. This (a) **proves the `proxy.ts` middleware is live** (the §2 correction), and (b) surfaced **C‑BLOCK‑2** (the gate also blocks Stripe/Vercel callbacks).

**What I could not test live, and why:** authenticated admin/storefront walkthroughs require (1) the Claude‑in‑Chrome extension to be connected (it currently isn't) and (2) the site‑gate password + your sign‑in. Per safety practice I won't enter the gate password or your credentials myself. **Broken‑functionality findings on the live storefront/admin are therefore captured via code + DB inspection above**, which is comprehensive for behavior. When you're ready, we can do a guided live pass together (you connect Chrome and unlock the gate) to catch anything runtime‑only and to walk the **aesthetic/design** list below.

---

## 12. Prompt gap‑analysis (what to also consider)

Your brief was thorough. Things it didn't explicitly call out but that matter for a flawless launch:

- **Verify `SUPABASE_SERVICE_ROLE_KEY` (and the `*_TEST` Stripe keys) are actually set in Vercel.** Every webhook/cron fix depends on it; CLAUDE.md says it's not set. This is the first gate in the plan.
- **Reconcile local vs deployed code drift.** The live site behaves like a build that may differ from local `HEAD`; confirm what's deployed before/after the overnight run, and redeploy.
- **Backups / restore + a staging path.** You chose "apply to production." The plan therefore brackets every DB change with a pre‑change snapshot/export and a verification gate, and groups migrations so they're reversible.
- **Legal/compliance:** privacy policy must reflect Meta/Stripe/Resend data sharing; PII buckets (A‑15) and webhook PII (B‑3) have CCPA/GDPR implications; add a data‑deletion path.
- **Accessibility & SEO** aren't in the brief but affect a public art store (alt text, `next/image`, metadata, sitemap).
- **Email deliverability:** SPF/DKIM/DMARC for `artbyme.studio` on Resend; without it, campaigns land in spam.
- **Test coverage as a launch gate** for the money path.
- **Rate‑limiting at scale** (move off the in‑memory limiter before real traffic).
- **"Definition of done" / acceptance tests** per feature so the overnight run can self‑verify (built into the plan).

---

## 13. Aesthetic / design — flagged only (we'll do these together)

Per your instruction, the overnight run will **not** touch visual design. Flagged for our morning pass (to be expanded during the guided live walkthrough): the `eslint` `<img>`‑vs‑`next/image` warnings affect image quality/LCP on `ProductCard`, `ProductDetail`, `AdaptiveArtwork`, and funnel templates; brand‑consistency check of "ArtByME" casing across pages; the 9 public pages missing `metadata`/share images; and any layout/spacing/responsive issues we spot live. I'll keep a running design list as we walk the site.

---

## 14. Appendices (detailed findings)

- `audit/findings/A-security.md` — security & authorization (route auth matrix + consolidated remediation SQL)
- `audit/findings/B-payments.md` — payments, checkout, fulfillment (25 findings, full code)
- `audit/findings/C-builder-content.md` — page/blog/media/CV builders
- `audit/findings/D-social-cron.md` — social calendar build spec, funnels, cron
- `audit/findings/E-email-crm-integrations.md` — email, CRM, integration status table
- `audit/findings/F-commerce-lms-admin.md` — commissions, classes, LMS, products, settings, account
- `audit/findings/G-quality-build.md` — code quality, dead code, build/test, config
- `audit/00-backend-reference.md` — schema, RLS, functions, buckets, env reference

➡️ **Execution plan:** `audit/OVERNIGHT-PLAN.md`
