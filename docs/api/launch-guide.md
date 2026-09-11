# Launch guide API

All endpoints require the existing admin/artist role and MFA checks. Database work uses the request-scoped RLS client. The guide does not broaden access for ordinary customer logins.

## GET /api/admin/launch

Returns selected fulfillment/payment modes, checklist progress, legacy hidden flag, visitor gate status, private owner notes, settings `updatedAt`, missing preparation steps, safe connection-presence booleans, blockers, and `readyToGoLive`.

Connection indicators contain no environment values. Notes may contain private provider sign-in details and must remain confined to the authorized admin workspace.

## PATCH /api/admin/launch

Accepts any supported combination of:

- `updatedAt`: the last read settings timestamp. A mismatch returns `409 SETTINGS_CHANGED`.
- `step`, `done`: a known preparation key and boolean. `go_live` is rejected; only opening the visitor gate records launch.
- `notes`: string fields `studio_contact_name`, `studio_contact_method`, and `studio_arrangements`, each at most 4,000 characters. Values are trimmed and merged without replacing existing private notes. Completing `studio_partner` requires all three nonempty fields.
- `hidden`: legacy boolean, retained for older clients. The revised guide ignores global hiding and never sends this field when dismissed.

A database compare-and-set on `updated_at` protects all writes even when the optional client timestamp is omitted. Concurrent changes return `409` without overwriting progress or notes. Validation failures return `400`; unauthorized requests return the existing auth response.

## Existing fulfillment and product endpoints

The modal switch and shipping wizard call `PATCH /api/admin/fulfillment-settings` with the existing full policy and version. Studio product pricing calls the existing product studio endpoint. See [Studio fulfillment API](studio-fulfillment.md). These edits affect the store’s saved settings even when performed from a preview connected to the same database.

## PATCH /api/admin/settings/stripe-mode

Selecting live payments now requires a nonempty live secret key, publishable key, and payment-confirmation webhook secret. Missing values return `400` before changing settings. This detects configuration presence, not Stripe account verification or charges being enabled.

## PATCH /api/admin/settings/gate

Opening a closed visitor gate (`enabled: false`) requires the selected fulfillment path’s preparation acknowledgements and production connection readiness. Missing decisions return `409 LAUNCH_INCOMPLETE`; a preview deployment, test payment mode, or missing required connections returns `409 LAUNCH_CONNECTIONS_INCOMPLETE` with a blocker list.

The endpoint reads and conditionally updates the same settings version. A concurrent change returns `409 SETTINGS_CHANGED`. A successful opening records `go_live`, removes the password gate, and invalidates the local gate cache. Other deployed instances converge under the existing cache TTL.
