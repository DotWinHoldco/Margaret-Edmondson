# Website subscription billing

Authored by DotWin

ArtByME site managers reach `/admin/billing` from the desktop sidebar or Settings
on any screen size. The page explicitly calls the existing server-side admin/artist
guard and links to a dedicated Stripe hosted portal login configuration on DotWin's
main merchant account. Stripe verifies the billing email before exposing a customer,
payment method, or subscription. The shareable login URL is public; it is not an
authenticated customer session and does not grant access by possession.

The portal supports payment-method and billing-detail updates, invoice history, and
cancellation at the end of the paid period. Price switching is disabled. It returns
to `https://artbyme.studio/admin/billing`. The ArtByME site carries no DotWin Stripe
credential, customer ID, card details, or database access for this feature. ArtByME's
own sales Stripe integration is separate and unchanged.

The subscription is managed in DotWin's existing subscriptions screen and mirrored
by its existing Stripe lifecycle webhooks. Current amounts and renewal dates are
displayed by Stripe, rather than hardcoded in ArtByME. SuiteDash's replaced billing
schedule was canceled after the replacement subscription was verified active.

## Release workspace

- Checkout: `workspaces/festive-production` (reused while inactive).
- Branch: `DotWin-cx/margaret-subscription-billing`.
- Owner/task: DotWin, ArtByME subscription billing, November 14, 2026.
- Starting release: `a21f85cec641f1e5df9c765ad541e8a217504403`.
- Retirement: after the billing release is verified, retain source and these docs;
  remove only task-created reproducible build output. No new dependency tree or
  local production build is needed; the production build-check runs on Vercel.

## Security review

The new route performs no billing mutation, accepts no customer ID or redirect URL,
and creates no bearer session. Authentication remains server-side and Stripe's email
verification remains required even if someone obtains the shareable login URL.
The page contains no client component or new dependency. Existing admin authorization
tests and the full release build-check cover the unchanged access mechanism.
