# Technical Documentation

Authored by DotWin

## Stack

Next.js 16.2 (App Router, Turbopack), React 19, TypeScript, Supabase (`@supabase/ssr`),
Tailwind 4, Zod, Stripe, Resend, LumaPrints/Printful/ShipStation fulfillment. Deployed on Vercel
against Supabase project `klwkajukicsoiwpsgftt`.

## Architecture

- Routing/middleware: Next 16 middleware is `src/proxy.ts` (exports `proxy`). There is no
  `src/middleware.ts`.
- Server surface: ~130 API route handlers under `src/app/api` (no Server Actions). Each handler
  authorizes itself; the proxy is an optimistic filter only.
- Data access: two Supabase client roles, cookie/anon (`createClient`, RLS as the user) and
  service-role (`createServiceClient`, server-only, webhooks/crons/capability-token lookups).
- Domains: storefront/checkout, fulfillment, LMS/account, CRM/email, page builder/funnels,
  social calendar, media library.

## Where the detail lives

- Schema, RLS policies, and functions: `audit/00-backend-reference.md`.
- Audit register and P2/P3 backlog: `audit/ADOPT-2026-06-21/FINDINGS.md`.
- Current state: `STATE.md`. Tagged history: `BUILD_LOG.md`. Open risk: `KNOWN_RISKS.md`.
- Artwork inventory (canonical): `docs/artwork-inventory.md`.

## Verification

The factory gates live in `scripts/` and run via `npm run build-check`. Divergences from the
factory standard (route-handler architecture vs the kernel/module pattern; project-specific
Supabase client filenames) are recorded in `KNOWN_RISKS.md`.
