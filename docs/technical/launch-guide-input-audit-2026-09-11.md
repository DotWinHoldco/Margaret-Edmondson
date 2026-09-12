# Launch guide input audit — September 11, 2026

Scope: the complete launch modal, its embedded studio product editor, both fulfillment paths, and the platform functions each control calls. Production settings, checklist progress, products, accounts, and orders were not changed by the audit. There was no reset, real payment, printer submission, or email send.

## Input → saved output → platform behavior

| Control | Destination | Effect and verification |
| --- | --- | --- |
| Self-fulfillment switch | `PATCH /api/admin/fulfillment-settings` → `site_settings.lumaprints_enabled` | Inverts the Lumaprints flag using the policy version; selects the matching guide. Checkout resolves new artwork orders to the active route; paid orders retain their snapshot. Both directions tested. |
| Explore either path / Compare paths | Local guide state only | Shows the selected instructions without changing fulfillment or checklist. Tested for no writes. |
| Contact name | `PATCH /api/admin/launch` → `launch_notes.studio_contact_name` | Trims and saves private owner notes while preserving existing account notes. |
| Contact method | Same endpoint → `studio_contact_method` | Records the agreed method; does not send a message or grant access. |
| Costs / turnaround / responsibilities | Same endpoint → `studio_arrangements` | Saves the private agreement. All three fields must be nonempty to complete the contact step. |
| Save contact plan | Notes + `launch_checklist.studio_partner` | Completes and advances only after a successful version-checked write. Failed/stale saves retain the draft. |
| Included vs flat default shipping | Fulfillment-settings endpoint → `studio_shipping_mode` | Included produces zero additional shipping; flat adds the fee for each unit. |
| Default shipping dollars | Same → `studio_shipping_fee_cents` | Converts dollars to integer cents. Chromium verified `$17.25` is valid; API and checkout tests verify `1725`. |
| Default dispatch days | Same → `studio_lead_days` | Nonnegative whole calendar days, maximum 365. Used when product/option lead time is inherited. |
| Alaska / Hawaii coverage | Same → `studio_ship_akhi` | Controls studio destination eligibility in checkout. Provider-integrated shipping retains its own quote rules. |
| Save shipping | Actual policy, then the selected path’s shipping acknowledgement | Reloads current settings before the checklist write; proceeds only after both operations succeed. |
| Product selector | `GET /api/admin/products`, then `/api/admin/products/:id/studio` | Lists active products and loads the selected product’s actual saved profile. Disabled with unsaved edits or a pending save. |
| Original price | Read-only display plus direct `/admin/products/:id/edit` link | Original price remains the existing Base price/variant price. Studio saves do not overwrite it; a blank original price does not block saving other print settings. |
| Studio vs Lumaprints pricing profile | Local editor state | Chooses which saved profile is being edited, independently of the store’s active fulfillment route. |
| Product shipping / flat dollars / lead time | `PATCH /api/admin/products/:id/studio` → `save_studio_product` → product studio columns | Product values override store defaults. Null means inherit. Dollar conversion and downstream resolution tested. |
| Use these defaults for every option | Same RPC → clears each variant’s shipping mode, fee, and lead time | Removes option overrides on Save. Does not change prices or source approvals. |
| Live in my studio | Same RPC → `product_variants.studio_is_active` | Print availability requires a positive studio price, approved source, material, and dimensions. UI/API reject incomplete live print offers. |
| Studio selling price | Same RPC → `studio_price_cents` | Used by storefront and checkout in self-fulfillment; provider retail `price` is preserved. |
| Option name / material / width / height | Same RPC → variant metadata | New sizes are editable. Existing provider options must first be saved as studio-only, matching the RPC’s metadata-editing rule. |
| Option shipping / flat dollars / lead time | Same RPC → variant studio columns | Option overrides product, which overrides store. Verified through customer price display, checkout totals and the order snapshot. |
| Frame / finish | Same RPC → `studio_variant_details.specs.frame` | Private production details; included in the purchased work specification. |
| Source reference | Same → `specs.source` | Private instructions for the owner/contact. Saving a reference does not upload a production file. |
| Print specifications | Same → `specs.instructions` | Frozen into the purchased production specification; not exposed on the storefront. |
| Production-source approval | Same RPC → `studio_source_approved` | Required for a live studio print; can be removed when the offer is disabled. |
| Always fulfill this option myself | Same RPC → `studio_only` | Keeps that option in the studio with Lumaprints on. Newly added studio sizes are locked to self-fulfillment because they have no provider mapping. |
| Add a studio print size | Local draft, then same RPC on Save | Creates an ID, material, dimensions and inactive offer; does not create a provider mapping or submit an order. |
| Lumaprints profile shipping mode / dollars | Same RPC → product `provider_shipping_mode` / `provider_shipping_fee_cents` | Integration, included and flat modes each tested; independent of studio pricing/shipping. |
| Save studio prices & shipping / Save shipping | Same RPC, then reload saved product | Entire product profile saves atomically. Failed saves retain entries. Form inputs freeze while saving; guide completion/navigation wait for the result. |
| Mark completed / unfinished | `PATCH /api/admin/launch` → supported checklist key | Every step on both paths tested. These are owner acknowledgements; they do not configure an external account. `go_live` cannot be forged as an acknowledgement. |
| Use live Stripe payments | `PATCH /api/admin/settings/stripe-mode` → `stripe_test_mode=false` | Uses the actual payment-mode endpoint with the guide’s settings revision. Live secret, publishable key and webhook must be configured. Stale/concurrent writes are rejected. |
| Refresh setup / Check connections again | GET launch + fulfillment settings | Reads current state and connection-presence flags. Contact drafts survive a conflict refresh and can be retried deliberately. |
| Open my store | Local confirmation state | Does not open the shop by itself. |
| Yes, open my store | `PATCH /api/admin/settings/gate` → `gate_enabled=false`, actual `go_live` record | Rechecks the reviewed settings revision, active path acknowledgements, payment and service configuration, and production environment. Both complete paths tested. |
| Keep reviewing | Local confirmation state | Cancels the final confirmation without changing the store. |
| Previous / Next / step navigation / mobile step selector | Local guide cursor | Available after saving/discarding drafts. Does not imply step completion. |
| Close / Continue later / Escape | Current mounted visit only | Does not write the legacy global hidden flag. Unsaved drafts/pending saves prevent accidental loss. |
| Floating Launch guide button | Reloads launch/policy state and opens dialog | Fresh visits still auto-open even if a legacy hidden flag is true. |
| Discard unsaved changes | Remount current editor with saved state | Explicitly discards only the current unsaved draft; no database changes or checklist reset. |
| Tab close / browser reload | Browser `beforeunload` protection | Warns while a draft or product save is pending. |
| Resource links | New-tab links to actual platform routes and provider resources | All internal destinations tested against existing route files, including Products, Settings, Print review, Orders, shop, shipping policy and terms. Selected original editor link checked. |
| Saved Lumaprints credentials disclosure | Admin-only launch notes | Expands/collapses locally; no credential mutation. Never included in fixture data or client source. |

## Corrections made during the audit

- Protected contact, shipping and product drafts from step/product/path changes and closing the guide. Exposed an explicit discard action and browser tab-close protection.
- Connected embedded product save state to the parent guide. A pending or unsuccessful edit cannot be acknowledged as completed accidentally; fields cannot change underneath an in-flight save.
- Made original-price instructions point directly to the selected product’s real editor.
- Matched studio-only controls to database behavior: new sizes cannot pretend to have provider routing, and metadata editing follows the existing saved studio-only rule.
- Added readiness validation for active print material and dimensions, and allowed other settings to save when an original has no selling price yet.
- Added reviewed-version checks and concurrent-write protection to live-payment and final store-opening actions.
- Malformed launch/payment/gate request objects now return validation errors, not unexpected exceptions. An order-submission count failure is surfaced rather than displayed as zero.

## Evidence and limits

`test/launch-wiring.test.tsx` drives real React controls through the production API handlers and their validation, with an isolated database adapter. It then exercises the actual storefront resolver, checkout validation, shipping calculation and purchase snapshot. The adapter does not replace the separate SQL checks.

`node scripts/test-studio-db.mjs` starts a disposable PostgreSQL cluster and executes the studio migration plus `test/sql/studio-invariants.sql`. This verifies transaction behavior, frozen purchases, policy switching/pausing, queue transitions, split shipments, cancellation/refund behavior, original returns and permissions. It never reads application credentials.

`test/launch-guide.test.ts`, `test/launch-entry.test.tsx` and `test/studio-fulfillment.test.ts` cover authorization, stale/concurrent saves, readiness, legacy login entry, route/price restoration, shipping destinations and immutable purchases. Chromium browser review uses `test/ui/launch-preview.html` with sample-only fetch responses, at desktop and mobile widths. Actual external Stripe/printing/notification requests are outside this audit; owner account verification and the real operational rehearsal remain required.

Official Stripe account-setup and testing links were checked against `https://docs.stripe.com/get-started/account/set-up` and `https://docs.stripe.com/testing`; the onboarding URL is the one published by Stripe. Lumaprints’ dashboard URL was also checked. No sign-in or external account mutation was performed.

The historical shared Hide for now control did not write actor attribution. The new guide does not use that global visibility control. This audit cannot reconstruct an unrecorded historical click.
