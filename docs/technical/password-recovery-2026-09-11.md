# Password recovery verification — September 11, 2026

The reset-request form existed, but the auth callback ignored recovery and no page let the user choose a new password. The storefront gate could also intercept email callbacks. The correction completes that flow without changing account credentials or launch settings.

## Flow

1. `/forgot-password` sends the entered email to Supabase `resetPasswordForEmail` with `/auth/callback?type=recovery` as the destination. Failure restores the form; success uses account-neutral wording.
2. The callback exchanges the PKCE code for a session. A recovery request or the auth-js recovery marker redirects to `/reset-password` before the normal role/profile handling. Failed recovery links lead to an actionable error state.
3. The new page verifies the user with Supabase, validates matching passwords (8–200 characters), and calls `auth.updateUser`. It checks the session and account again before submission. Supabase remains authoritative for password policy and authorization.
4. Accounts with an enrolled authenticator must complete TOTP verification if their recovery session has not reached AAL2. A failed challenge never proceeds to the password update. No MFA factors are removed or bypassed.
5. Success clears the password inputs and offers sign-in. Customers and administrators retain the normal role-based sign-in destination.

The gate exempts only the exact login/recovery paths and root auth-code handoff. Storefront, admin, and other routes retain the gate. The completion page is outside the marketing layout so popups and maintenance rendering cannot interrupt it. Existing signed-in password-change API behavior is unchanged.

## Verification

- 29 focused tests cover the request helper, normal/recovery callback routing, redirect protection, invalid/used links, missing/expired/changed sessions, mismatched passwords, policy errors/retry, MFA ordering and failure, and gated-route boundaries.
- Full `npm run build-check`: GREEN. Report: `docs/build-checks/password-recovery-build-check.txt`.
- Isolated Chrome fixtures: desktop and 390px mobile form rendering, MFA completion, expired-link recovery, and reset-request confirmation. No browser errors or horizontal overflow. Fixtures replace Supabase at its client boundary and cannot send email or change accounts.
- Read-only production auth configuration: canonical URL and redirect allowlist include `https://artbyme.studio`; email auth enabled; Resend SMTP host/port, credentials, and sender configured; recovery template uses Supabase's confirmation URL; link expiry 3,600 seconds; minimum password length 8.

## Remaining live verification

No reset email was sent and no real password was changed during this audit. SMTP configuration is verified, but delivery to Margaret's inbox and her completed recovery are not claimed as tested. She should request the newest link at `/forgot-password`, open it in the same browser (PKCE), enter her new password twice, and use her authenticator code when requested.

## Stripe configuration observed during this work

Read-only checks found the production Stripe test secret and test webhook variables present, but no test publishable-key variable. The database payment-mode setting was live (`stripe_test_mode = false`). No payment mode, Stripe keys, launch progress, or business data were changed. Test checkout needs its publishable key before switching to test mode.
