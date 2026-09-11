# Margaret’s launch guide

The guide presents the website as built and awaiting Margaret’s business decisions. It does not invent her contact’s fees, retail prices, production approvals, Stripe identity/bank details, or customer promises. It separates her acknowledgements from service-connection checks.

## Visibility and access

`LaunchSequence` mounts in the shared admin layout, so it opens on a fresh admin visit from any admin page. Closing affects the mounted visit only; a floating **Launch guide** button reopens it. Navigating within the admin workspace retains that session state. The guide ignores the legacy global hidden flag and remains available after the public store opens. MFA enrollment/challenge pages do not display it. The dashboard no longer redirects first-time visitors to the old welcome letter based on browser storage. Existing `/welcome` links redirect server-side to `/admin`, which applies the normal sign-in, role, and MFA checks before showing the current guide. Old welcome-dismissal flags have no effect on the launch guide.

The existing store’s `launch_modal_hidden` was set to `false` on September 11, 2026, making the existing deployed guide visible immediately. The revised guide is for authenticated admin/artist accounts after MFA. Customer accounts cannot read private contact plans, provider sign-in notes, or change fulfillment. No credentials are embedded in the bundle or fixture.

## Two paths

- **Lumaprints fulfillment:** account access, billing, files/crops, retail prices, margins, provider shipping and originals, order handling, Stripe, a provider-specific rehearsal, and public business details.
- **Self-fulfillment with Margaret’s contact:** contact agreement, shipping defaults, studio prices, artwork/specification approval, studio queue operations, Stripe, a studio-specific rehearsal, and public business details.

The fulfillment switch inside the modal uses the existing versioned settings endpoint. Browsing a path does not activate it. Turning self-fulfillment on disables new Lumaprints requests and selects the studio wizard. Existing paid orders preserve their fulfillment route; in-flight provider submissions are called out. Turning Lumaprints back on retains saved studio prices and uses the provider connection requirements already enforced by the settings API.

## Saved decisions and controls

The contact form stores a private name, contact method, and agreement covering costs, turnaround, and responsibilities. Saving does not send messages or invite a helper. The shipping form edits actual store defaults: included shipping or a flat fee **per item**, calendar dispatch lead time, and Alaska/Hawaii coverage. Product and option overrides remain more specific than these defaults. The guide explains that shipping labels and actual postage are handled outside the site.

Studio pricing embeds the same product editor used on Products, explicitly selecting the studio profile. Original prices are edited in the existing Base price field. The guide explains approved sources, print sizes/frames, all-in selling prices, inherited shipping, unavailable offers, and saving each product before acknowledging the pricing step.

Operational guidance covers assignment, tickets/files, production stages, holds, external labels, split packages, tracking, shipment notifications, delivery, refunds, replacements, cancellations, and original returns. It does not claim automatic helper emails or label purchasing.

## Payment and launch readiness

Stripe setup links to official account onboarding and testing guidance. Only presence flags are returned for checkout keys and webhook settings. Account verification/payout readiness still require Margaret’s Stripe Dashboard; a rehearsal verifies the order workflow. Test payments do not automatically sandbox Lumaprints or emails.

The live-payment button requires live secret, publishable, and webhook settings, a completed rehearsal for the active route, and a non-preview deployment. The standalone Stripe mode API also checks all three live settings. The public gate is separately controlled by the final review, which asks for confirmation before removing the visitor password.

Server-side store opening requires the active route’s preparation checklist, live Stripe mode and settings, email configuration, scheduled order processing, and provider credentials when Lumaprints is active. Preview deployments cannot open the shared production store. These are configuration and owner-approval checks, not an assertion that external services were called successfully.

Legacy Lumaprints crop/price/margin acknowledgements do not count as studio setup. Stripe/business details are shared; path-specific pricing, shipping, artwork, workflow, and rehearsal approvals stay separate. The actual gate-opening endpoint records `go_live`; it cannot be forged as an ordinary checklist checkbox.

## Concurrency and verification

Launch notes/checklist saves use `updatedAt` and a database compare-and-set predicate to reject stale or simultaneous settings edits. Updating contact notes preserves existing private provider notes and checklist entries. Gate opening also checks the row version to avoid opening under settings changed concurrently.

`test/launch-guide.test.ts` covers authorization, independent paths, required contact details, allowed note fields, stale/concurrent saves, connection indicators, preview blocking, Stripe key requirements, and actual gate opening. `test/ui/launch-preview.html` runs the actual modal with sample-only fetch handlers for browser verification. It deliberately sets `hidden: true` to prove visibility. No real payments, printer requests, emails, or product changes are needed for those checks.
