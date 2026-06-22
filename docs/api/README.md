# API Documentation

Authored by DotWin

ArtByME exposes its server surface as Next.js App Router route handlers under `src/app/api`
(about 130 routes, 7 crons, 5 webhooks). There are no Server Actions; privileged logic lives in
route handlers, each of which is an independently callable security boundary and authorizes
itself.

## Surfaces

- Public/storefront routes: catalog, product, cart, checkout session creation.
- Account/LMS routes: enrolment, lessons, comments, class bookings.
- Admin routes: products, variants, pricing, media library, CRM, email, page builder, funnels.
- Webhooks (signature-verified): Stripe, LumaPrints, Printful, ShipStation, Resend.
- Crons (fail closed via `requireCron`): scheduled publish, abandoned cart, social reminders,
  and other scheduled jobs.

## How this is documented

Each route handler carries an intent doc comment (the "why") above its exported HTTP method.
This is enforced by `npm run check:docs`. Annotating the remaining legacy handlers is the main
work between the current state and the first `green` (see `KNOWN_RISKS.md` `#docs-route-intent`).

## Authoritative references

- Schema, RLS, and SECURITY DEFINER functions: `audit/00-backend-reference.md`.
- Per-finding API detail with file:line: `audit/ADOPT-2026-06-21/FINDINGS.md`.
- Money-path and webhook idempotency: `BUILD_LOG.md` `#harden-2026-06-22`.
