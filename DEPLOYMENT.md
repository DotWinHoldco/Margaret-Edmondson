# Deployment

Authored by DotWin

ArtByME deploys on Vercel against Supabase project `klwkajukicsoiwpsgftt`.

## Deployment requirements

- Production build passes (`npm run build`) on a native toolchain.
- Required env vars are set in Vercel (not in the repo). See the grouped list below and
  `.env.example` for the authoritative set.
- Database migrations are applied to prod and recorded in the migration ledger.
- Auth redirects are configured in Supabase.
- Stripe, LumaPrints, Printful, ShipStation, and Resend webhooks are configured with their
  signing secrets.
- Known risks are documented (`KNOWN_RISKS.md`).

## Required environment (set in Vercel, never committed)

- App: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME`.
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (required; the money path, crons, the order-confirmation page, and
  the pixel queue depend on it).
- Stripe: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  (plus the `_TEST` variants while `site_settings.stripe_test_mode = true`).
- Fulfillment: `LUMAPRINTS_*`, `PRINTFUL_*`, `SHIPSTATION_*`.
- Email: `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, and `UNSUBSCRIBE_SECRET`
  (required in production; one-click unsubscribe signing fails closed if unset).
- Meta: `NEXT_PUBLIC_META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`.
- Crons: `CRON_SECRET` (cron routes fail closed with 503 when unset).
- Optional: `ANTHROPIC_API_KEY` (shared-file processing / content assists), `GOOGLE_CLIENT_*`.

## Migrations

- The four harden migrations `2026062201`–`2026062204` are applied on prod and recorded.
- `2026061501`–`2026061505` are applied on prod but missing from the prod ledger (see
  `KNOWN_RISKS.md` `#migration-drift`). Optionally repair the ledger; no schema change is needed.
- Ship schema and the code that depends on it together. `2026062202` and `2026062203` must not be
  applied without their matching webhook/router code, and vice versa.

## Build command

```bash
npm run build
```

## Pre-commit hook

The repo carries a husky pre-commit hook (`.husky/pre-commit`) that runs typecheck plus the
fast diff-scoped gate. It activates after `npm install` runs the `prepare` script. If hooks are
not active, run `npm run prepare`.

## Rule

Do not deploy when the build status is `failed`, `blocked`, or `passing-partial` unless
explicitly approved. The status is whatever `npm run build-check:write` prints, run on a native
toolchain.
