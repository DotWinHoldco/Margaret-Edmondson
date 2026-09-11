# Studio fulfillment implementation and release

## Architecture

The existing site_settings.lumaprints_enabled field remains the single authoritative switch. The storefront and checkout resolve the same active provider, price, and shipping profile. The get_fulfillment_policy RPC exposes only public policy fields and is uncached. Missing/unreadable policy fails closed.

Studio prices and shipping overrides are additive variant/product fields. Original prices stay in the existing base-price/original-variant flow. Private production instructions and references live in the admin-only studio_variant_details table, not publicly readable product variants.

Checkout calculates prices and shipping from authoritative records, then captures private production references before issuing a payment capability. Version 2 checkout snapshots freeze price, quantity, names, dimensions, options, provider, source path, shipping allocations, policy version, and lead time. Public cart data cannot set a charge.

The embedded checkout verifies the capability and actual Address Element destination before confirmation. The signed Stripe webhook independently validates the paid address, and checks the charge for refunds/disputes before releasing work. Discrepancies set an order hold that both dispatch claims and studio transactions enforce. Legacy snapshots keep their compatibility path; required version 2 snapshots never fall back to mutable cart contents.

Hosted checkout uses the same validated merchandise discount and shipping amount. Discount allocation preserves exact cents and does not discount shipping or the configured tax line. Address-dependent integration quotes or restricted studio destinations require the embedded checkout; hosted checkout cannot bind a prequoted rate to its final address. This is an explicit checkout limitation.

Studio jobs, packages, quantity allocations, activity events, and notifications use database transactions. Updates include job revisions to prevent lost edits. A unique initial-job index and client-generated shipment/replacement/refund keys protect retries. Order-level locks serialize quantity changes. Refund/cancellation triggers stop unfinished work; shipped originals require an explicit physical-return action to restock.

All Lumaprints HTTP requests (including retries, quotes, catalog operations, and status polls) check the authoritative policy. Provider dispatch and mode changes lock the policy row; dispatch also locks the paid order. A claim already in flight remains visibly unresolved. Paid studio jobs are never switched to automatic production.

Shipment notification entries commit with the package. The existing fulfillment-worker cron drains them. Retries preserve the payload and provider idempotency key, use bounded attempts, and stop before the provider’s deduplication window expires. Admins see delivery failures.

## Database and permissions

Migration: supabase/migrations/20260911180630_studio_fulfillment.sql.

New tables: studio_variant_details, studio_jobs, order_shipments, order_shipment_items, studio_order_events, and studio_notifications.

All have RLS and deliberate grants. Operations use the authenticated administrator client. Service-role access is confined to checkout snapshots, signed payment handlers, worker duties, and customer data reads after ownership or receipt-capability verification. Customer rendering receives only explicit public progress projections. The bounded queue_reviewed_fulfillment definer function checks the administrator role before touching the existing service-only provider queue.

The migration backfills studio prices from current retail prices and marks ready existing studio offers. It preserves the current switch value and provider prices, creates tickets for unfinished paid self-shipped work, and leaves completed orders in the ledger. It also protects returned-original inventory against refund replays.

## Verification

- Required npm run build-check: **GREEN** on 2026-09-11. See [the final runner output](../build-checks/studio-build-check.txt).
- node scripts/test-studio-db.mjs creates a disposable local PostgreSQL cluster, applies a prior-schema fixture and the real migration, and exercises production, switches, payment holds, duplicate claims, revisions, partial shipments, delivery, returns, refunds, and unauthorized access. It never reads app credentials. Set STUDIO_PG_BIN to a PostgreSQL binary directory on other machines.
- Vitest covers authoritative studio prices, independent profiles, source readiness, original inventory validation, regional shipping, exact discount allocations, purchase snapshots, paid-address rechecks, and zero printer requests while disabled/unavailable.
- Browser review uses real components and isolated sample API data at test/ui/studio-preview.html. Verified both switch directions, price/fee editing, quantity allocation requests, queue rendering, desktop/mobile layout, and no browser errors. This is component interaction evidence, not a live payment test.

To reproduce the browser fixture, run:

    node node_modules/vite/bin/vite.js --config test/ui/studio-vite.config.mts

Then open http://127.0.0.1:4177/test/ui/studio-preview.html.

The existing credential-dependent Supabase tests remain separately gated. No live/test Stripe payment, actual email delivery, or printer submission has been performed.

## September 11 deployment

The studio migration was applied to the existing linked Supabase project, klwkajukicsoiwpsgftt. Its previously applied 20260810220444 security migration was recovered verbatim into local migration history first. Database types were regenerated, and the required build check passed again at 20:11 UTC.

PostgREST verification confirmed that the public policy RPC works, anonymous reads of studio jobs, private production details, and events are denied, and the configured server credential can read the queue. All six new tables have RLS. The migration prepared 191 active studio offers; there were no existing orders. Lumaprints remains enabled and Stripe remains in its existing live mode.

The Vercel release target is preview, using the same existing database. Settings edited in this preview affect that shared database. The production application has not been promoted. Preview Stripe secret, publishable key, and webhook values were empty at release preparation; payment acceptance and end-to-end payment testing require those credentials. Preview deployments also do not execute Vercel production cron schedules.

Deploy from the linked Git branch to retain the existing tracked public artwork while excluding untracked local artwork archives and .cowork-transfer. Direct CLI uploads from the working directory encountered oversized archives and upload connection errors. A source-only CLI preview built successfully during upload troubleshooting; the final release should use the complete Git source.

## Release sequence

1. Apply the additive migration to a staging copy and regenerate Supabase database types against that schema. Review active catalog/source readiness and any in-flight provider orders.
2. Deploy this branch to a preview backed by that migrated database. Configure Supabase service access, Stripe test keys/webhook, the existing fulfillment cron, and email settings.
3. Run real test-mode original/print/mixed purchases through payment, receipt, queue, split packages, notification retry, refund, and switchback. Use a controlled email recipient and printer sandbox.
4. Apply the migration to production before deploying this code. The migration preserves the live switch. Do not change the live mode during the schema/code transition.
5. Margaret reviews studio prices, source approvals, fees, lead times, and coverage; then turns Lumaprints off.

Do not remove the additive schema as a rollback while orders reference it. Keep work history and payment snapshots. A rollout rollback should retain the migrated data and keep new provider submissions paused until the affected orders are reviewed.

Prepared artwork files use the repository’s existing versioned master paths. External-source approval freezes the reference/instructions, not the bytes held by another person. Label purchasing and a restricted helper login remain outside this release.
