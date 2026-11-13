# Margaret November requests — release record

Authored by DotWin. Published November 13, 2026.

## Source and deployment

- Approved source repository: https://github.com/DotWinHoldco/Margaret-Edmondson
- Application commit: `a21f85cec641f1e5df9c765ad541e8a217504403` on `codex/margaret-november-requests`.
- Annotated release tag: `margaret-requests-2026-11-13` (points to the application commit).
- Review: https://github.com/DotWinHoldco/Margaret-Edmondson/pull/26
- Existing DotWin-managed project: `prj_ntGVQ8P3ptujQICjhQMZbyPpmC0j`.
- Production deployment: `dpl_8j1p818T6MQUe5WvRs1z96i4fREV`.
- Deployment URL: https://margaret-edmondson-d5pc0boop-dotwinholdcos-projects.vercel.app
- Live owner entry: https://www.artbyme.studio/admin#work-requests
- The hosting service built the exact application commit from the existing GitHub repository with custom domains held back. After GREEN and staged smoke checks, the same deployment was promoted; no additional hosting project was created.
- DotWin handoff branch: `codex/margaret-november-handoff` in https://github.com/DotWinHoldco/DOTWIN, directory `docs/sites/margaret-edmondson/`. It preserves the owner playbook, this record, and a source patch from `ecad7981d0f162d6c57252b0abcbce7a9ef6f647` to the application commit.

## Delivered

Work Requests moved directly below the dashboard header and gained a sidebar shortcut. The automatic launch popup is removed. Earlier design feedback is collapsed and retired homepage-version choices are removed. Studio shipment recording explains the saved Packing stage prerequisite and postage entry. The newsletter composer includes instructions for writing, formatting, drafting, testing, and sending.

The dashboard cleanup and newsletter instructions requests were marked Completed with status audit entries after deployment. The shipment request remains open pending the real tracking number. Stripe repair was deferred at the owner's request. No orders, tracking numbers, customer messages, campaigns, tax settings, discounts, or Stripe configuration were changed.

## Validation and runtime

- Local and hosted `npm run build-check` both printed **GREEN**, including typecheck, lint, test and production build. Logs: `docs/build-checks/november-requests-local.txt` and `docs/build-checks/november-requests-hosted.txt`.
- The focused launch, help-link and order-surface suite passed 16 tests. Coverage includes the reported New-stage shipment condition, request placement, removed launch dialog and collapsed feedback.
- Existing advisory documentation/RLS findings remain nonblocking. The optional grant-boundary gate was skipped where Supabase CI credentials were unavailable; this is not a claim that all optional audits ran.
- Staged homepage returned HTTP 200. Staged admin access resolved to the sign-in page.
- Live homepage returned HTTP 200 and identified `dpl_8j1p818T6MQUe5WvRs1z96i4fREV` in its rendered HTML. `/admin` and `/admin/email` redirected to their sign-in destinations and returned the same deployment ID. Authenticated production interaction was not exercised in this session; component behavior is covered by the tests above.
- Local Node `v26.0.0`, npm `11.12.1`; hosted Node setting `24.x`; Next.js `16.3.8`; local deployment CLI `54.1.0` and hosted build CLI `65.14.0`. The remote log did not report exact hosted Node/npm patch versions.
- Lockfile: existing `package-lock.json`, unchanged; SHA-256 `de04675fc0a7fc44c1996d1c9aaed46ee2491f8823f60001c0669087faa9d08b`.
- No database schema migrations or dependency changes. Current local dependencies and latest usable build output were preserved.

## Restore

For an immediate application rollback, promote the previous production deployment `dpl_AdsK6uBBXAKcLrPVb8hLACTYp7Sf` in the existing project and verify the live hostname. Previous URL: https://margaret-edmondson-f2m26vs8r-dotwinholdcos-projects.vercel.app.

For source recovery, fetch the approved repository and check out `margaret-requests-2026-11-13` into an appropriate isolated checkout. Use its lockfile and the existing approved environment/secrets system, run `npm ci` only if dependencies are missing, then run `npm run build-check`. Publish through the existing DotWin-managed project, first holding custom domains back and then promoting the checked deployment. No credentials are stored in these records.

The two request-status changes are operational records, separate from an application rollback. If needed, reopen those two requests through the admin UI so its audit trail is retained; do not rewrite history.
