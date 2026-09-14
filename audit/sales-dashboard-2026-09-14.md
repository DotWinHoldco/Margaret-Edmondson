# Sales dashboard and single-choice tax settings

## Release

- Replaced independent tax toggles with one mutually exclusive choice: Off, Include tax in my prices, or Add tax at checkout. Existing persisted settings and registration checks are reused.
- Off shows no active tax calculation example. Unsaved choices are labeled as a preview; the saved setting is labeled separately.
- Added `/admin/sales`: order sales totals, counts, average order value, recorded full refunds, latest 25 order links, and tax by delivery state. Added navigation from the project dashboard, sidebar, tax settings, and help articles.
- Date choices: last 30 days, last 90 days, this calendar quarter, last 365 days, and this calendar year, using America/Chicago calendar dates.
- Both included and added tax are tallied from saved order amounts. Historical states remain visible after nexus selections change. State totals can be downloaded as CSV.
- Updated guides 12, 13, and 20 and replaced screenshots to match the new controls. Dashboard screenshot uses labeled sample orders matching the written examples.

## Verification

- `npm run build-check`: GREEN, including typecheck, lint, tests, production build, and required repository checks.
- Fifteen reporting tests cover date boundaries, DST, leap dates, offset timestamps, included and separate tax, full and partial refund handling, historical states, unknown/invalid records, pagination beyond 1,000 rows, admin authorization, invalid periods, and database failures.
- Browser checks cover all three mutually exclusive choices, save results, Off disclosure behavior, all five reporting periods, CSV download and file contents, empty reports, failure/retry behavior, and delayed-response handling.
- Sample report: two orders total $208.25; tax is $15.87; sales before tax are $192.38; average order is $104.13. A full refund of the $108.25 order removes $8.25 tax, leaving $7.62 net recorded tax.
- Release commit `1276ec7` deployed successfully to `https://www.artbyme.studio`. Live Chrome checks confirmed the authenticated report loads, the 90-day filter uses the expected dates, all three tax choices appear with no old switches, and the settings link scrolls to the tax tracker after loading. The updated help article and screenshot were also checked.

## Accounting basis

This dashboard selects orders by creation date and uses their current recorded refund status. It is an order report, not a refund-date or remittance ledger. Payments to states, unrecorded external refunds, and unallocated partial-refund tax are not subtracted. It does not claim to determine the remaining legal amount owed to a state. Unknown tax or payment data, disputed orders, and cancelled payments needing review are disclosed. No tax rates are invented or recalculated from current settings.

The report reads under the signed-in administrator's RLS identity, requires existing admin authentication, returns no-store responses, and fails rather than returning a partial total when database pagination fails. No migration or live business-setting change was required.
