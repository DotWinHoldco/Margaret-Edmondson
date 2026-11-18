# Festive Paint — Illinois and North Texas

Authored by DotWin. November 18, 2026.

Status: published November 18, 2026, with live registration enabled. Illinois uses the existing Art By ME live Stripe configuration. No new Stripe account is required. See illinois-class-release-2026-11-18.md for verification and recovery details.

The Classes page lists North Texas and Southern Illinois separately. Each uses Margaret’s original four paintings, per-painter choices, one payment per group, an 8×10 pre-drawn canvas and the same included materials and instruction. Attendance remains unlimited.

| Class | When (Central) | Where | Early price | Regular price |
| --- | --- | --- | --- | --- |
| North Texas | November 21, 9 AM–12:30 PM | 103 Freese Drive, Sanger, TX | $20 through November 19, 11:59 PM | $25 starting November 20 |
| Southern Illinois | November 24, 5–8 PM | 401 S. Court St., Marion, IL | $20 through November 22, 11:59 PM | $25 starting November 23 |

Share the Illinois page: https://www.artbyme.studio/classes/festive-paint-marion-il
North Texas keeps its original URL: https://www.artbyme.studio/classes/festive-paint-at-the-market

To prepare canvases, open Classes in the dashboard, choose the Festive Paint roster, then choose North Texas or Southern Illinois. Counts and paid group details are separate. Each buyer/studio confirmation and Stripe payment description identifies the correct class. Existing paid Texas registrations retain their agreed price and identity. Refunds still require manual roster reconciliation.

Dates, wording and artwork choices live in src/sites/margaret-edmondson/festive-class.ts. Database prices and deadlines live in festive_classes and must be updated together with the displayed schedule. Illinois’s discount boundary is November 23 at 00:00 Central, which includes all of November 22. The original Texas flier remains only on the Texas page because its dates and location do not describe Illinois.

Migration 20261118192737_festive_illinois_class adds the Illinois class closed initially and preserves old reservation APIs for existing browser sessions. After deployment and live checkout verification, registration is enabled. Normal pages keep their www redirect; the existing non-www Stripe callback reaches the same signature-checking payment handler directly. This requires removing the hosting project's blanket apex redirect after deploying the path-specific redirect in next.config.ts.

If a callback is delayed, the private class confirmation page checks the bound payment directly with Stripe, retrieves its genuine success event and uses the same atomic settlement function and confirmation-email delivery records. No browser-supplied payment status is trusted. The recovery check covers events retained by Stripe for 30 days and scans at most 300 success events per refresh. Buyers who have paid should retain their private confirmation page and refresh its status rather than pay a second time.

Margaret's Stripe endpoint settings remain inaccessible to this session. The website routing fix cannot re-enable an endpoint Stripe has disabled or replay its old failed deliveries. Margaret can inspect that endpoint in her Stripe dashboard if needed. The new class confirmation recovery also works when delivery of that event is delayed or absent. Existing orders showed successful signed Stripe callbacks on November 5 and 8; no new real card charge was made during verification.

Verification includes real PostgreSQL class isolation, immutable retry prices, invalid/unknown class rejection, rollback after an injected persistence failure, per-class deadline boundaries, embedded checkout identity and email venue/date checks. Local full build-check printed GREEN on November 18. Production release evidence is recorded separately.
