# Adopt Audit — Consolidated Findings Register

Authored by DotWin
Project: Margaret-Edmondson (ArtByME) — Next.js 16.2 App Router · Supabase · Stripe · Resend · LumaPrints/Printful fulfillment
Baseline SHA: `5dda51840fbf21f8622e65f34f769bb6efff00ea` (clean tree, local == origin)
Date: 2026-06-21
Supabase prod project: `klwkajukicsoiwpsgftt` (MargaretEdmondson)

## Method

Security-first, invariant-first audit (factory `ultimate-audit-protocol`, phases 0-12) run by four
independent read-only reviewers. Each reviewer's detail lives in `registers/`. The highest-impact
findings were re-verified against **live prod** (not just migrations), because the schema-of-record
is the live DB, not git (see DB-8). Pure-JS gates were run on the mount.

Detail registers:
- `registers/01-identity-authz-ingress.md` (phases 1,2,4)
- `registers/02-database-rls-storage.md` (phase 3)
- `registers/03-financial-integrity.md` (phase 5)
- `registers/04-comms-crons-reliability-arch.md` (phases 1,6,8,9)

## Baseline gate evidence (2026-06-21)

| Gate | Result | Notes |
|---|---|---|
| typecheck (`tsc --noEmit`) | PASS | 0 errors |
| lint (`eslint .`) | PASS | 0 errors, 53 warnings (unused vars, `<img>` vs `next/image`) |
| test (`vitest`) | NOT RUN here | sandbox node_modules is macOS-arm64; native binding fails on Linux. Run on native/CI. |
| build (`next build`) | NOT RUN here | same platform constraint + multi-minute build exceeds sandbox limits. Run on native/CI. |
| Supabase security advisors | captured | all WARN, no ERROR (see register 02) |

Authoritative `build-check` (test + build + custom gates) must run native — on the user's machine
or CI — after spawn-kit import. No `green` claim until it passes.

## Severity summary (post prod-verification)

| Severity | Count (live) | IDs |
|---|---|---|
| P0 | 1 | FIN-1b |
| P1 | 7 | FIN-1, FIN-2, AZ-1, DB-2, COM-1, COM-2, COM-3 |
| P2 | ~11 | AZ-2, AZ-3, AZ-5, DB-3, DB-5, DB-6, DB-8, FIN-4..FIN-8 (recon/ShipStation), COM-4, COM-5, COM-6 |
| P3 | ~10 | FIN-3 (git-only), COM-7, DB-4, DB-7, DB-9, lint warnings, CLAUDE.md AI refs (authorship), others in registers |

FIN-3 was **downgraded to P3 (git-hygiene)**: `record_order_for_contact` is `service_role`-only on
prod (`anon=false,auth=false`, verified); the git migration `20260522_crm_anon_rpcs.sql` still grants
anon — stale git, not a live exposure. Fix git when reconciling DB-8.

## P0 — stop-ship (1)

**FIN-1b · Duplicate orders on Stripe retry (embedded Payment Elements path)**
- Evidence: `src/app/api/webhooks/stripe/route.ts:542-603`; prod `orders` has UNIQUE on
  `stripe_checkout_session_id` only — **no constraint and no index on `stripe_payment_intent_id`**
  (verified live 2026-06-21). The `23505` idempotency branch is therefore unreachable for the
  Elements flow.
- Impact: two `payment_intent.succeeded` deliveries → duplicate order + double fulfillment submission
  + double confirmation email.
- Fix: add `UNIQUE (stripe_payment_intent_id)` on `orders` (partial unique where not null), then the
  existing `23505` guard works. Migration + prod apply.
- Regression test: insert two orders with same `stripe_payment_intent_id` → expect constraint
  violation; webhook handler test: deliver the same `payment_intent.succeeded` twice → one order.

## P1 — fix before release (7)

**FIN-1 · Non-idempotent one-shot order side-effects on resume/concurrency**
- `src/app/api/webhooks/stripe/route.ts:300-312,387-412,424-493`; `order_items` has only a pkey
  (verified live — no `(order_id,product_id,variant_id)` unique). Short-circuit only checks "order
  has >=1 item", so a re-delivery re-runs the item loop + confirmation email + `recordOrder` CRM
  totals + Meta Purchase + owner email.
- Fix: `UNIQUE order_items(order_id,product_id,variant_id)` + upsert; gate side-effects on an atomic
  `processing -> confirmed` status transition.
- Test: replay the same event twice → exactly one set of items + one email + one CRM revenue bump.

**FIN-2 · Fulfillment provider double-submit**
- `src/lib/fulfillment/router.ts:382-479,536-687`. Provider order is created BEFORE the local
  `submitted` write; a lost write / function kill / webhook retry / `order_failed -> pending` revert
  resubmits a second real order to LumaPrints/Printful.
- Fix: atomically pre-claim the item to `submitting` before the provider call; send/check a provider
  idempotency reference; write `external_order_id` in the same statement as `submitted`.
- Test: simulate retry after provider call but before local write → no second provider submission.

**AZ-1 · Cron auth bypass when `CRON_SECRET` is unset**
- `src/app/api/cron/*/route.ts` (7 routes; e.g. `abandoned-cart/route.ts:25-28`). Compares
  `Authorization` to `Bearer ${CRON_SECRET}` with no unset-guard → if env missing, `Bearer undefined`
  authenticates to discount-mint / bulk-email / booking-expire / publish routes.
- Fix: shared `requireCron()` that fails closed when `CRON_SECRET` is unset, using `timingSafeEqual`.
- Test: unset `CRON_SECRET` → cron routes return 401/500, never 200.

**DB-2 · Newsletter subscriber list readable by any authenticated user**
- Live policy `newsletter_subscribers."Authenticated can read..."` `USING (auth.role()='authenticated')`.
  Every other PII table is admin-scoped; this one leaks the full email list to any logged-in customer.
- Fix: drop that policy; replace SELECT with `is_admin_or_artist()`.
- Test: RLS deny-test — authenticated non-admin `select` on `newsletter_subscribers` → 0 rows.

**COM-1 · One-click unsubscribe non-functional (RFC 8058)**
- `src/lib/email/shell.ts:20-27` + `send.ts:14,30-44`. The one-click POST handler exists but no
  `List-Unsubscribe` / `List-Unsubscribe-Post` header is ever emitted → Gmail/Yahoo bulk-sender
  compliance + deliverability risk.
- Fix: set both headers in `renderAndSend` / cart sends via `buildUnsubscribeUrl()`.
- Test: render a marketing send → assert both headers present and URL resolves to the handler.

**COM-2 · Suppression not enforced on all send paths**
- `src/app/api/cron/abandoned-cart/route.ts:121-273` (+ `send.ts`/`render.ts`). Suppression
  (`crm_contacts.status`) is checked in only 2 paths (`email-automations:51-61`,
  `email-campaigns-send:92-98`); abandoned-cart 1h/24h/72h + trigger/transactional sends skip it →
  unsubscribed contacts still receive mail.
- Fix: central `isSuppressed` gate in the send path; transactional opt-out honored.
- Test: mark a contact unsubscribed → abandoned-cart cron skips them.

**COM-3 · Unsubscribe token secret degrades to forgeable value**
- `src/lib/email/unsubscribe.ts:6-10,49-54`. Secret falls back
  `UNSUBSCRIBE_SECRET -> CRON_SECRET -> RESEND_API_KEY -> hardcoded dev string`; legacy tokens with no
  `t` never expire. Forgeable token = mass/targeted unsubscribe.
- Fix: fail closed if no dedicated secret; drop the no-timestamp "accept forever" branch.
- Test: token signed with the hardcoded fallback is rejected in prod config.

## P2 — dated exception or fix (selected; full detail in registers)

- **AZ-2** — `checkout`, `checkout/intent`, `pixel`, `lessons/progress`, `lessons/comments`,
  `commissions` parse `request.json()` with no zod (no confirmed price exploit; checkout re-prices
  from DB). Add schemas + length/range caps.
- **AZ-3** — `lessons/[id]/comments` POST and `courses/[id]/enroll` lack rate limits.
- **AZ-5** — `commissions` + class-signup interpolate client free-text into owner-notification HTML
  email without escaping (markup/phishing into owner inbox).
- **DB-3** — `reprice_variants` SECURITY DEFINER has mutable search_path AND is anon/auth-executable
  on prod (verified). Pin `search_path=''`; review whether anon EXECUTE is intended (revoke if not).
- **DB-5** — four public `WITH CHECK(true)` INSERTs incl. **class_bookings capacity-bypass** (direct
  insert skips `book_class_session` FOR UPDATE). Revoke public INSERT on class_bookings + newsletter;
  rate-limit carts/commissions.
- **DB-6** — anon SECDEF RPCs trust caller-supplied IDs; anon insert on `unsubscribe_events`.
- **DB-8** — base schema (`is_admin_or_artist`, base tables, 3 buckets) exists only on prod, NOT in
  git → **replay-from-zero is broken**. Capture prod schema into a baseline migration.
- **FIN-4..FIN-8** — no money-reconciliation job; provider revert re-arms resubmit; ShipStation
  outbound path is dead-by-design (document); see register 03.
- **COM-4** — public `pixel/event` accepts unauth event injection (rate-limited/allow-listed/hashed).
- **COM-5** — `meta-event-sync` has no atomic row-claim (mitigated by Meta event_id dedupe).
- **COM-6** — contact-form-only contacts get the marketing newsletter footer (consent
  misrepresentation).

## P3 — backlog (selected)

- **COM-7** — no `error.tsx` / `loading.tsx` / `not-found.tsx` anywhere (incl. root + `global-error`).
- **FIN-3** — git migration grants `record_order_for_contact` to anon; prod already revoked. Fix git.
- **DB-4** — `site_settings` world-readable (verified holds no secret columns).
- **DB-7** — migration prefix scheme inconsistent (10-digit `2026061501` vs 14-digit timestamps);
  sorts correctly today but fragile.
- **DB-9** — `testimonials` bucket has no `file_size_limit`.
- **Authorship** — root `CLAUDE.md` contains AI-assistant references (factory authorship rule forbids
  AI-tool references in spawned/client projects). Replace with the compact rule pack on kit import.
- Lint: 53 warnings (unused vars; `<img>` -> `next/image`).

## Prior-audit reconciliation (June 8-10, ~11 days stale)

Reviewers verified the prior `audit/findings/A-G` against current code:
- A-security: A-1/A-2/A-5 (no middleware / unguarded admin) CLOSED by proxy + 92/92 `requireAdmin`;
  A-3 (webhooks on anon client) CLOSED (5/5 use service client); A-4 (unauth order leak) CLOSED;
  A-6 (Resend sig stub) CLOSED (svix + hard-fail); A-11/12/13 (rate limits) CLOSED.
- B-payments: 19 of ~20 findings (B-1..B-16, B-18..B-20) verified FIXED in current code. Residual risk
  moved to the newer embedded-Elements flow (FIN-1b) + cross-cutting idempotency (FIN-1/FIN-2).
- DB over-grants (lock_security_definer_grants, pii_buckets_private, policy_less_table_rls,
  lock_handle_new_user) verified applied on prod.

## Remediation order for `harden` (next session)

1. FIN-1b (P0) — `UNIQUE(stripe_payment_intent_id)` migration + prod apply + webhook test.
2. FIN-1 / FIN-2 — order_items unique + status-transition gate; fulfillment pre-claim + idempotency ref.
3. AZ-1 — shared `requireCron()` fail-closed.
4. DB-2 — newsletter SELECT -> admin-only (migration + prod apply + RLS deny-test).
5. COM-1 / COM-2 / COM-3 — List-Unsubscribe headers, central suppression gate, fail-closed token secret.
6. P2 batch — zod schemas, rate limits, email HTML escaping, reprice_variants search_path/grant, DB-5.
7. Each P0/P1 gets a regression test before it is marked closed.
8. Reconcile prod<->git: apply pending migrations `2026061501..2026061505` to prod; capture prod base
   schema into git (DB-8); fix stale anon grant in git (FIN-3).
