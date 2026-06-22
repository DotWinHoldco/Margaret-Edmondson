# ArtByME (Margaret Edmondson)

Authored by DotWin

> Orientation doc. It auto-loads. Keep it small and current. Everything else is pulled on
> demand (see `STATE.md`, `BUILD_LOG.md`, `docs/`, and the `audit/` packet).

## What this is

ArtByME is Margaret Edmondson's e-commerce art store with an LMS, a CRM and email system, and a
page builder with sales funnels. Next.js 16 (App Router), React 19, TypeScript, Supabase
(`@supabase/ssr`), Stripe, Resend, and LumaPrints/Printful print fulfillment. The privileged
logic lives in API route handlers (about 130 routes, 7 crons, 5 webhooks); there are no Server
Actions.

## Read order (low context)

1. This file. 2. `STATE.md` (current truth). 3. `RULES.md` (the always-on rule pack).
4. the one active task. Pull `BUILD_LOG.md`, `audit/`, or `docs/memory/` only by tag when you
need deeper history.

## Current focus

Adopt finish: the factory verification rails and rule pack are imported. First green and the
conformance baseline are written by `npm run build-check:write` on a native (macOS) toolchain.
Mirror `STATE.md` for the live state; do not duplicate history here.

## Rules (non-negotiable)

- Stack is pinned: Next 16.2 / React 19 / `@supabase/ssr` / Tailwind 4 / Zod. See `AGENTS.md`
  for Next-16 gotchas. To diverge, record it in `KNOWN_RISKS.md`.
- Authorization is server-side. Never trust client state. Never use the service-role client to
  dodge RLS; add a policy or a SECURITY DEFINER RPC.
- Green is what `npm run build-check` prints. Never hand-type a status. Never call work done
  until the gates pass.
- This is DotWin work product. No references to AI, assistants, or prompts in code, docs, or
  commits.
- Document intent: every API route and Server Action needs an intent doc comment to go green.

## Project specifics (do not relearn the hard way)

- Next 16 middleware is `src/proxy.ts` (exports `proxy`). Do NOT create `src/middleware.ts`.
  Any audit item claiming "no middleware / admin exposed" on that basis is a false positive.
- Supabase clients: use `createClient` (cookie/anon) for user-session reads and writes that RLS
  should govern (admin, account, storefront). Use `createServiceClient` where there is no user
  session or RLS must be bypassed deliberately: webhooks, crons, checkout/order lookups keyed by
  a Stripe session id, and narrow documented server reads (for example lesson-comment author
  profiles, class bookings by email). `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel; the
  money path (checkout, webhook, order), crons, the order-confirmation page, and the pixel queue
  depend on it. A "supabaseKey is required" 500 means this var is missing.
- Branding: always "ArtByME" (capital M and E), never "ArtByMe" or "Artbyme". Artist: Margaret
  Edmondson. Use only solo photos of Margaret from
  `/public/Margaret Edmondson/Margaret Bio Photos/`. Never fabricate biographical content; use
  the real documents in `/public/Margaret Edmondson/Artist and Artwork Details/`.
- Artwork inventory: `docs/artwork-inventory.md` is canonical. Read it before creating, editing,
  or listing products, touching the variant configurator or artwork-detail UI, wiring CV
  award-piece links, or generating artwork SEO. Update it in the same change when an artwork is
  added, sold, or reclassified.
- Admin stats strip: when a change adds or removes pages, API routes, or funnels, update the
  counts in `src/app/(admin)/admin/ProjectHubClient.tsx` (search `Public Pages`).

## Commands

`npm run build-check` · `npm run build-check:write` · `npm run verify` · `npm run check:rls` ·
`npm run check:security` · `npm run check:secrets`
