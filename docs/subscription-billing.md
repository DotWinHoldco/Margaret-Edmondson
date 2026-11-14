# Website subscription billing

Authored by DotWin

Site managers manage the website subscription inside `/admin/billing`, reached from
the existing sidebar and Settings. The page shows the live plan, renewal date, saved
payment method, invoices and payment history. Card changes and renewal controls stay
in ArtByME, using its existing login. There is no hosted billing portal or second login.

## Trust and money boundaries

`/api/admin/billing` requires the existing verified admin/artist role. It forwards that
user's session only to the fixed DotWin billing endpoint. POST requires the same origin,
JSON and a strict command schema. Callers cannot choose the customer, subscription,
merchant or upstream address. Responses are private and never cached.

DotWin independently verifies the ArtByME session with Supabase Auth and reads the
current profile role under that user's RLS. A configured allowlist and server-owned
subscription/customer binding limit access to the existing authorized site managers.
Only DotWin holds the main merchant credential. ArtByME's sales integration is unchanged.

Card fields use the existing Stripe Payment Element dependency inline. A SetupIntent
verifies the method without a charge; redirect-based methods are disabled. DotWin
accepts only a succeeded, recent setup owned by this actor, customer and subscription,
then idempotently updates the subscription's default payment method. Raw card details
never touch either application server. Renewal controls change only cancellation at
period end, leaving the paid service period and billing anchor intact. Existing DotWin
subscription lifecycle webhooks own the mirror and audit records.

Invoice downloads stay on ArtByME. DotWin verifies invoice ownership before fetching
the PDF from permitted Stripe hosts. Payment history includes completed payments with
the subscription's unchanged description. Existing billing is not migrated or charged
by opening this page.

## Verification and release workspace

Adversarial tests cover unauthorized and cross-origin requests, caller-selected IDs,
session mismatch, current-role checks, setup ownership, idempotency and invoice scope.
UI tests cover the cancellation confirmation and inline card flow. Run the full
`npm run build-check` for release, then verify the live page and card fields without
changing the customer's card or renewal setting.

Reused checkout: `workspaces/festive-production`, branch
`DotWin-cx/margaret-subscription-billing`. Owner/task: DotWin, native ArtByME billing.
Retain source/docs after release; remove only task-created inactive generated output.
Remote production builds reuse the existing dependencies and avoid local build output.
