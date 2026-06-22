# Testing

Authored by DotWin

## Required checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run build-check        # runs all of the above plus the DotWin security/RLS/docs gates
```

`green` is whatever `npm run build-check` prints. It is never hand-typed. `build` and `test`
require the project's native toolchain (the installed `node_modules` carry platform-native
binaries for Next/SWC and the test runner), so run the full `build-check` on the developer
machine or in CI, not in a cross-platform sandbox.

## Test layout

- Vitest, config in `vitest.config.ts`, include glob `test/**/*.{test,spec}.{ts,tsx}`.
- Unit/behaviour specs live under `test/` (classes, cv, markdown, page-editor, inventory, etc.).
- Harden regression specs (2026-06-22): `test/require-cron.test.ts`,
  `test/unsubscribe-hardening.test.ts`, `test/email-suppression.test.ts`,
  `test/email-list-unsubscribe.test.ts`, `test/order-fulfillment-db-invariants.test.ts`.
- RLS deny-test: `test/rls/unauthorized-write.test.ts` proves an anonymous client cannot insert
  into `orders`. It is guarded by `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` and skips when
  unset, so it never touches production. Point it at a disposable Supabase branch to run it.

## Test by module

auth · authorization · billing (Stripe checkout + webhook idempotency) · fulfillment ·
Supabase data access + RLS · API routes · forms · email/CRM · error handling.

## Rule

Do not count placeholder tests as meaningful coverage. A DB-guarded test that skips when its
test instance is unset stays honest; it is not a pass.
