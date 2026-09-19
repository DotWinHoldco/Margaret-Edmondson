# Admin access

Authored by DotWin

The client requested removal of authenticator-app two-factor authentication on September 18, 2026.
Admin and artist accounts use their normal sign-in session. No authenticator enrollment,
QR code, verification code, or second-factor challenge is required, including during password recovery.

`requireAdminPage` guards admin pages and `requireAdmin` guards privileged APIs. Both validate
Supabase identity with `getUser()` and require an `admin` or `artist` role from `profiles`.
Signed-out API requests receive 401; other roles receive 403. Pages redirect to sign-in or the
storefront respectively. The request-scoped Supabase client continues to enforce database RLS.
Old `/admin/security/mfa/*` bookmarks redirect to `/admin`.

The `remove_two_factor_auth` migration removes the assurance-level requirement from
`catalog_admin_caller()` and the pricing-cache/audit-log policies, preserving stored-role checks,
existing grants, and atomic catalog audit writes. Historical migrations remain unchanged.

Deploy the app and this migration together. Disable factor enrollment and verification in
Supabase Auth and remove existing factors through the Admin MFA API so password changes do
not retain a provider-side second-factor requirement. No user passwords need to change.

`test/admin-access.test.ts` verifies password-only access, previously enrolled accounts,
role rejection, invalid sessions, metadata spoofing, and safe return paths.
`test/password-recovery.test.tsx` verifies password updates without factor APIs and preserves
invalid-link, expired-session, changed-account, password-policy, and retry coverage.

`test/sql/admin-password-access.sql` checks real password-only admin identities, private-table
visibility, catalog RPC access, non-admin rejection, and restricted grants inside a rolled-back transaction.

Verification on September 18, 2026: `npm run build-check` reported GREEN (typecheck, lint,
tests, build, and required repository gates). The migration rehearsal passed on the linked
project in a rolled-back transaction. An additional live grant-boundary audit reported
pre-existing findings (1 critical, 19 high, 5 null-WITH-CHECK policies); this change preserves
all existing grants. The audit is skipped by the standard runner without management credentials.
