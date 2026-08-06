# Admin Multi-Factor Authentication

Authored by DotWin

Every route on the admin surface requires an admin/artist role **and** a session that has been
stepped up to `aal2` with a TOTP authenticator. A password-only (`aal1`) session reaches nothing
under `/admin` and nothing under `/api/admin`.

Supabase Auth issues and verifies the factors; the app never stores a secret. Enforcement is
server-side only, so no client state influences the outcome.

## The decision

`src/lib/auth/mfa-policy.ts` holds the whole matrix in one pure function,
`decideAdminAccess({ isAdmin, aal, hasVerifiedTotpFactor })`.

| isAdmin | verified TOTP factor | session `aal` | decision    | effect                                          |
| ------- | -------------------- | ------------- | ----------- | ----------------------------------------------- |
| false   | any                  | any           | `deny`      | existing rejection (403 for API, `/` for pages)  |
| true    | false                | `aal1`        | `enroll`    | must register an authenticator                   |
| true    | false                | `aal2`        | `enroll`    | stale claim after unenrolment: register again    |
| true    | true                 | `aal1`        | `challenge` | must verify a code                               |
| true    | true                 | `aal2`        | `allow`     | request proceeds                                 |

Two properties are deliberate:

- **Fail closed.** An assurance level that cannot be read normalises to `aal1`
  (`normalizeAal`), and an `aal2` claim with no surviving factor is treated as unprotected
  rather than trusted.
- **Never strand an admin.** Supabase rejects a new enrolment on an `aal1` session that already
  owns a verified factor, so a false "no factor" reading would lock an admin out with no way
  back. `readAdminMfaState` therefore also accepts Supabase's `nextLevel === 'aal2'` as evidence
  of a factor: the worst case is one extra click on the step-up screen, which is recoverable,
  instead of a wedge, which is not.

## Enforcement points

There are exactly two, and both read their verdict from `decideAdminAccess`.

| Surface           | Where                                             | On `challenge`                    | On `enroll`                       |
| ----------------- | ------------------------------------------------- | --------------------------------- | --------------------------------- |
| Admin pages       | `src/app/(admin)/layout.tsx` → `requireAdminPage`  | redirect to the verification page | redirect to the enrolment page    |
| `/api/admin/*`    | `src/lib/auth/require-admin.ts` → `requireAdmin`   | `401 { code: 'mfa_required' }`    | `401 { code: 'mfa_enrollment_required' }` |

- The `(admin)` group has a single server layout, so every admin page inherits the gate; no page
  carries its own copy.
- All 98 handlers under `src/app/api/admin` already call `requireAdmin`, as do the privileged
  handlers under `/api/fulfillment` and `/api/commissions`. Adding MFA to that one helper covered
  every one of them.
- API callers are never redirected. The 401 body carries `error`, a machine-readable `code`, and
  `mfaPath`, so admin UI can send the operator to the screen that resolves the block.
- The proxy (`src/proxy.ts` → `updateSession`) still filters `/admin` for a signed-in admin role.
  That is an optimistic filter that saves a render; it is not the authority.

### Reading the session state

`src/lib/auth/mfa-server.ts` turns a request-scoped Supabase SSR client into the two facts the
matrix needs:

- `aal` comes from `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`, which reads the `aal`
  claim off the session access token and costs no round trip. The claim is trustworthy at that
  point because both guards call `supabase.auth.getUser()` first, which has the auth server
  validate the same token: a forged or tampered token never reaches the MFA check.
- `hasVerifiedTotpFactor` comes from the factor list attached to that validated user, falling
  back to `supabase.auth.mfa.listFactors()` when the auth server did not attach one.

## The two flows

Both pages live in their own route group, `src/app/(admin-mfa)/`, while still resolving to
`/admin/security/mfa/*`. They therefore render *outside* the `(admin)` layout and cannot be
bounced back onto themselves by the guard that sent the admin to them. Loop safety is structural,
not a path exclusion that could be misconfigured.

They are not unguarded: each calls `requireAdminForMfaFlow`, which demands the same authenticated
admin identity and stops only short of the MFA verdict. Each page then re-runs
`decideAdminAccess` and forwards to the other screen (or to the destination) when the admin does
not belong on it, so a stale bookmark cannot start a second enrolment or ask for a code that is
not owed.

### Enrolment (`/admin/security/mfa/enroll`)

1. Any `unverified` TOTP factor left over from an abandoned attempt is unenrolled first
   (`unverifiedTotpFactorIds` → `mfa.unenroll`). Without this, a closed tab would block every
   later attempt.
2. `mfa.enroll({ factorType: 'totp', issuer: 'ArtByME' })` returns the QR code (an inline SVG
   data URL) and the shared secret. Both are shown, so an admin who cannot scan can type the key.
   A friendly-name collision retries once without a label rather than failing.
3. `mfa.challenge` then `mfa.verify` activate the factor. Supabase promotes the session to `aal2`
   and the browser client writes the new token to the auth cookies.
4. The admin is returned to the path they were originally heading for.

Errors surface inline with a "Start over" action that re-runs step 1, so no state can be reached
that the admin cannot retry out of.

### Step-up (`/admin/security/mfa/verify`)

1. The verified factor id is read from Supabase at page load rather than passed in, so a factor
   removed in the meantime surfaces as an actionable "no authenticator registered" screen with a
   link to enrolment.
2. A fresh `mfa.challenge` is created per attempt (challenges expire), then `mfa.verify` promotes
   the session to `aal2`.
3. The admin is returned to the original path.

### Return paths

The `(admin)` layout cannot see the URL it is rendering, so `updateSession` stamps
`pathname + search` onto the upstream request headers as `x-artbyme-path`
(`src/lib/navigation/request-path.ts`). The proxy overwrites that header on every request it
handles, so a client-supplied value never survives, and the guard sanitises it anyway:
`safeAdminReturnPath` layers two further rules on top of `safeInternalPath`, requiring the target
to sit under `/admin` and refusing anything inside `/admin/security/mfa`.

## Operational notes

- TOTP is enabled project-side on Supabase `klwkajukicsoiwpsgftt`. No migration or schema change
  is involved: factors live in `auth.mfa_factors`.
- This is a hard cutover. Every existing admin hits the enrolment screen on their next admin
  request and cannot proceed until a factor is active.
- Losing an authenticator requires an account owner to clear the factor from the Supabase
  dashboard (Authentication → Users → the user's MFA factors). The account can then enrol again.
- Only TOTP is enforced. If phone factors are ever enabled, `hasVerifiedTotpFactor` and the
  enrolment page will need to account for an admin whose only verified factor is a phone.

## Tests

- `test/admin-mfa-policy.test.ts` covers every cell of the matrix plus the AAL and factor-shape
  parsers, the return-path sanitiser, and the redirect/error-body builders.
- `test/admin-mfa-state.test.ts` covers `readAdminMfaState` against stubbed Supabase payloads,
  including the `listFactors` fallback and the fail-safe paths.
