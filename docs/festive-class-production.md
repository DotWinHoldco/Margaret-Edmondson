# Festive Paint at the Market — Artbyme production integration

Owner request: publish the preserved November 21 class on Artbyme.studio using Margaret’s existing Stripe, email and booking infrastructure; switch the existing site to live Stripe mode and remove the public visitor password. Admin authentication stays enforced.

Source: DOTWIN codex/margaret-festive-class-handoff at ef200b8d. Production base: Margaret-Edmondson b95eb9b. The original worktrees are unchanged. The reviewed class layout, four paintings, pet example and pricing copy are preserved. Shared Artbyme navigation surrounds the class page.

Routes: /classes, /classes/festive-paint-at-the-market, private confirmation below that path, and /admin/classes/festive for paid groups and canvas totals.

Uses existing Stripe credentials and /api/webhooks/stripe; no new merchant or secrets. The class follows site_settings.stripe_test_mode. New capability-protected group tables are in Margaret’s existing database klwkajukicsoiwpsgftt. Migration 20261104185409_festive_class_production is applied with registration closed. Atomic settlement enqueues durable buyer and studio emails through the existing Resend sender. Test payments are excluded from live emails and roster. Refunds require manual class roster reconciliation for this release.

Verified before staging: 1,107 tests passed, 7 intentionally skipped; 18 focused festive checks included. Typecheck passed; lint passed with existing warnings. Database rollback assertions passed for 40/50 dollar group prices, invalid choices and price tampering, token privacy, restricted settlement, unpaid and duplicate/late events, global mode, durable live email creation, email lease exclusion, and closing time. Existing Stripe sandbox account and enabled webhook verified; all four required checkout events already subscribed. No real payment or customer email was sent during these checks.

The owner confirmed Saturday November 21, 2026, 9 AM–12:30 PM Central at 103 Freese Drive, Sanger. Unlimited attendance, $20 before November 21 and $25 on the day.

Release uses one staged production build running npm run build-check, then promotes that same build after verification. Routine branch previews disabled. The complete test folder is included in the private build inputs for the release check. Large generated build output remains on Vercel; dependencies are reused locally.
