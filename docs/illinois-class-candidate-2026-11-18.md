# Illinois class — verified release candidate

Authored by DotWin. November 18, 2026. **Staged, not promoted; Illinois registration is closed.**

## Source and deployment

- Approved source: https://github.com/DotWinHoldco/Margaret-Edmondson, branch `codex/margaret-illinois-class`.
- Application commit: `d33ea0be424e9470089cdbff7940d7f749e5bff2`.
- Annotated candidate tag: `margaret-illinois-candidate-2026-11-18`, pointing to the application commit. This is not a public release tag.
- Production baseline retained: `69d8e986aa4b91b889344526f10c46e0c19cebe4`, deployment `dpl_9t2yCp5snXAs85mdXhTvTGy5tmpX`.
- Existing DotWin-managed project: `prj_ntGVQ8P3ptujQICjhQMZbyPpmC0j` in `team_m2LgJy4E3OF5MMzl4zqP7cFY`.
- Ready candidate deployment: `dpl_8oKM8d93oV9Lp2HB7Lr691VqgtnB`.
- Candidate URL: https://margaret-edmondson-nvfcoxjpr-dotwinholdcos-projects.vercel.app/classes/festive-paint-marion-il
- Created through the existing project with production settings and custom domains held back. No new hosting project was created. The public domain still uses the baseline deployment.
- DotWin source handoff: branch `codex/margaret-illinois-handoff` in https://github.com/DotWinHoldco/DOTWIN, directory `docs/sites/margaret-edmondson/`. The patch preserves editable source changes from the production baseline through the candidate commit.

## Scope and validation

The new Marion class shares the original festive design and four painting choices, while separating dates, locations, reservation identity, confirmation links, emails and admin rosters from North Texas. Illinois is November 24, 5–8 PM Central at 401 S. Court St., Marion IL. Its $20 early price runs through November 22 at 11:59 PM Central, then becomes $25.

- Local `npm run build-check` and hosted `npm run build-check:write` both printed **GREEN**, including typecheck, lint, tests and production build. Logs: `docs/build-checks/illinois-class-local.txt` and `docs/build-checks/illinois-class-hosted.txt`.
- Focused class/payment/database tests passed. Real PostgreSQL rollback tests verified class isolation, retry immutability, invalid-class rejection and no partial registration after an injected persistence failure. Test transactions were rolled back.
- The staged Illinois page returned HTTP 200. Browser review confirmed the Marion venue, date, hours, early deadline, four paintings and group total changing from $20 to $40 for two painters. Checkout remains disabled for Illinois. No real charge or signed Stripe delivery was exercised.
- Existing documentation/RLS advisory findings remain nonblocking. The optional grant-boundary audit was skipped without Supabase CI credentials; not every optional audit ran.
- Local Node `v26.0.0`, npm `11.12.1`, Next.js `16.3.8`; hosted Node setting `24.x`; local deployment CLI `54.1.0`, hosted CLI `65.17.0`. Exact hosted Node/npm patch versions were not reported.
- Existing `package-lock.json` unchanged; SHA-256 `de04675fc0a7fc44c1996d1c9aaed46ee2491f8823f60001c0669087faa9d08b`.
- Migration `20261118192737_festive_illinois_class` is applied. It adds Illinois with `accepting=false`, preserves the original Texas reservation API and leaves settlement/webhook configuration unchanged.

## Remaining launch work

Art By ME Stripe account access is required to inspect current webhook endpoints and recent deliveries. Connected access currently reaches DotWin’s account; the Art By ME browser session is at sign-in. The historical warning named `https://artbyme.studio/api/webhooks/stripe`, which currently redirects to www. The www URL rejects unsigned requests, as expected. Neither observation establishes which endpoint Stripe currently uses or whether current sales fail. Two November website orders have Stripe payment IDs, including the November 8 Central-time order now marked Shipped.

Inspect actual Art By ME payment and delivery records. If the old redirecting endpoint is still active, obtain the owner’s decision on the previously deferred correction, then verify signed delivery and registration confirmation. Once verified, enable the Illinois class, promote the checked deployment through the existing project, and record the final live checks and release tag. Do not infer payment success from the browser return or mark paid manually to bypass verification.

## Owner work requests

- Logo instructions posted to Margaret’s request. They explain Workspace administrator photo-editing permission and her own profile upload. No Google account setting was changed.
- September crop request marked completed with a developer follow-up after crop tests passed and the print library showed 47 ready masters, zero failed or pending. No production artwork was recropped.
- Stripe app instructions prepared in `docs/margaret-stripe-app-reply.md`; draft only, not sent.

## Recovery and retention

Fetch the approved application repository and check out the candidate tag to recover this source. Use the lockfile and existing approved environment/secrets system; install dependencies only if missing, run `npm run build-check`, and publish through the existing DotWin project with domains held back until verification. The DotWin patch can be applied on baseline `69d8e986aa4b91b889344526f10c46e0c19cebe4` to recover the class implementation.

No public-domain rollback is needed because promotion has not occurred. If this candidate is later promoted and must be reverted, restore `dpl_9t2yCp5snXAs85mdXhTvTGy5tmpX` in the same project. Retain the additive migration and registrations; close Illinois registration rather than deleting class data. Operational request comments/statuses are separate from a code rollback and should be corrected through the normal audited workflow.

Current local dependencies, usable build output, owner assets and pre-existing uncommitted files were preserved. Original scans were excluded from hosted uploads, not deleted. No duplicate backup checkout, dependency install or paid storage was created. No secrets or customer exports are included in the handoff.
