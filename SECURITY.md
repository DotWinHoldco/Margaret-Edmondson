# Security

Authored by DotWin

## Required standards

- Validate auth server-side. Every route handler that performs a privileged action authorizes
  itself; the proxy is an optimistic filter only.
- Validate authorization before sensitive access.
- Never expose service-role keys. The service-role client is server-only (webhooks, crons,
  capability-token lookups) and never used to dodge RLS.
- Never commit secrets. `.env*` is gitignored except `.env.example`, which carries no values.
- Validate inputs (zod) and return safe, non-leaking user-facing errors.
- Verify every inbound webhook signature (Stripe, LumaPrints, Printful, ShipStation, Resend).
- Never trust client-side payment state. The money path is server-verified and idempotent.
- Protect admin operations behind server-side role checks plus a TOTP-verified (`aal2`) session.

## Hardened areas (2026-06-22, live on prod)

- Order idempotency: `orders` has a partial unique index on `stripe_payment_intent_id`;
  `order_items` upsert is unique on `(order_id, product_id, variant_id)`; one-shot side effects
  (CRM revenue, Meta Purchase, confirmation and owner emails) are gated on an atomic claim of
  `orders.side_effects_completed_at`. Tag `#harden-2026-06-22`.
- Fulfillment: items are atomically pre-claimed to `submitting` before the provider call, so a
  retry or lost write cannot double-submit a real print order.
- Cron auth: shared `requireCron()` uses `timingSafeEqual` and fails closed (503) when
  `CRON_SECRET` is unset, across all 7 cron routes.
- Newsletter RLS: `newsletter_subscribers` SELECT is restricted to `is_admin_or_artist()`.
- Email: one-click `List-Unsubscribe` (RFC 8058), a central suppression gate before send, and a
  dedicated `UNSUBSCRIBE_SECRET` for unsubscribe tokens that fails closed in production.
- Admin MFA: the admin surface requires TOTP. One shared decision (`decideAdminAccess`) is
  enforced in the `(admin)` server layout for pages and in `requireAdmin` for API routes, which
  answer with `401 mfa_required` / `mfa_enrollment_required` instead of a redirect. Enrolment and
  step-up live at `/admin/security/mfa/*`. See `docs/technical/admin-mfa.md`.

## Sensitive areas

auth · admin · billing (Stripe checkout + webhooks) · fulfillment (LumaPrints/Printful) ·
Supabase data access and RLS · file uploads · user/account records · CRM and email.

## Open items

See `KNOWN_RISKS.md` for the P2 security backlog (zod gaps, rate limits, email HTML escaping,
`reprice_variants` search_path, `class_bookings` capacity) and the route-handler documentation
gap that currently blocks `green`.
