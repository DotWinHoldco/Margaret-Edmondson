# ArtByME Platform — Shared Backend Reference (for audit agents)

Platform: **ArtByME** (artist Margaret Edmondson). Art e‑commerce + print‑on‑demand + LMS (courses/classes) + CMS (page/blog builder) + email marketing + CRM + commissions.

Stack: **Next.js 16.2.1 (App Router, React 19)**, Supabase (Postgres 17, `@supabase/ssr`), Stripe (`stripe` v21), Resend, TipTap, dnd‑kit, zod, isomorphic‑dompurify, Anthropic SDK. Deployed on Vercel (team `dotwinholdcos-projects`). Supabase project `klwkajukicsoiwpsgftt` (MargaretEdmondson, us‑east‑1).

Repo paths:
- Read/Write/Edit/Grep/Glob (host): `/Users/skylarwebber/Margaret-Edmondson`
- bash (VM): `/sessions/practical-cool-hypatia/mnt/Margaret-Edmondson`
- Write findings to (host): `/Users/skylarwebber/Library/Application Support/Claude/local-agent-mode-sessions/8a3ddad5-084a-4193-852c-2bfa3c24ef3b/92c2141c-0915-4f1f-8a31-3cbf2ce1bfc0/local_b191b0a9-07bb-48b8-80d7-d63c6f56e199/outputs/audit/findings/<area>.md`

## Architecture facts
- **No Supabase Edge Functions.** ALL backend logic lives in Next.js API routes (`src/app/api/**/route.ts`, ~100 routes) and Postgres RPCs.
- Auth gate for admin = Postgres function `is_admin_or_artist()` (checks `profiles.role in ('admin','artist')`), used in nearly all admin RLS policies.
- API admin routes use `requireAdmin()` (`src/lib/auth/require-admin.ts`) → 401/403, reuses authed client so RLS sees identity.
- Supabase clients (`src/lib/supabase/server.ts`): `createClient()` = cookie/anon SSR client; `createServiceClient()` = service‑role key client. CLAUDE.md says `SUPABASE_SERVICE_ROLE_KEY` is "not set in Vercel" and service client should only be used in webhooks/cron — VERIFY whether it is actually set, because fulfillment/router.ts uses it.
- Cron via `vercel.json`: `/api/cron/abandoned-cart` (*/15), `/api/cron/email-automations` (*/30), `/api/cron/email-campaigns-send` (*/2), `/api/cron/meta-event-sync` (*/5).
- Route groups: `src/app/(admin)/admin/**`, `src/app/(marketing)/**`, `src/app/api/**`.

## CONFIRMED CRITICAL FINDINGS (already verified — build on these, don't re‑derive)
1. **No root `middleware.ts`.** Only `src/lib/supabase/middleware.ts` (`updateSession`) exists; nothing imports/exports it as Next middleware. Therefore: edge session refresh never runs; the `/admin` and `/account` redirect guards in `updateSession` never run; root `?code=` magic‑link redirect never runs. Page‑level protection now depends entirely on `(admin)/admin/layout.tsx` (VERIFY it guards) and API routes' `requireAdmin`.
2. **Stripe webhook writes with the anon client.** `src/app/api/webhooks/stripe/route.ts:43` `const supabase = await createClient()` (no cookies in a webhook → anon). It then INSERTs into `orders`/`order_items`/`webhook_logs`, UPDATEs `carts`/`product_variants`/`class_bookings`, INSERTs `enrollments` — all gated by `is_admin_or_artist()` or no‑policy RLS → **all denied**. Result: paid orders never recorded, no fulfillment, no confirmation emails. Corroborated: `orders`, `order_items`, `webhook_logs`, `class_bookings`, `enrollments` all have 0 rows. Fix = use `createServiceClient()` in webhook (and ensure SERVICE_ROLE_KEY is set in Vercel). Add idempotency (dedupe on `event.id`) and handle more event types (payment_failed, refund, dispute).
3. Site is in **Stripe test mode** (`site_settings.stripe_test_mode = true`).
4. `.env.example` is missing the test‑mode Stripe vars the code reads: `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET_TEST` (see `src/lib/stripe/index.ts`).

## RLS / security advisor summary (from Supabase linters)
- **RLS enabled, NO policy** (so only service role can touch): `audit_log`, `commission_milestones`, `meta_events`, `webhook_logs`. NOTE `commission_milestones` having no policy means admins can't read/write milestones via the normal client → commissions milestone feature is broken unless it uses service role.
- **Permissive `WITH CHECK (true)` INSERT policies** (anon can insert freely): `carts` (Users can create cart), `class_bookings` (Public can submit bookings), `commissions` (Public can submit commissions), `newsletter_subscribers` (Anyone can subscribe). Public‑submit ones are intentional but need rate limiting / spam protection (no captcha/throttle observed). `carts` insert‑true is fine for guest carts.
- **Public storage buckets with broad SELECT (listable)**: `about-images`, `class-pet-photos` (customer pet photos — PII), `commission-references` (customer‑uploaded reference photos/PDFs — PII), `library`, `product-images`, `testimonials`. Listing should be removed (or buckets made private + signed URLs). `commission-references` and `class-pet-photos` are privacy‑sensitive and should likely be private with signed URLs.
- **SECURITY DEFINER functions executable by anon/authenticated**: `is_admin_or_artist()` (harmless but lock to authenticated), `rls_auto_enable()` (event‑trigger fn; revoke EXECUTE — should not be RPC‑callable), `record_order_for_contact()` (anon can fabricate CRM contacts + inflate promo usage → restrict to service_role), `subscribe_to_newsletter()`, `track_cart()`, `upsert_contact_to_list()`, `mark_contact_unsubscribed()`, `validate_promo_code_public()`, `increment_funnel_metric()`. Public‑facing RPCs are intentional but review each for abuse + add rate limiting.
- **Auth: leaked‑password protection disabled** (enable HaveIBeenPwned check).
- **Duplicate/redundant policies** (cleanup): `blog_posts` (two identical "Public can read published"), `artwork_funnels` (two identical "Public read published funnels"), `feedback_audit_log` (dup insert), `work_request_audit_log` (dup insert), `site_settings` (overlapping service_role + admin + public‑read‑true policies).
- `site_settings` is world‑readable (`USING true`) but contains only `default_margin_pct`, `shipping_quote_zips`, `stripe_test_mode` — **no secrets**, so OK. Pricing margin being public is a minor business‑info leak.
- `contact_lists` readable by `anon` (`Anon read contact_lists USING true`) — exposes list names/slugs; review.
- `profiles` has only SELECT/UPDATE own; **no INSERT policy** → profile rows must be created by an `auth.users` trigger. No such trigger found in `auth`/`public` trigger scan — VERIFY a `handle_new_user`/profile‑provisioning mechanism exists, else new signups have no profile (and thus no role, breaking admin checks and `/account`).

## Postgres functions (public)
SECURITY DEFINER: increment_funnel_metric, is_admin_or_artist, mark_contact_unsubscribed, record_order_for_contact, rls_auto_enable, subscribe_to_newsletter, track_cart, upsert_contact_to_list, validate_promo_code_public.
Non‑secdef triggers: crm_contacts_touch_updated_at, trim_page_revisions.
Triggers: *_touch (updated_at) on contact_lists, crm_contacts, email_automations, email_campaigns, promo_codes; page_revisions_trim AFTER INSERT on page_revisions.

## Storage buckets
public: about-images, class-pet-photos, commission-references, library, product-images, testimonials.
private: print-masters (500MB, tiff/pdf — print originals), shared-files.

## Tables (68) with row counts (snapshot)
profiles(1), addresses(0), categories(0), products(37), product_images(61), product_variants(585), orders(0), order_items(0), commissions(0), commission_messages(0), commission_milestones(0), courses(0), course_modules(0), lessons(0), enrollments(0), lesson_progress(0), lesson_comments(0), blog_posts(10), pages(5), testimonials(13), faqs(0), newsletter_subscribers(1), promo_codes(1), wishlist_items(0), webhook_logs(0), site_content(0), page_blocks(6), change_requests(0), email_templates(0), email_campaigns(0), email_automations(1), email_automation_steps(1), email_sends(0), carts(2), meta_events(0), audit_log(0), feedback_items(0), feedback_comments(0), work_requests(0), work_request_comments(0), project_notes(0), project_note_comments(0), artwork_funnels(0), feedback_audit_log(0), work_request_audit_log(0), testimonial_media(0), shared_files(1), shared_file_tags(0), site_settings(1), product_categories(38), class_sessions(23), class_bookings(0), bio_sections(5), bio_callouts(7), bio_credentials_block(1), cv_entries(16), cv_settings(1), lumaprints_pricing_cache(16), media_library(84), lumaprints_mediums(8), page_revisions(9), crm_contacts(1), contact_lists(5), contact_list_members(2), promo_code_redemptions(0), unsubscribe_events(0), email_campaign_recipients(0), master_artworks(0).

NOTE on "appropriately partitioned": no tables are partitioned and `pg_partman` is available but not installed. At current scale partitioning is unnecessary/premature; only high‑churn append tables (email_sends, meta_events, webhook_logs, audit_log, funnel metric events) would warrant time‑partitioning at scale. Treat as future‑scaling note, not a defect, unless you find unbounded‑growth tables with no retention.

## Env vars (.env.example)
App: NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SITE_NAME. Supabase: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. Stripe: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (MISSING the *_TEST variants the code uses). Lumaprints: LUMAPRINTS_API_KEY/SECRET/BASE_URL/STORE_ID/WEBHOOK_SECRET. Printful: PRINTFUL_ACCESS_TOKEN/STORE_ID/WEBHOOK_SECRET. ShipStation: SHIPSTATION_API_KEY/BASE_URL/WEBHOOK_SECRET. Resend: RESEND_API_KEY, EMAIL_FROM, RESEND_WEBHOOK_SECRET, UNSUBSCRIBE_SECRET. Meta: NEXT_PUBLIC_META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, META_TEST_EVENT_CODE. Google OAuth (optional). Vercel: NEXT_PUBLIC_VERCEL_ANALYTICS_ID, CRON_SECRET.

## next.config.ts security headers (present)
HSTS, X‑Content‑Type‑Options nosniff, X‑Frame‑Options DENY, Referrer‑Policy, Permissions‑Policy, COOP same‑origin, CORP same‑site. **MISSING: Content‑Security‑Policy.** Images allowed only from `*.supabase.co/storage/v1/object/public/**`.
