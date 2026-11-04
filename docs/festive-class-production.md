# Festive Paint at the Market — Artbyme production integration

Owner request: publish the preserved November 21 class on Artbyme.studio using Margaret’s existing Stripe, email and booking infrastructure; switch the existing site to live Stripe mode and remove the public visitor password. Admin authentication stays enforced.

Source: DOTWIN codex/margaret-festive-class-handoff at ef200b8d. Production base: Margaret-Edmondson b95eb9b. The original worktrees are unchanged. The reviewed class layout, four paintings, pet example and pricing copy are preserved. Shared Artbyme navigation surrounds the class page.

Routes: /classes, /classes/festive-paint-at-the-market, private confirmation below that path, and /admin/classes/festive for paid groups and canvas totals.

Uses existing Stripe credentials and /api/webhooks/stripe; no new merchant or secrets. The class follows site_settings.stripe_test_mode. New capability-protected group tables are in Margaret’s existing database klwkajukicsoiwpsgftt. Migration 20261104185409_festive_class_production is applied with registration closed. Atomic settlement enqueues durable buyer and studio emails through the existing Resend sender. Test payments are excluded from live emails and roster. Refunds require manual class roster reconciliation for this release.

Verified before staging: 1,107 tests passed, 7 intentionally skipped; 18 focused festive checks included. Typecheck passed; lint passed with existing warnings. Database rollback assertions passed for 40/50 dollar group prices, invalid choices and price tampering, token privacy, restricted settlement, unpaid and duplicate/late events, global mode, durable live email creation, email lease exclusion, and closing time. Existing Stripe sandbox account and enabled webhook verified; all four required checkout events already subscribed. No real payment or customer email was sent during these checks.

The owner confirmed Saturday November 21, 2026, 9 AM–12:30 PM Central at 103 Freese Drive, Sanger. Unlimited attendance, $20 before November 21 and $25 on the day.

Release builds use production settings and npm run build-check; each verified build is promoted without rebuilding. Routine branch previews disabled. The initial runner failure was reproduced as React tests inheriting NODE_ENV=production; the runner now sets test mode for tests only. The corrected build reported GREEN. The complete test folder is included in the private build inputs for the release check. Large generated build output remains on Vercel; dependencies are reused locally.

Owner correction: all new class payments use the existing on-site Payment Element, with its exact appearance and mode selection extracted to src/lib/stripe/elements.ts and shared with the shop. No hosted checkout is created. PaymentIntent evidence is bound before returning the client secret and settled through the existing signed webhook. Migration 20261104195446_festive_payment_elements adds the service-only binding and settlement functions. Legacy callbacks remain accepted for the single paid sandbox checkout made before this correction.

Requested confirmation-preview email sent only to Skylar; Resend reports delivered (2026-11-04). No live payment or customer/artist booking email has been sent.

Production release: a0e62fa on DotWin-cx/margaret-festive-production, deployment dpl_8eCNTXcg6sM7fFdr1pX2zXNucrwW, promoted to Artbyme.studio. Full remote build-check reports GREEN; 1,112 tests pass, seven skipped. Its output is retained in docs/build-checks/festive-elements-production.txt. No merge into main was made.

The Elements test group 62cfbc71-988a-4e0f-b38f-a0c2ccf7b6d6 created PaymentIntent pi_3UYAMMLHA3pBKXF62X2DdR6T for $40 (Snowman + Santa). Stripe sandbox confirmation succeeded, and the existing signed webhook marked the group paid with zero live email records. Because the automated browser held the secure iframe at about:blank, confirmation used the provider's test API; the owner subsequently confirmed that the card fields appear inside the page in a normal browser. Card-field rendering is owner-confirmed; no real payment was submitted.

Live Stripe was enabled and its existing admin API-key verification returned “Stripe key valid (live mode).” One unpaid live test intent was opened to verify the live pairing; no live card or charge was submitted. Visitor gate is disabled. Anonymous HTTP checks: homepage, /classes and festive detail return 200 without the password gate; the class offers live checkout; /admin/classes/festive redirects to login. Admin authentication remains enforced.

Both original roots retain their original HEAD and exact status hashes (DOTWIN 80 entries, Margaret-Edmondson 206). Source worktrees and docs remain; no dependency install or local build output was created. A reproducible 3 MB TypeScript incremental cache is retained.

Owner verification complete: the card fields appear within the class page in a normal browser. The browser-tool blank frame was not reproduced by the owner. Follow-up requested: replace the Gallery filter Oil with Acrylic; the filter continues to match the artwork medium case-insensitively.
