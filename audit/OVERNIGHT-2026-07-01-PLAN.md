# Overnight Hardening — 2026-07-01

Authored by DotWin

Autonomous overnight pass. Goal from the owner: by morning every button is wired
and working, tables/schema match the code, RLS/security is effective, and the whole
platform has a uniform error/success UX — failures show human copy (never
developer/database text), successes confirm loudly (green message) and reload the
correct values. Ideally zero real errors, but genuine failures must fail loudly and
legibly.

Branch: `harden/overnight-2026-07-01` (off `main` @ `90e909b`).
Restore tag: `restore/pre-overnight-2026-07-01` = `90e909b`.

## Ground truth established (2026-07-01)
- Build is GREEN (typecheck/lint/test/build); advisory-only findings remained.
- Security floor is solid: all security migrations are APPLIED to prod (harden_data_exposure,
  storage authz, RLS conformance); every public table has RLS; sensitive SECURITY DEFINER
  RPCs have anon/authenticated EXECUTE revoked; only `is_admin_or_artist` is intentionally
  anon-callable. Advisors: 0 ERROR.
- The real gap is the application UX layer: no toast, no shared banner, no client fetch
  wrapper, no friendly-error map; `respond.ts` existed but only ~40% adopted; ~107 server
  routes leaked raw Postgres/exception text; ~79 client sites rendered raw `.error`; segment
  error/loading boundaries existed only at root.

## Phase 1 — UX foundation (DONE, commit 899ab77)
- `src/lib/errors/friendly.ts` — friendly-error dictionary + `resolveErrorMessage()`.
- `src/lib/api/respond.ts` — `apiFail()/dbFail()` (log real detail, return friendly copy).
- `src/lib/api/client.ts` — `apiFetch()/apiSend()/errorMessage()` (typed ApiError, friendly).
- Toast system (`ToastProvider` + `useToast`) mounted app-wide via shared Providers;
  `StatusBanner` for inline feedback.
- Segment `error.tsx`/`loading.tsx` for admin, shop, account, courses, checkout; `global-error.tsx`.
- Generated `src/lib/supabase/database.types.ts` (closes the missing-types advisory).

## Phase 2 — Correctness audit (in progress)
13 parallel area auditors + synthesis (workflow `artbyme-correctness-audit`). Finds broken
buttons, dead endpoints, schema mismatches, authz gaps, dev-speak leaks, missing success/
reload, and money-path correctness defects.

## Phase 3 — Fix campaign
Disjoint file-ownership agents, one per area. Each: (a) adopts the foundation across its files
— server leaks -> apiFail/dbFail; client alert()/raw setError/raw data.error -> useToast +
errorMessage; add loud success + refresh; (b) fixes the correctness findings for its files.
Each verified; whole-project build-check gates the batch.

## Phase 4 — Adversarial verify + deploy
Adversarial re-review of the changes; full `build-check` green; merge to `main` (auto-deploy);
Vercel READY; advisors re-checked. Human-gated go-live switches (Stripe test mode, activating
print variants/masters) are NOT touched.
