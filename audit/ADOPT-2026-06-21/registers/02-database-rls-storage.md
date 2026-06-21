# ADOPT Register 02 — Database / RLS / Storage

Project: Margaret-Edmondson (Supabase project `klwkajukicsoiwpsgftt`)
Phase: 3 (Database & storage). Mode: READ-ONLY audit.
Date: 2026-06-21. Authored by DotWin.

Ground truth = LIVE PROD (queried read-only via `pg_proc` / `pg_policy` / `storage.buckets`)
cross-checked against `supabase/migrations/*.sql` (42 files) and the ~11-day-stale prior
register `audit/findings/A-security.md` + `audit/00-backend-reference.md`.

---

## POSTURE SUMMARY

Database RLS posture is **strong**. Every table in `public` has RLS enabled (0 tables with
RLS off; verified `pg_class.relrowsecurity`). There are **0 RLS-enabled-but-policy-less
tables** (the prior A-14/F-3 fix in `2026060803_policy_less_table_rls.sql` held on prod).
Customer-owned data (orders, order_items, carts, profiles, addresses, wishlist_items) is
correctly scoped to `auth.uid()`; back-office data is gated by `is_admin_or_artist()`.

Two material caveats remain:
1. **`newsletter_subscribers` SELECT is open to ANY authenticated user** (`auth.role() =
   'authenticated'`), not just admins — a logged-in customer can read the entire email
   subscriber list (DB-2, P1 PII).
2. **`reprice_variants` is the one SECURITY DEFINER function with no pinned `search_path`**
   on prod (DB-3, P2) — matches live advisor `function_search_path_mutable`.

The 4 advisor-flagged `WITH CHECK (true)` INSERT policies (carts, class_bookings,
commissions, newsletter_subscribers) are **real but low-to-moderate risk**: they are
intentional public-submission funnels, RLS still blocks reading others' rows, and the
columns an attacker controls are non-privileged (no status/role/price escalation).
Compensating app-layer validation exists but rate-limiting is the gap. See DB-5.

**Important brief correction:** the brief names "newest not-yet-on-prod" migrations
`2026061601_variant_custom_sizing.sql` and `2026061602_retire_legacy_print_variants.sql`.
**Neither file exists in the repo.** The two newest migrations are
`2026061504_rename_sometime_to_royal.sql` and `2026061505_product_image_crop_original.sql`,
both **non-destructive** (UPDATEs + `ADD COLUMN IF NOT EXISTS`). There is **no
"retire legacy print variants" migration and no destructive DROP/TRUNCATE anywhere** in
the 42 files. The 10-digit vs 14-digit prefix replay concern (DB-7) is still valid as a
naming/ordering observation but no destructive op rides on it.

**Schema-of-record gap (DB-8, P2 process):** core objects — `is_admin_or_artist()`,
`increment_funnel_metric()`, and base tables `carts`, `orders`, `order_items`, `profiles`,
`class_sessions`, `class_bookings`, `commissions`, `newsletter_subscribers`, `testimonials`,
`artwork_funnels`, and buckets `product-images`/`testimonials`/`shared-files` — are **not
created by any migration in git**. They exist only on the live DB (dashboard / pre-git
baseline). A replay-from-zero of `supabase/migrations/` will NOT reproduce prod. Verified
by `grep` (no `create ... function is_admin_or_artist`, no `create table ... carts`, no
`storage.buckets` insert for product-images/testimonials).

---

## TABLE -> RLS COVERAGE MATRIX (live prod, public schema)

Legend: RLS = row security enabled. Roles column omitted because **every policy on prod has
empty `polroles` = applies to PUBLIC (all roles)**; access is differentiated by the
predicate, not the role grant. "owner" = `auth.uid() = profile_id/id`. "admin" =
`is_admin_or_artist()`.

| Table | RLS | SELECT | INSERT | UPDATE | DELETE | PII? | Verdict |
|---|---|---|---|---|---|---|---|
| profiles | yes | owner | (none — via handle_new_user trigger) | owner | — | yes (role) | OK |
| orders | yes | owner | admin | admin | admin | yes | OK (writes via service_role webhook) |
| order_items | yes | own-order subquery | admin | admin | admin | yes | OK |
| carts | yes | owner (`auth.uid()=profile_id`) | **WITH CHECK(true)** | owner | — | yes (email,items) | DB-5 (anon insert) |
| addresses | yes | owner | owner | owner | owner | yes | OK |
| wishlist_items | yes | owner | owner | — | owner | low | OK |
| commissions | yes | admin | **WITH CHECK(true)** | admin | admin | yes (name,email,refs) | DB-5 |
| class_sessions | yes | published OR admin | admin | admin | admin | no | OK |
| class_bookings | yes | admin | **WITH CHECK(true)** | admin | admin | yes (name,email,phone,pet photos) | DB-5 |
| newsletter_subscribers | yes | **`auth.role()='authenticated'`** | **WITH CHECK(true)** + admin | admin | admin | yes (emails) | **DB-2 (P1) + DB-5** |
| crm_contacts | yes | admin | admin-only (anon policies dropped 20260522) | admin | admin | yes | OK (writes via SECDEF RPC) |
| contact_lists / _members | yes | admin | admin (anon dropped) | admin | admin | low | OK |
| promo_codes / _redemptions | yes | admin | admin | admin | admin | low | OK (writes via SECDEF) |
| unsubscribe_events | yes | admin | **anon WITH CHECK(true)** (live) | — | — | yes (email,ip,ua) | DB-6 (low) |
| testimonials | yes | `true` (public read) + admin | admin | admin | admin | name only | OK (public-by-design) |
| artwork_funnels | yes | `is_published` OR admin | admin | admin | admin | no | OK |
| site_settings | yes | `true` (public read) | service_role/admin | service_role/admin | — | biz config | OK (DB-4 minor) |
| cv_settings / cv_entries | yes | `true` / `is_published` | admin | admin | admin | artist email | OK |
| audit_log | yes | admin | admin | — | — | internal | OK (2026060803) |
| webhook_logs / meta_events | yes | admin | (service_role) | — | — | internal | OK |
| commission_milestones | yes | admin | admin | admin | admin | internal | OK |
| media_library, master_artworks, email_* , page_revisions, social_* , lumaprints_* | yes | admin (some public-read config) | admin | admin | admin | low | OK |

No RLS-enabled-but-policy-less tables (verified). No RLS-disabled public tables (verified).

---

## SECURITY DEFINER FUNCTIONS (live prod verdicts)

All 9 advisor-named functions audited against live `pg_proc` (prosecdef, proconfig, proacl).

| Function | SECDEF | search_path (prod) | EXECUTE grants (prod) | Verdict |
|---|---|---|---|---|
| `is_admin_or_artist()` | yes | `public` (pinned) | **authenticated, service_role** | **safe** |
| `book_class_session(...)` | yes | `''` (pinned) | anon, authenticated, service_role | safe |
| `increment_funnel_metric(uuid,text)` | yes | `public` (pinned) | anon, authenticated, service_role | safe |
| `mark_contact_unsubscribed(...)` | yes | `''` (pinned) | anon, authenticated, service_role | safe* |
| `subscribe_to_newsletter(...)` | yes | `''` (pinned) | anon, authenticated, service_role | safe |
| `track_cart(...)` | yes | `''` (pinned) | anon, authenticated, service_role | safe* |
| `upsert_contact_to_list(...)` | yes | `''` (pinned) | anon, authenticated, service_role | safe |
| `validate_promo_code_public(...)` | yes | `''` (pinned) | anon, authenticated, service_role | safe |
| `reprice_variants(uuid,uuid)` | yes | **(none — unpinned)** | authenticated, service_role | **pin-search_path** |

Extra SECDEF functions found (not in the 9 but relevant): `handle_new_user()` (service_role
only, role hardcoded 'customer' — no priv-esc), `record_order_for_contact(...)`
(service_role only — prior over-grant fixed by `2026060804`), `reserve_original(...)`
(service_role only), `rls_auto_enable()` (service_role only, `search_path=pg_catalog`).

Notes:
- **`is_admin_or_artist()` body (verified on prod):** `select exists(select 1 from
  public.profiles where id = auth.uid() and role in ('admin','artist'))` — STABLE, returns
  false for anon. The live advisor "executable by anon" and the comment in
  `2026060804_lock_security_definer_grants.sql:6-15` ("INTENTIONALLY left anon-callable")
  are **STALE**: prod has already REVOKEd anon (grants are authenticated+service_role only).
  This is the safest possible state — no finding, but flag the doc/advisor drift.
- **`reprice_variants` (DB-3):** `pg_get_functiondef` confirms `SECURITY DEFINER` with **no
  `SET search_path`**. References unqualified `product_variants`, `products`, `categories`,
  `site_settings`. Not anon-callable (authenticated+service_role), so exploit needs an
  authenticated session that can also create a shadowing object — narrow, hence P2 — but it
  is the lone deviation from the project's `search_path=''` standard and matches the live
  advisor `function_search_path_mutable`.
- **`track_cart` / `mark_contact_unsubscribed` (safe*):** both anon-callable and trust
  caller-supplied IDs (`p_cart_id`, `p_contact_id`) with no DB-side ownership/token check.
  `track_cart` lets an anon caller who guesses a cart UUID overwrite its items/email — UUIDs
  are unguessable so practical risk is low (DB-6). `mark_contact_unsubscribed` relies on the
  `/api/unsubscribe` route to verify an HMAC token BEFORE calling; the DB does not enforce
  it, so a direct anon RPC call with an arbitrary `p_contact_id` can unsubscribe that contact
  and write an `unsubscribe_events` row. Low impact (no data disclosure; worst case is
  unsubscribing a victim). Tracked under DB-6.

### Guard-migration verification (do they do what their names imply?)
- `2026060804_lock_security_definer_grants.sql` — REVOKEs `rls_auto_enable` and
  `record_order_for_contact` from anon/authenticated, grants the latter to service_role.
  **Confirmed on prod** (both now service_role-only). Its claim that `is_admin_or_artist`
  stays anon-granted is **out of date** — prod revoked it. VERIFIED (with doc drift note).
- `2026060803_policy_less_table_rls.sql` — adds admin policies to audit_log,
  commission_milestones, meta_events, webhook_logs. **Confirmed** (0 policy-less tables on
  prod). VERIFIED.
- `2026060802_handle_new_user.sql` — `handle_new_user()` SECDEF `search_path=''`, role
  hardcoded `'customer'`, EXECUTE revoked from anon/authenticated. **Confirmed** (prod grant
  = service_role only). VERIFIED — no metadata-driven privilege escalation.
- `2026060805_pii_buckets_private.sql` — sets `commission-references` + `class-pet-photos`
  `public=false`, drops public-read policies, adds admin-only read. **Confirmed on prod**
  (both buckets `public=false`). VERIFIED.

---

## STORAGE BUCKETS (live prod)

| Bucket | public | Holds | Verdict |
|---|---|---|---|
| about-images | **true** | marketing images | OK (public by design) |
| library | **true** | media library images | OK (public by design) |
| product-images | **true** | product/web art (incl. crops, originals) | OK (public art catalog) |
| testimonials | **true** | testimonial photos; `file_size_limit = NULL` | OK content-wise; DB-9 (no size cap) |
| print-masters | false | high-res print masters (500MB) | OK (private, signed URLs) |
| commission-references | false | customer-uploaded reference photos/PDFs (PII) | OK (locked by 2026060805) |
| class-pet-photos | false | customer pet photos (PII) | OK (locked by 2026060805) |
| shared-files | false | (not referenced in app code reviewed) | OK private; confirm purpose |

**No PII bucket is public.** The `public_bucket_allows_listing` advisor fires on the 4 public
buckets (about-images, library, product-images, testimonials) — true but these hold only
non-sensitive public assets, so listing exposure is acceptable. The only storage hardening
item is `testimonials` having `file_size_limit = NULL` (DB-9, P3 — unbounded upload size).

---

## FINDINGS

### DB-1 — `is_admin_or_artist()` advisor + migration doc are STALE (prod already revoked anon)
- Severity: **P3** (doc/advisor drift, no live risk)
- Evidence: live `pg_proc.proacl` for `public.is_admin_or_artist()` = EXECUTE to
  `authenticated, service_role` only (anon NOT present). The advisor
  `security_definer_executable_by_anon` and `2026060804_lock_security_definer_grants.sql:6-15`
  both assert anon must keep EXECUTE — false on current prod.
- Why: leaving stale "must keep anon" reasoning in a migration invites a future dev to
  re-grant anon. Also means the policies that reference `is_admin_or_artist()` for public
  SELECT (testimonials, class_sessions, artwork_funnels) are evaluated for anon and would
  throw "permission denied for function" — BUT prod evidently works, meaning those public
  reads are served by the separate `USING(true)`/`USING(is_published)` PERMISSIVE policies
  that OR alongside the admin policy, so anon never needs to execute the function. Confirmed
  by matrix above (every public-readable table has a non-function SELECT policy).
- Remediation: update the comment in `2026060804` to reflect that anon was revoked; close the
  advisor as accepted/fixed. No SQL change needed.
- Prior-ref: A-18 (proposed `REVOKE ... FROM anon` — landed on prod).
- Regression test: deny-test asserting `is_admin_or_artist` is NOT executable by anon, and a
  public read of `testimonials`/`class_sessions` as anon returns rows (proves the OR-policy
  path, not the function, serves anon).

### DB-2 — `newsletter_subscribers` readable by ANY authenticated user (PII)
- Severity: **P1** (sensitive-data exposure)
- Evidence: live policy `"Authenticated can read newsletter_subscribers"` SELECT
  `USING (auth.role() = 'authenticated')`. Unlike every other PII table (admin-scoped via
  `is_admin_or_artist()`), this exposes the full email subscriber list to any logged-in
  customer (role='customer'), not just admin/artist.
- Why: a single self-registered customer account can `select email from
  newsletter_subscribers` and exfiltrate the entire marketing list (email-harvest / CAN-SPAM
  exposure). The mirror table `crm_contacts` is correctly admin-only, so this is an
  inconsistent, weaker guard on the same data class.
- Remediation (SQL sketch — for the FILE, not to run here):
  ```sql
  drop policy "Authenticated can read newsletter_subscribers" on public.newsletter_subscribers;
  create policy "Admins read newsletter_subscribers" on public.newsletter_subscribers
    for select using (public.is_admin_or_artist());
  ```
  Then confirm no app code reads this table with the anon/authenticated client (writes go
  through `subscribe_to_newsletter` SECDEF; reads should be admin/service_role only).
- Prior-ref: NEW (not in stale A-security.md).
- Regression test: deny-test — authenticated non-admin SELECT on `newsletter_subscribers`
  returns 0 rows / permission denied; admin SELECT returns rows.

### DB-3 — `reprice_variants` SECURITY DEFINER without pinned `search_path`
- Severity: **P2** (constrained: authenticated-only, needs object-shadowing)
- Evidence: live `pg_proc` — `reprice_variants(uuid,uuid)` `prosecdef=true`,
  `proconfig=NULL` (no `search_path`). Body references unqualified `product_variants`,
  `products`, `categories`, `site_settings`. Grants: authenticated, service_role.
  Matches live advisor `function_search_path_mutable`.
- Why: a SECURITY DEFINER function with mutable search_path can be hijacked if an attacker
  who can execute it (any authenticated user) can also create a same-named object in a schema
  earlier in their search_path. It also mutates prices (`product_variants.price`) — a definer
  function that writes money-adjacent data should be hardened to the project standard
  (`search_path=''`, fully schema-qualified, every other definer fn here already is).
- Remediation (SQL sketch):
  ```sql
  create or replace function public.reprice_variants(p_product uuid default null, p_category uuid default null)
  returns integer language sql security definer set search_path = '' as $$
    with site as (select coalesce(default_margin_pct,100) m from public.site_settings where id=true),
    upd as (
      update public.product_variants v
      set price = round((coalesce(v.lumaprints_cost_cents,0)+coalesce(v.shipping_cost_cents,0))
            * (1 + coalesce(v.margin_override_pct, p.default_margin_pct, c.default_margin_pct, (select m from site))/100.0))/100.0,
          updated_at = now()
      from public.products p left join public.categories c on c.id=p.category_id
      where v.product_id=p.id and v.manual_price_override_cents is null
        and (p_product is null or v.product_id=p_product)
        and (p_category is null or p.category_id=p_category)
      returning 1)
    select count(*)::int from upd;
  $$;
  revoke all on function public.reprice_variants(uuid,uuid) from public, anon;
  grant execute on function public.reprice_variants(uuid,uuid) to authenticated, service_role;
  ```
  Consider also dropping the `authenticated` grant to service_role-only if only admin tooling
  calls it (verify caller in app code).
- Prior-ref: NEW (the prior A-security listed search_path issues generally; this specific fn
  was not flagged because its definition is not in git).
- Regression test: assert `proconfig` for `reprice_variants` contains `search_path=` after
  migration; prices unchanged for a fixture product when reprice is replayed.

### DB-4 — `site_settings` world-readable (`USING (true)`)
- Severity: **P3** (minor — business config, no customer PII)
- Evidence: live policy `site_settings_read` SELECT `USING (true)` (also in
  `20260520_stripe_test_mode.sql` / settings migrations). Row holds business email/phone/
  address, tax config, Stripe test-mode toggle.
- Why: business contact info is already public on the site; the Stripe *test-mode boolean* is
  the only mildly sensitive field (reveals whether live or test keys are active). No secret
  keys are stored in this table (confirm: secrets live in env, not `site_settings`).
- Remediation: optionally split sensitive ops fields into a non-public column set or a
  separate admin-only table; otherwise accept. Confirm no API key/secret column exists in
  `site_settings`.
- Prior-ref: A-17 (duplicate/overlapping site_settings policies noted).
- Regression test: anon SELECT on `site_settings` returns only the public-config columns;
  assert no column named like `%secret%`/`%key%`/`%token%` exists in the table.

### DB-5 — Four public `WITH CHECK (true)` INSERT policies (carts, class_bookings, commissions, newsletter_subscribers)
- Severity: **P2** (reliability/abuse — spam/PII-harvest write surface; no escalation)
- Evidence: live `pg_policy` — each has INSERT `WITH CHECK (true)` applying to PUBLIC:
  `carts."Users can create cart"`, `class_bookings."Public can submit bookings"`,
  `commissions."Public can submit commissions"`,
  `newsletter_subscribers."Anyone can subscribe to newsletter"`.
- Real-risk judgement (per brief):
  - **carts** — Y, low. Anon can insert unlimited cart rows (storage bloat / metric noise).
    Cannot read others' carts (SELECT is owner-scoped). Intended path is `track_cart` SECDEF
    but the broad table policy still allows direct inserts. Mitigate with rate-limit, not RLS
    change (the public storefront legitimately needs anon cart creation).
  - **class_bookings** — Y, moderate. Anon can insert bookings with arbitrary name/email/
    phone and `photos` references; capacity is NOT enforced by this policy (only by the
    `book_class_session` SECDEF which locks the row `FOR UPDATE`). A direct table insert
    bypasses capacity. **Recommend revoking the public INSERT policy and forcing all bookings
    through `book_class_session`** so capacity + validation are guaranteed.
  - **commissions** — Y, low/moderate. Anon can submit unlimited commission requests
    (PII rows + reference-file links). Spam surface; no escalation. Needs rate-limit/CAPTCHA.
  - **newsletter_subscribers** — Y, low for write (the SELECT exposure is the real issue, see
    DB-2). Anon can insert arbitrary emails (list poisoning); intended path is
    `subscribe_to_newsletter` SECDEF. Recommend revoking the public INSERT policy.
- Compensating controls: writes are *designed* to flow through SECDEF RPCs
  (`track_cart`, `book_class_session`, `subscribe_to_newsletter`, contact upsert) which add
  validation; however the broad table policies were never revoked, so the RPC is not the only
  path. App-layer rate-limiting on the public routes is the missing compensation (verify in
  ingress register 01 / route middleware). No CAPTCHA observed on commission/booking forms.
- Remediation (SQL sketch — tighten to force the RPC path where one exists):
  ```sql
  -- class_bookings: only the capacity-enforcing SECDEF should insert
  drop policy "Public can submit bookings" on public.class_bookings;
  -- newsletter_subscribers: only subscribe_to_newsletter SECDEF should insert
  drop policy "Anyone can subscribe to newsletter" on public.newsletter_subscribers;
  -- carts + commissions: keep public insert (storefront needs it) but add rate-limit
  -- + minimal WITH CHECK guards, e.g. require email shape on commissions:
  -- alter policy "Public can submit commissions" ... with check (char_length(coalesce(email,'')) between 3 and 320);
  ```
  Pair with route-level rate-limiting/CAPTCHA on `/api/commissions`, `/api/classes/book`,
  `/api/newsletter`.
- Prior-ref: partially A-security (anon CRM inserts were dropped 20260522; these four were
  not addressed).
- Regression test: deny-test — after revoking class_bookings/newsletter public INSERT, a
  direct anon INSERT is rejected, while the corresponding SECDEF RPC still succeeds and
  enforces capacity/validation.

### DB-6 — Anon-callable SECDEF RPCs trust caller-supplied IDs (track_cart, mark_contact_unsubscribed) + anon insert on unsubscribe_events
- Severity: **P2** (constrained exploit; UUID-guess / out-of-band token)
- Evidence: `track_cart(p_cart_id uuid, ...)` and `mark_contact_unsubscribed(p_contact_id
  uuid, ...)` (verbatim in `20260522_crm_anon_rpcs.sql` / live) have no DB-side
  ownership/token check; both anon-granted. `unsubscribe_events` retains an anon
  `WITH CHECK(true)` INSERT policy on prod.
- Why: `track_cart` — anon caller with a known/guessed cart UUID can overwrite that cart's
  items/email/contact_id (UUIDs unguessable -> low). `mark_contact_unsubscribed` — DB trusts
  `p_contact_id`; the HMAC token is verified only in `/api/unsubscribe`, so a direct anon RPC
  call can unsubscribe an arbitrary contact and log a spoofed `unsubscribe_events` row.
  Impact is limited (no data disclosure; worst case unsubscribe a victim / log spam).
- Remediation: for `track_cart`, add `where profile_id is null` guard (mirror the cart UPDATE
  policy) so it cannot touch a logged-in user's cart; consider returning/accepting an opaque
  cart token instead of the raw UUID. For `mark_contact_unsubscribed`, move HMAC verification
  into the function (accept the signed token + verify) or restrict to service_role and have
  the route call it post-verification. Revoke the direct anon INSERT on `unsubscribe_events`
  (the RPC already inserts it under definer rights).
  ```sql
  drop policy "Anon insert unsubscribe_events" on public.unsubscribe_events; -- RPC writes it
  ```
- Prior-ref: NEW (definitions were not in git for the prior pass).
- Regression test: anon direct INSERT on `unsubscribe_events` rejected; `track_cart` cannot
  modify a cart whose `profile_id is not null`.

### DB-7 — Migration filename prefix inconsistency (10-digit vs 14-digit) — replay-ordering fragility
- Severity: **P3** (maintainability/replay hygiene)
- Evidence: `supabase/migrations/` mixes 14-digit timestamps (`20260608151944_*` style — note
  several are actually `YYYYMMDD_*` 8-digit + slug, e.g. `20260519_cv_entries.sql`) with
  10-digit `YYYYMMDDNN` (`2026060801_*` ... `2026061505_*`). Lexical sort still orders them
  correctly today because the 8-digit `20260519_*` < `2026060801_*` is FALSE — `20260519`
  (8 chars) vs `2026060801` (10 chars) sort by string, and `2026...` prefixes differ in
  length. Spot-check: `20260522_*` sorts BEFORE `2026060801_*`? String compare: "20260522"
  vs "2026060801" -> char-by-char "20260" = "20260", then "5" vs "6" -> "5" < "6", so
  `20260522` < `2026060801`. **Ordering happens to hold** but only by luck of the date math;
  any future file using a different width can interleave incorrectly.
- Why: Supabase applies migrations in lexical filename order. Inconsistent widths make the
  ordering non-obvious and fragile for future additions; a 14-digit `20260620000000_*` would
  sort AFTER `2026061505_*` correctly, but a careless `202606_*` would not.
- Remediation: adopt one width (14-digit `YYYYMMDDHHMMSS_`) going forward; do not renumber
  applied files (would break the migrations ledger). Document the convention in the repo.
- Idempotency (verified): all `create table`/`create index` use `IF NOT EXISTS`; all
  `create policy` are preceded by `drop policy if exists`; functions are `create or replace`;
  constraints guarded by `DO $$ ... pg_constraint ... $$`. Replay-safe for the files present.
- Destructive ops: the only `drop column` statements (`20260522_align_email_tables_shape.sql`)
  are `IF EXISTS` on tables documented empty in prod; the only `DELETE`s are inside
  `mark_contact_unsubscribed` (WHERE-scoped) and the `trim_page_revisions` trigger
  (retention trim). **No DROP TABLE, no TRUNCATE anywhere.** The brief's
  `2026061602_retire_legacy_print_variants.sql` does not exist; the newest two migrations
  (`...1504_rename_sometime_to_royal`, `...1505_product_image_crop_original`) are
  non-destructive.
- Prior-ref: NEW.
- Regression test: a CI step that runs `supabase db reset` against a scratch DB and diffs the
  resulting schema vs prod (would currently FAIL — see DB-8 — surfacing the gap).

### DB-8 — Core schema objects exist only on prod, not in git migrations (replay-from-zero broken)
- Severity: **P2** (process/DR risk — not an exploit)
- Evidence: `grep` over all 42 migrations finds NO `create function ... is_admin_or_artist`,
  NO `create function ... increment_funnel_metric`, NO `create table ... (carts|orders|
  order_items|profiles|class_sessions|class_bookings|commissions|newsletter_subscribers|
  testimonials|artwork_funnels)`, and NO `storage.buckets` insert for `product-images`,
  `testimonials`, or `shared-files`. Yet all exist on live prod (verified via `pg_proc`,
  `pg_policy`, `storage.buckets`). The 2026060802-05 guard migrations even *reference*
  `is_admin_or_artist()` without defining it.
- Why: a clean `supabase db reset` / replay will fail or produce a schema that does not match
  prod (missing the auth function -> every policy referencing it errors; missing base tables).
  This breaks disaster-recovery, branch/preview DBs, and the spawn-kit RLS deny-test harness
  which assumes migrations are the source of truth. It also means this audit had to read prod
  directly because git is not authoritative.
- Remediation: generate a baseline migration from prod (`supabase db pull` /
  `pg_dump --schema-only`) capturing the pre-git objects (functions, base tables, buckets,
  their policies) as `0000_baseline.sql`, committed ahead of the dated migrations; thereafter
  enforce "schema lives in git" via a CI reset+diff gate.
- Prior-ref: NEW (implicit — prior `00-backend-reference.md` is a hand-written reference, not
  a replayable baseline).
- Regression test: CI `supabase db reset` on a scratch project succeeds and a schema diff vs
  prod is empty.

### DB-9 — `testimonials` bucket has no `file_size_limit`
- Severity: **P3** (reliability — unbounded upload)
- Evidence: live `storage.buckets` — `testimonials` `public=true`, `file_size_limit = NULL`
  (all other buckets set a limit: about-images 10MB, library 20MB, product-images 10MB,
  print-masters 500MB, commission-references 15MB, class-pet-photos 10MB).
- Why: a NULL limit allows arbitrarily large uploads to a public bucket (storage cost / DoS).
- Remediation: `update storage.buckets set file_size_limit = 10485760 where id='testimonials';`
  (do via migration, not by hand). Confirm who can write to `testimonials` (objects policies
  not in git — verify upload is admin-only).
- Prior-ref: NEW.
- Regression test: assert `file_size_limit is not null` for every public bucket.

---

## CROSS-CHECK vs PRIOR (stale) REGISTER
- A-18 (`is_admin_or_artist` anon EXECUTE) — **CLOSED on prod** (revoked); only doc drift
  remains (DB-1). Stale register still lists it as open.
- A-? (`record_order_for_contact` over-grant) — **CLOSED on prod** (service_role only via
  2026060804). Stale.
- A-15 (PII buckets private) / A-14 (policy-less tables) / A-9 (handle_new_user) — all
  **CONFIRMED applied on prod**.
- NEW since prior pass: DB-2 (newsletter SELECT), DB-3 (reprice_variants search_path),
  DB-5 (4 public inserts incl. class_bookings capacity bypass), DB-6 (RPC ID trust),
  DB-8 (schema-not-in-git), DB-9 (testimonials size).

## ADVISOR DISPOSITION (live, all WARN)
- `INSERT WITH CHECK(true)` carts/class_bookings/commissions/newsletter_subscribers -> DB-5
  (true; class_bookings + newsletter recommended to revoke, carts/commissions rate-limit).
- `public_bucket_allows_listing` about-images/library/product-images/testimonials -> accepted
  (public assets only); testimonials also DB-9.
- `security_definer_executable_by_anon` 9 fns -> verified per-fn above; `is_admin_or_artist`
  already revoked (DB-1 stale advisor); rest are intentional public surface and safe; only
  action is DB-3/DB-6 hardening.
- `function_search_path_mutable` reprice_variants -> DB-3.
- `auth_leaked_password_protection DISABLED` -> auth/identity register (01); recommend enable.

