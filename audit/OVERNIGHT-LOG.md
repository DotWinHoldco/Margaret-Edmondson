# ArtByME — Autonomous Overnight Hardening Log

Run started 2026-06-07 (late). Executor: Claude Code (ultracode), autonomous.
Repo: `/Users/skylarwebber/Margaret-Edmondson` · Supabase: `klwkajukicsoiwpsgftt` (MargaretEdmondson, ACTIVE_HEALTHY) · Site: artbyme.studio (Next.js 16).

> This log is appended continuously — one entry per task: **DONE / FIXED-FORWARD / DEFERRED(reason)**, what changed, files touched, every judgment call. The final summary + human-action list is added at the top in Phase 6.

---

## Baseline (Phase 0)

**Phase gate (before any change) — all green:**
- `npm ci` → exit 0
- `npm run typecheck` → clean (0 errors)
- `npm run lint` → 0 errors, 47 warnings (mostly `<img>`/unused-var; pre-existing)
- `npm run build` → exit 0
- `npm test` → 66 passed / 10 files

**Stripe mode:** `site_settings.stripe_test_mode = true` (confirmed; will stay test the entire run).

**Advisors baseline → `audit/advisors-before.json`:**
- Security: 34 lints — INFO 4, WARN 30, **ERROR 0, CRITICAL 0**.
  - 4 policy-less RLS tables: `audit_log`, `commission_milestones`, `meta_events`, `webhook_logs`.
  - 4 `WITH CHECK (true)` INSERT policies: `carts`, `class_bookings`, `commissions`, `newsletter_subscribers`.
  - 6 public buckets list-all: `about-images`, `class-pet-photos`, `commission-references`, `library`, `product-images`, `testimonials`.
  - 19 anon/authenticated-executable SECURITY DEFINER functions.
  - Leaked-password protection disabled.
- Performance: 197 lints — WARN 112, INFO 85, ERROR 0, CRITICAL 0.

**Row counts (n_live_tup, public schema):** orders 0 · order_items 0 · webhook_logs 0 · commission_milestones 0 · audit_log 0 · meta_events 0 · promo_code_redemptions 0 · carts 2 · products 37 · product_variants 585 · product_images 61 · media_library 84 · blog_posts 10 · class_sessions 23 · testimonials 13 · cv_entries 16 · lumaprints_mediums 8 · lumaprints_pricing_cache 16 · profiles 1 · crm_contacts 1 · newsletter_subscribers 1 · promo_codes 1 · site_settings 1 · pages 5 · page_blocks 6 · page_revisions 9 · bio_sections 5 · bio_callouts 7 · product_categories 38. (All LMS/orders/commissions/feedback/work_request tables empty.)

**Restore tag:** `restore/pre-overnight` created & pushed at HEAD (`dbbbdfc`).

---

## PHASE 0 — Preflight & safety

- **0.1 Clean install & baseline gate** — DONE. See Baseline above. Environment healthy; tests runnable.
- **0.2 Env verification** — DONE. Added `scripts/check-env.mjs` (asserts presence, never prints values; loads `.env.local` then `process.env`; non-zero exit if a required var missing). Local run: present = `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `EMAIL_FROM`. **Missing locally** (live in Vercel): `SUPABASE_SERVICE_ROLE_KEY`*, `RESEND_API_KEY`*, `CRON_SECRET`*, all Stripe (`STRIPE_SECRET_KEY[_TEST]`, `STRIPE_WEBHOOK_SECRET[_TEST]`, publishable), `RESEND_WEBHOOK_SECRET`, `LUMAPRINTS_API_KEY/SECRET`, `PRINTFUL_ACCESS_TOKEN`, `SHIPSTATION_API_KEY`, `META_CAPI_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `SITE_PASSWORD`, `SITE_AUTH_SECRET`. (*=required.) Updated `.env.example` to add `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET_TEST`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST`, `ANTHROPIC_API_KEY`. Judgment call: code is written env-guarded throughout, so these missing keys never block a task — they are runtime requirements the human adds in Vercel.
- **0.3 Stripe TEST mode** — DONE/confirmed. `stripe_test_mode = true`; not flipping.
- **0.4 DB baseline snapshot** — DONE. `audit/advisors-before.json`; row counts above.
- **0.5 Restore tag + log** — DONE. Tag pushed; this log initialized.
