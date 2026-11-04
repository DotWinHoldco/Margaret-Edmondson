# Festive class production flow

Authored by DotWin. Preserves the supplied class pages and paintings from DOTWIN ef200b8d, integrated into Artbyme.studio at /classes/festive-paint-at-the-market.

Uses the existing Artbyme Stripe credentials, site_settings.stripe_test_mode, /api/webhooks/stripe signature verification, Resend sender, and admin/artist authorization. No alternate merchant, independent payment keys, or platform database.

The database owns prices, choices, capability-token hashes and immutable group snapshots. Public RPCs expose only availability or token-scoped orders. Only the service-role settlement RPC accepts verified payment evidence. Test payments never enter the live roster or email outbox. Live payment settlement enqueues buyer/studio emails atomically; durable delivery records, leases, provider idempotency and Stripe redelivery recover partial failures. Existing order reconciliation also dispatches festive sessions.

The owner confirmed November 21, 2026, 9:00 AM–12:30 PM Central, 103 Freese Drive, Sanger. $20 per painter before November 21; $25 on the day; unlimited attendance. The admin roster is /admin/classes/festive. Refunds currently need manual class-roster reconciliation; do not infer cancellation solely from a customer request.

Keep registration closed until test checkout, signed settlement, confirmation privacy, email reliability, and production settings are verified. The public password gate and global Stripe mode are released together after verification.
