# Unified admin dashboard — September 14, 2026

The main `/admin` dashboard now contains the existing paid-order sales report, reporting periods, tax-by-state totals, refunds/unknown-record notices, CSV export, and recent-order links. Financial aggregation, access controls, checkout, and fulfillment policy logic are unchanged.

The existing fulfillment control stays on Dashboard. Six shortcut cards cover Products, Orders, Pages, Settings (sales tax and margins), Documentation, and Customers. Feedback, work requests, notes, comments, and shared files remain at the bottom.

Pages links to `/admin/pages/design-assets`, with six homepage previews, three funnel templates, and saved-funnel metrics/edit/view links. Previewing a homepage does not activate it. Features built is now a native collapsed disclosure in Settings, backed by a reviewed catalog and route-link regression. Fixed page/API/code counts and unverified capability claims were removed.

Old sales-dashboard and tax bookmarks redirect to Dashboard and preserve tax anchors. Guide labels/links and two dashboard screenshots have been refreshed. Screenshots containing sample orders are explicitly described as examples.

Validation:
- Required build-check includes TypeScript, lint, tests, production build, and repository security/boundary checks.
- Navigation regression verifies shortcut routes/help slugs and relocated section anchors.
- Launch-entry tests exercise the actual unified dashboard and existing guide for fresh and legacy-dismissed sessions.
- Chrome preview: sample sales $208.25, sales before tax $192.38, included tax $7.62, added tax $8.25, full-refund tax $8.25, net recorded tax $7.62. Existing reporting tests cover period/eligibility/refund calculations.
- Browser checks cover empty results, failed-report export prevention, six homepage links, saved-funnel tools, desktop/390px phone rendering, tax anchors, and design-feedback preselection. A delayed-report scroll displacement was found and corrected.

Tax totals remain recorded amounts to review and set aside, not a final amount owed: state remittances and unrecorded/partial refunds are not deducted. No live orders, tax settings, fulfillment settings, payments, or communication records were created or changed for verification.

## Live verification

Published source commit `fc78948` to `https://www.artbyme.studio` through deployment `https://margaret-edmondson-mrjpkmjt7-dotwinholdcos-projects.vercel.app`. Final `npm run build-check` printed **GREEN** after the anchor correction.

Authenticated Chrome checks confirmed the unified dashboard loads without alerts, 90-day filtering displays June 17–September 14, all six design previews and real saved funnels load, Features built starts closed and opens with 26 tool links, pricing and the three mutually exclusive tax choices remain present, and `/admin/sales#sales-tax` reaches `/admin#sales-tax` with its report loaded. The live account currently has no qualifying paid live orders in the checked period; nonzero calculations were verified with labeled sample orders and the reporting test suite.
