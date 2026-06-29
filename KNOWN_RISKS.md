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

### Domain-cell structure not yet adopted (route-handler monolith)
Severity: low (architectural)
Module: whole app
Description: ArtByME puts privileged logic in ~135 API route handlers, not in the doctrine's
`src/kernel` + `src/domains/<key>` cells. The cell gates (`domain-isolation`, `contract`,
`read-boundary`, `table-ownership`, `atomicity`, `event-boundaries`, `no-duplicate-transactions`)
self-skip without `src/domains/`. Per the 2026-06-24 domain-cell adopt, ownership is now DECLARED
in `src/contracts/` and scored per boundary (`audit/ADOPT-2026-06-24/CONFORMANCE-SCORE.md`):
transaction boundary mostly converted (real RPC owners), context/read boundaries unconverted.
`.dotwin/conformance.json` is `mode: adopt` with a ratchet; `check-rpc-exists` is ACTIVE + passing.
Current status: accepted as a staged conversion, not a rewrite. The write boundary is enforced at
the DB by RLS (the real backstop) meanwhile.
Required fix: none now. `STAGED-REFACTOR-PLAN.md` Stage 3 converts cells domain-by-domain; each
flips its ratchet flag from scored to blocking.
Required check: `npm run check:rpc-exists` (active); cell gates activate when `src/domains/` exists.
Related tag: #divergence-architecture, #domain-cell-conformance

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

### ACID atomicity-of-record gaps (Rule 1 audit, 2026-06-24)
Severity: medium (P2 ×4) — dated exception below
Module: Stripe webhook · fulfillment · admin LMS · AI testimonial import
Description: The 2026-06-24 Rule 1 / ACID audit (`audit/ADOPT-2026-06-24/ACID-REGISTER.md`) found
0 P0, 0 P1, and four P2 multi-table writes that are non-atomic but reconciled today: ACID-1 the
Stripe webhook builds an order from sequential `orders` + `order_items` writes (idempotent +
resume-safe via Stripe redelivery); ACID-2 fulfillment finalizes status after the provider call
(FIN-2 at-most-once holds; residual `submitting` window); ACID-3 admin course delete is four
unguarded cascade deletes (admin-only, re-runnable); ACID-4 AI testimonial import can duplicate on
re-run (admin-only, unpublished). Money paths (booking, promo redemption, enrollment, inventory)
are already atomic via SECURITY DEFINER RPCs.
Current status: ACCEPTED with dated exception through the next scheduled harden (review by
2026-07-31). None release-blocking; each is reconciled in production today.
Required fix: the staged owner RPCs in `audit/ADOPT-2026-06-24/STAGED-REFACTOR-PLAN.md` Stage 1
(`create_order_with_items`, `submit_order_item`, `admin_delete_course`/cascade FKs,
`create_testimonial_from_ai`), each with a failure-injection test before its ratchet flips.
Required check: `npm run check:rpc-exists`; `npm run check:atomicity` (after cells land).
Related tag: #acid-register-2026-06-24, #domain-cell-conformance

### Silent side-write errors (non-ACID, fix backlog)
Severity: low
Module: admin social posts · AI testimonial import
Description: `social/posts/[id]` PATCH (L114, L122) and `shared-files/process-ai` (L315) `await` a
`.delete()/.insert()` without checking `error`, turning a torn write into a silent one. Not a Rule 1
violation; a visibility gap.
Current status: open (backlog).
Required fix: capture + log those errors (Stage 4 of the staged plan).
Required check: judgment + review.
Related tag: #acid-register-2026-06-24

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

### Security hardening sprint (2026-06-25)
Severity: medium (resolved) / low (deferred)
Module: email · API rate limiting · auth · money path · storage
Description: Closed the application-hygiene backlog surfaced by the 2026-06-25 posture
assessment. FIXED: (AZ-5) HTML injection in outbound emails — added `src/lib/email/escape.ts`
`escapeHtml()` and escaped every user-origin value across commissions/contact/class-signup/
Stripe-webhook/welcome/order-confirmation templates; per-user (user-id-keyed) rate limiting on
the authenticated LMS endpoints `lessons/[id]/comments`, `lessons/[id]/progress`,
`courses/[id]/enroll` (rate-limit helper extended with an explicit `key`); constant-time secret
comparison via `src/lib/auth/timing-safe.ts` applied to `fulfillment/submit`,
`fulfillment/retry/[itemId]`, `admin/revalidate`, the `gate` route, and `proxy.ts` (edge-safe
inline compare); Stripe webhook resume idempotency now compares persisted vs expected
order_items count (no partial-order on mid-loop crash); `testimonials` bucket bounded
(migration 2026062502: 10 MB + image mime types).
Current status: resolved in git; deploy + apply 2026062502.
Deferred (low): per-user rate limits on `account/addresses` and `account/wishlist` writes
(RLS-scoped to the user's own rows — self-churn only, no cross-user/cost impact); campaign
`{{first_name}}` placeholder HTML escaping (self-only recipient render); the broader DB-8
schema-not-in-git baseline (incl. `shared-files`).
Required check: `npm run build-check`.
Related tag: #harden-sprint-2026-06-25, #az-5, #az-3, #fin-2

### Storage authorization hardening (2026-06-25, pt. 2)
Severity: medium (resolved)
Module: storage / RLS
Description: A full `storage.objects` policy audit found broad "any authenticated user"
over-grants coexisting with (or replacing) the admin-gated policies. Most significant:
the PRIVATE `print-masters` bucket (high-res master scans — source IP) had
`Auth can read/write/update/delete print-masters` open to every signed-in user — a
non-admin could enumerate + download all 39 master files (verified live, then closed).
Also `product-images` (`Authenticated users can upload/update/delete`) and `testimonials`
(`Auth write testimonials bucket`) allowed any authenticated user to overwrite/delete
catalog + testimonial images. FIXED by migration 2026062504: dropped the print-masters
over-grants (admin-gated `Admin …` policies + service-role fulfillment path remain), and
replaced the product-images/testimonials broad write with admin-gated `Admins manage …`
policies. Migration 2026062503 also dropped the public-read SELECT policies on the four
public buckets to stop anonymous object enumeration (public object URLs are unaffected) —
this supersedes the previously-accepted "public bucket listing" item above.
Verified (rolled-back, then applied): non-admin print-masters/product-images reads → 0;
admin upload/delete path preserved via authenticated-admin + service-role clients.
Required check: `npm run check:rls`, `npm run build-check`; advisor public_bucket_allows_listing clears.
Related tag: #storage-authz-2026-06-25, #print-masters-ip

### Duplicate LumaPrints order if a print item is resubmitted after a lost-response create

Severity: P2 (money) — gated on LumaPrints `externalItemId` dedup, to verify in Phase 5
Module: fulfillment (`src/lib/fulfillment/router.ts`, `/api/cron/fulfillment-worker`)
Description: If `submitOrder` throws AFTER LumaPrints actually created the order (the 2xx response
is lost in transit), the item is marked `failed` with a null `external_order_id`. A later resubmit
of that item could create a second physical print+ship (double cost).
Two of the three sub-cases are now closed by Phase 2 (branch `fix/payment-p2`):
- The DB-write-failure sub-case (provider order created, the `submitted`+`external_order_id` write
  fails) is handled by P2-3: `persistSubmitted` retries the write, then HOLDS the item in
  `submitting` (a non-claimable state) and alerts for reconciliation, so neither the worker nor a
  manual refire re-submits it.
- The order-level `externalId` is no longer the reused `orderId` (P2-5): a single-item submission
  uses `order_items.id`, so the LumaPrints order carries a stable per-item external reference.
The residual case is a genuine lost-response throw that marks the item `failed`. The fulfillment
worker auto-retries `failed` items, so this resubmit is now automatic, not manual-only. Safety
rests on LumaPrints rejecting a duplicate `externalItemId` (documented unique). The submit always
sends `externalItemId = order_items.id`, so a resubmit of the same item carries the same id.
Current status: ACCEPTED pending verification. Bounded (requires a lost 2xx exactly after create)
and mitigated by the stable `externalItemId`; the FIN-2 `submitting` pre-claim still makes the
happy path exactly-once.
Required fix (Phase 5 sandbox): confirm LumaPrints dedupes a repeat `externalItemId` (submit the
same item twice, assert one physical order). If it does NOT, gate the worker's auto-retry to
`pending` only and require a list-by-store+date lookup before resubmitting a `failed` item.
**Human caution:** until verified, check the LumaPrints dashboard before manually refiring a failed
print item.
Related tag: #order-path-verify-2026-06-25, #payment-e2e-phase2, #payment-e2e-phase5

### Transient routing throw can strand paid order items at zero fulfillment submissions

Severity: P3
Module: fulfillment / Stripe webhook (`routeOrderToFulfillment` invoked from `webhooks/stripe`)
Description: `routeOrderToFulfillment` is wrapped in try/catch and the webhook still returns 200.
Per-item failures are caught inside the router (items → `failed`, recoverable), but a throw BEFORE
the provider loop (transient order/items fetch error) leaves items `pending` with no
`external_order_id`. Stripe won't redeliver (already 200'd); a redelivery short-circuits on
`fullyProcessed`; and the Phase 7 status cron keys on `external_order_id`, so it can't see a
`pending` item. Net: rare transient → items stranded until manual `/api/fulfillment/submit`.
Current status: RESOLVED 2026-06-29 (payment E2E remediation Phase 2, branch `fix/payment-p2`).
Fulfillment submission is now decoupled from the webhook into the durable `fulfillment_jobs` queue
drained by `/api/cron/fulfillment-worker`, which (a) re-claims jobs whose `running` row is stale
(crashed worker) and (b) sweeps orders with `pending`/`failed` items lacking a job and enqueues
them (claiming `pending`/`failed` only, never `failed_validation`, to avoid the duplicate-retry
risk below). The webhook short-circuit also requires `side_effects_completed_at` (P2-1), so a
mid-flight crash no longer permanently skips the confirmation email/CRM/Meta either.
Required fix: none (verify end-to-end in Phase 5 sandbox).
Related tag: #order-path-verify-2026-06-25, #payment-e2e-phase2

### G4 print bounds / DPI / fractional pricing are provisional until a sandbox probe

Severity: P3
Module: pricing / fulfillment (`subcategory-bounds.ts`, `size-tiers.ts`, `lib/fulfillment/router.ts`)
Description: Phase 3 (branch `fix/payment-p3`) added the aspect/DPI correctness rails: the dead
`checkImageConfig` is now called pre-submit (P3-1) as a real aspect/DPI net that marks a mismatched
item `failed_validation` and alerts; `loadVariantFulfillability` re-validates variant aspect vs the
cropped master at Live-flip + order time and blocks an unpriced (0-cost) variant (P3-2/P3-7); the
builder only trusts print dims when the master is `ready` (P3-3); the custom-create route creates
as Draft and gates the Live flip on fulfillability (P3-2); the crop master path is versioned so a
re-crop can't overwrite the bytes an order snapshot froze (P3-6). What remains provisional and needs
a live LumaPrints probe (human-gated, Phase 5): the per-subcategory size bounds + `requiredDPI`
(=200) in `subcategory-bounds.ts` are seeded from docs, not a live `GET subcategories` probe; and
fractional (0.05in) custom sizes price through the live cost API but the fractional behavior is not
sandbox-confirmed. `checkImageConfig` + the live products-cost API are the authoritative backstops
meanwhile.
Current status: ACCEPTED; code rails landed, exact bounds/DPI/fractional pricing to confirm in Phase 5.
Required fix (Phase 5 sandbox): reconcile bounds + requiredDPI against a live subcategory probe;
confirm fractional pricing returns a non-zero cost (P3-7 blocks a 0-cost Live variant regardless).
Related tag: #payment-e2e-phase3, #payment-e2e-phase5

## Format

### Risk

Severity:
Module:
Description:
Current status:
Required fix:
Required check:
Related tag:
