# Known Risks

Authored by DotWin

Open risk and accepted divergences for ArtByME. Full per-finding detail lives in
`audit/ADOPT-2026-06-21/FINDINGS.md`; this file is the current, greppable summary. P0 and all 7
P1 from the 2026-06-21 adopt audit are fixed and live on prod (see `BUILD_LOG.md`
`#harden-2026-06-22`). What remains below is P2/P3 backlog and structural divergence, none of it
release-blocking on its own, all of it gating the first `green`.

## Accepted divergences from the factory standard

These are deliberate. The factory kit overlays a verification and documentation layer; it does
not rebuild this app. Where the kit assumes a structure ArtByME does not use, the divergence is
recorded here rather than forced.

### Module/kernel pattern not used
Severity: low (architectural)
Module: whole app
Description: ArtByME puts privileged logic in about 130 API route handlers, not in the kit's
`src/kernel` + `src/modules/<name>` pattern. The `module-isolation` and `contract` gates
self-skip (no `src/modules`), which is correct for this app.
Current status: accepted; not migrating a working route-handler architecture.
Required fix: none. Re-evaluate only on a major rebuild.
Required check: n/a (gates skip).
Related tag: #divergence-architecture

### Supabase client file layout differs from the kit trio
Severity: low
Module: Supabase data access
Description: The project ships its own `createClient` (cookie/anon) and `createServiceClient`
(service-role) split rather than the kit's `lib/supabase/{browser,server,admin}.ts` filenames.
Functionally equivalent and boundary-correct (`check:boundaries` passes).
Current status: accepted; kit client files were not imported to avoid clobbering working code.
Required fix: none.
Required check: `npm run check:boundaries`.
Related tag: #divergence-supabase-clients

## Current risks (P2/P3 backlog)

### Generated database types missing
Severity: medium
Module: Supabase data access
Description: No `database.types.ts` is committed, so `check:migrations` reports a (non-blocking)
types finding and type-safety against the live schema is weaker than it should be.
Current status: open.
Required fix: generate types from prod and commit at `src/lib/supabase/database.types.ts`;
regenerate in the same commit as any future migration.
Required check: `npm run check:migrations`.
Related tag: #types-missing, #migration-drift

### API route handlers lack intent doc comments
Severity: medium
Module: API routes
Description: The `docs` gate requires an intent doc comment above each `app/**/route.ts` handler
export.
Current status: RESOLVED 2026-06-22 (green-push). All API route handlers now carry an intent doc
comment; `check:docs` reports 0 blocking. 296 non-route exported functions/components remain
undocumented (medium, advisory, non-blocking) and can be cleared opportunistically.
Required check: `npm run check:docs`.
Related tag: #docs-route-intent, #adopt-green-push-2026-06-22

### Migration ledger drift (2026061501–05)
Severity: low
Module: deployment / Supabase
Description: Migrations `2026061501`–`2026061505` are applied on prod (all schema objects exist;
`reprice_variants` reflects the 2026061502 gross-margin formula; `royal` rename applied) but the
prod migration ledger has no rows for them. Schema is not at risk; a from-zero replay driven by
the ledger would skip them. The SQL files are in git and idempotent
(`add column if not exists`, `create or replace`).
Current status: open (verified applied 2026-06-22, read-only).
Required fix: record them with `supabase migration repair --status applied 2026061501 2026061502
2026061503 2026061504 2026061505` (no schema change), or accept and rely on the idempotent files.
Required check: `list_migrations` shows the five versions present.
Related tag: #migration-drift

### Remaining P2 security backlog
Severity: medium (collectively)
Module: API routes · email · Supabase RPC · bookings
Description: Tracked in `audit/ADOPT-2026-06-21/FINDINGS.md`. Cleared in the green-push: all
`select('*')` replaced with explicit columns; webhook verification (shipstation/lumaprints/printful)
upgraded to constant-time `timingSafeEqual`; intentional public writes documented; RLS gate clean.
Still open (none gate-blocking): zod input-validation depth and rate-limit coverage (AZ-2/AZ-3),
email HTML escaping (AZ-5), `reprice_variants` `search_path` pinning and anon grant review (DB-3),
`class_bookings` capacity bypass (DB-5), schema-not-fully-in-git / `database.types.ts` (DB-8),
stale anon grant in a git migration (FIN-3), 5 advisory `: any` annotations, and FIN-4..8 /
COM-4/5/6 items.
Current status: partially resolved; remainder is a dedicated harden pass, each with a regression test.
Required check: `npm run check:security`, `npm run check:rls`, `npm run build-check`.
Related tag: #findings, #reg-financial, #reg-comms, #reg-db

### product_categories RLS now captured in git
Severity: low (resolved-pending-apply)
Module: Supabase / RLS / deployment
Description: Migration `2026061501` created `product_categories` with no RLS; prod had RLS + 4
policies applied out-of-band. Green-push migration `2026062205_adopt_rls_conformance.sql` captures
the RLS enable + 4 policies into git (and tightens carts / unsubscribe_events / social_posts).
Current status: resolved in git; APPLY `2026062205` to prod (idempotent; prod already matches for
product_categories, behavior-preserving for the others), then re-test guest-cart + unsubscribe.
Required check: `npm run check:rls` (0 blocking); `list_migrations` shows `2026062205` after apply.
Related tag: #product-categories-rls-in-git, #adopt-green-push-2026-06-22

### Latent: commission.messages has no backing column
Severity: low
Module: admin / commissions
Description: `src/app/(admin)/admin/commissions/[id]/page.tsx` reads `commission.messages`, which is
not a column on `commissions`; under the prior `select('*')` it was always undefined and the
messages list rendered empty. Behavior is preserved (still empty) via a cast.
Current status: open (cosmetic; the feature was never wired).
Required fix: add a real commission-messages source (table + query) or remove the dead UI.
Required check: judgment.
Related tag: #adopt-green-push-2026-06-22

### Error boundaries: root only
Severity: low
Module: error handling
Description: Root `error.tsx`, `loading.tsx`, and `not-found.tsx` are now present (COM-7), but
high-traffic segments (admin, shop, account) may still want their own boundaries for graceful
degradation.
Current status: partially addressed (root boundaries added 2026-06-22).
Required fix: add segment-level boundaries where a thrown error should not unmount the section.
Required check: judgment + manual review.
Related tag: #com-7-error-boundaries

### Data-exposure hardening (2026-06-25 adversarial audit)
Severity: high (resolved-pending-apply)
Module: Supabase RPC · RLS · API routes
Description: A live adversarial data-exposure audit (`audit/data-exposure-audit-2026-06-25.md`)
confirmed the customer PII/payment tables are RLS-protected, but eight issues at the direct
PostgREST surface: anon/PUBLIC-EXECUTE on the SECURITY DEFINER RPCs (`track_cart` IDOR,
`mark_contact_unsubscribed` zero-authz, `subscribe_to_newsletter`/`upsert_contact_to_list`
oracles + writes, `validate_promo_code_public` enumeration, anon-callable `reprice_variants`),
a `promo_codes` policy readable by any signed-in user, and `site_settings` `USING(true)`.
Fix: privileged DB calls moved to the service-role client behind the route trust boundary;
migration `2026062501_harden_data_exposure.sql` revokes EXECUTE from anon/authenticated on all
sensitive definer functions, restricts `promo_codes`/`site_settings` reads to admins, drops the
broad public INSERT policies, and hardens `track_cart`/`subscribe_to_newsletter`/`reprice_variants`
bodies. Resolves the prior DB-3 (`reprice_variants` search_path + anon grant) and FIN-3 items.
Current status: resolved in git; APPLY `2026062501` to prod, then re-run the audit probes
(anon RPC EXECUTE → permission denied; `promo_codes`/`site_settings` → 0 rows to untrusted roles)
and re-run `get_advisors(security)`.
Required check: `npm run check:rls`, `npm run check:security`, `npm run build-check`; advisors clear.
Related tag: #data-exposure-2026-06-25, #db-3, #fin-3

### Public storage buckets allow object listing
Severity: low (accepted)
Module: storage
Description: Supabase advisor `public_bucket_allows_listing` flags broad `storage.objects` SELECT
policies on the public buckets `about-images`, `library`, `product-images`, `testimonials`,
allowing filename enumeration. Contents are non-sensitive marketing/catalog images (the PII buckets
`commission-references`, `class-pet-photos`, `print-masters`, `shared-files` are private). The
listing policy is left in place because the admin media manager lists these buckets; removing it
without repointing those reads to the service-role client would break listing.
Current status: accepted; low impact (no sensitive payload).
Required fix: narrow the public SELECT policies to per-object access after confirming admin `.list()`
paths use the service-role client.
Related tag: #storage-public-listing

### ShipStation webhook secret transported as URL query param
Severity: low (accepted; vendor-mandated)
Module: webhooks / shipstation
Description: `src/app/api/webhooks/shipstation/route.ts` receives its shared secret as `?secret=`
(ShipStation's only mechanism) and compares it constant-time (`timingSafeEqual`). The secret can
surface in access/proxy logs.
Current status: accepted; ShipStation provides no header/signature option.
Required fix: rotate the secret periodically; optionally add an IP allowlist; ensure the platform
does not log query strings.
Related tag: #shipstation-secret-query

### Auth: leaked-password protection disabled
Severity: low
Module: auth
Description: Supabase advisor `auth_leaked_password_protection` — HaveIBeenPwned check is off, so
compromised passwords are accepted at signup/reset.
Current status: open.
Required fix: enable leaked-password protection in Supabase Auth settings (config, not a migration).
Related tag: #auth-leaked-password

## Format

### Risk

Severity:
Module:
Description:
Current status:
Required fix:
Required check:
Related tag:
