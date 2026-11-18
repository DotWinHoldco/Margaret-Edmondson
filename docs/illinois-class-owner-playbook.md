# Festive Paint — Illinois and North Texas

Authored by DotWin. November 18, 2026.

Status: verified release candidate, not yet published to the public domain. Illinois registration remains closed pending inspection of Art By ME’s current Stripe delivery settings. Existing shop and Texas checkout settings were not changed. The URLs below are the intended public links after launch.

The Classes page lists North Texas and Southern Illinois separately. Each uses Margaret’s original four paintings, per-painter choices, one payment per group, an 8×10 pre-drawn canvas and the same included materials and instruction. Attendance remains unlimited.

| Class | When (Central) | Where | Early price | Regular price |
| --- | --- | --- | --- | --- |
| North Texas | November 21, 9 AM–12:30 PM | 103 Freese Drive, Sanger, TX | $20 through November 19, 11:59 PM | $25 starting November 20 |
| Southern Illinois | November 24, 5–8 PM | 401 S. Court St., Marion, IL | $20 through November 22, 11:59 PM | $25 starting November 23 |

Share the Illinois page: https://www.artbyme.studio/classes/festive-paint-marion-il
North Texas keeps its original URL: https://www.artbyme.studio/classes/festive-paint-at-the-market

To prepare canvases, open Classes in the dashboard, choose the Festive Paint roster, then choose North Texas or Southern Illinois. Counts and paid group details are separate. Each buyer/studio confirmation and Stripe payment description identifies the correct class. Existing paid Texas registrations retain their agreed price and identity. Refunds still require manual roster reconciliation.

Dates, wording and artwork choices live in src/sites/margaret-edmondson/festive-class.ts. Database prices and deadlines live in festive_classes and must be updated together with the displayed schedule. Illinois’s discount boundary is November 23 at 00:00 Central, which includes all of November 22. The original Texas flier remains only on the Texas page because its dates and location do not describe Illinois.

Migration 20261118192737_festive_illinois_class adds the Illinois class closed initially and preserves old reservation APIs for existing browser sessions. Activation requires deployment verification and a working signed Stripe delivery path. The old warning named a redirecting non-www URL, but the current Stripe endpoint list has not been inspected: this is not proof that the shop cannot sell. Inspect the actual endpoint and recent deliveries first. The separately deferred webhook URL repair remains an owner decision if that setting is still in use. Never mark a booking paid from a browser return alone.

Verification includes real PostgreSQL class isolation, immutable retry prices, invalid/unknown class rejection, rollback after an injected persistence failure, per-class deadline boundaries, embedded checkout identity and email venue/date checks. Local full build-check printed GREEN on November 18. Production release evidence is recorded separately.
