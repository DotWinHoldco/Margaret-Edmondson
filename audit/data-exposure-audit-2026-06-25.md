# Data-Exposure Audit — ArtByME (Margaret-Edmondson)

Authored by DotWin
Date: 2026-06-25
Scope: confidentiality + least-privilege write integrity of all sensitive data stores
Project: Supabase `klwkajukicsoiwpsgftt` (https://klwkajukicsoiwpsgftt.supabase.co)

## Method

Every store of sensitive data was traced through its full reachable surface (RLS
policies, table/column grants, RPCs and SECURITY DEFINER functions with their
EXECUTE grants, storage buckets, env/config) and then **actually exercised as the
least-privileged caller** — first the `anon` role, then a logged-in non-owner
(`authenticated` with a non-victim subject) — passing real/seeded victim ids inside
`BEGIN … ROLLBACK` transactions so nothing committed. Findings below quote what each
role *actually obtained or mutated*, not what the schema implies. Corroborated
against the Supabase security advisor linter. No test data was committed to
production (verified post-run: 0 seeded rows persisted).

## Result summary

The crown-jewel PII is **not** directly readable by untrusted callers: RLS is
enabled on all 33 sensitive tables and **every customer PII / payment / private
table returned 0 rows** to both `anon` and a logged-in non-owner. The boundary that
fails is the **anon-callable SECURITY DEFINER RPC layer** and a few permissive
read policies — yielding write-tamper, enumeration oracles, discount abuse, and one
config read. Eight issues confirmed; the rest acquitted.

| # | Target | Caller | Class | Severity |
|---|--------|--------|-------|----------|
| 1 | `track_cart` RPC | anon | IDOR write (cart tamper) | High |
| 2 | `mark_contact_unsubscribed` RPC | anon | Unauth write + log forgery + oracle | High |
| 3 | `subscribe_to_newsletter` RPC | anon | Discount minting + email oracle + CRM write | High |
| 4 | `upsert_contact_to_list` RPC | anon | CRM poisoning + email→contact-id oracle | Med-High |
| 5 | `validate_promo_code_public` RPC | anon | Promo-code + contact enumeration oracle | Medium |
| 6 | `promo_codes` read policy | any logged-in user | Discount + customer-email disclosure | Medium |
| 7 | `reprice_variants` RPC | anon | Unauth mass price write + definer hardening | Medium |
| 8 | `site_settings` read policy | anon | Business-config / markup disclosure | Low-Med |

---

## Confirmed findings

### 1. `track_cart` — anon IDOR write to any cart (High)

`public.track_cart(p_cart_id uuid, p_email text, p_items jsonb, p_subtotal numeric,
p_contact_id uuid)` is `SECURITY DEFINER`, `EXECUTE` granted to `anon`. Body updates
`carts SET items, subtotal, email=coalesce(new,old), contact_id, status WHERE
id = p_cart_id` — **no ownership or auth predicate.**

Live proof (seeded victim cart, overwritten as `anon`, rolled back):

```
victim before : email=victim-customer@real.example  items=[VICTIM-ITEM]      subtotal=1800
victim after  : email=attacker@evil.example          items=[ATTACKER-INJECTED x999] subtotal=99999
```

Impact: any anon caller can corrupt any shopper's cart by id — inject/replace line
items, rewrite totals, and set the cart `email`/`contact_id`. The abandoned-cart
cron keys outreach off `carts.email`, so an attacker can redirect or poison that
flow. Direct PostgREST calls also bypass the route's 60/min rate limit.

Fix: gate the UPDATE on ownership (`auth.uid() = (select profile_id from carts where
id = p_cart_id)` for the owned case, plus a server-minted anonymous-cart token for
guest carts), or move cart mutation behind a server route that authorizes first and
revoke anon EXECUTE.

### 2. `mark_contact_unsubscribed` — anon, zero authorization (High)

`SECURITY DEFINER`, `EXECUTE` to `anon`. Body performs **no authorization at all**:
given `p_contact_id`, it sets `crm_contacts.status='unsubscribed'`, stamps
`newsletter_subscribers.unsubscribed_at`, optionally deletes `contact_list_members`
rows, and always inserts an `unsubscribe_events` row with attacker-controlled
`p_ip` and `p_user_agent`. Returns `true`/`false` by contact existence.

Live: executed as `anon` against a non-existent id → `false` (no permission error;
a real id mutates). Impact: (a) unsubscribe/suppress any real customer from
marketing, (b) delete list memberships, (c) forge audit-log rows with spoofed IP/UA,
(d) contact-existence oracle. Chains with #3/#4 which return a real `contact_id` for
any email.

Fix: require an authenticated owner or an HMAC-signed unsubscribe token (the email
flow already has `UNSUBSCRIBE_SECRET`); revoke anon EXECUTE on the raw RPC.

### 3. `subscribe_to_newsletter` — anon discount minting + email oracle (High)

`SECURITY DEFINER`, `EXECUTE` to `anon`. Body upserts `crm_contacts` for any email
(returns `contact_id`), enrolls the contact, and **mints or returns an active 10%
single-use `promo_codes` row, returning the code/percent_off.**

Impact: (a) unlimited generation of valid working discount codes (direct financial
abuse), (b) for an already-subscribed email it returns that contact's existing active
code — retrieve a victim's code, (c) email→contact_id existence oracle, (d) forced
CRM enrollment of arbitrary emails. Direct RPC bypasses the route's 3/60s limit.

Fix: keep the subscribe flow but stop returning a reusable code from an
anon-callable definer (issue codes server-side post-verification), throttle at the
DB or move minting to a service-role path.

### 4. `upsert_contact_to_list` — anon CRM poisoning + contact-id oracle (Med-High)

`SECURITY DEFINER`, `EXECUTE` to `anon`. Upserts `crm_contacts` by email (merging
attacker-supplied `tags`/name/phone onto existing contacts), adds to any list slug,
and **returns the canonical `crm_contacts.id`.**

Impact: (a) email→contact_id oracle (feeds #2), (b) relabel/poison existing contacts
(inject tags, fill blank name/phone), (c) add arbitrary contacts to segments such as
`buyers`. Fix: revoke anon EXECUTE; route CRM writes through a server endpoint that
does not echo internal ids.

### 5. `validate_promo_code_public` — anon enumeration oracle (Medium)

`SECURITY DEFINER`, `EXECUTE` to `anon`; identity resolved from `p_email`/`p_cart_id`
with no `auth.uid()`.

Live as `anon`:
```
validate_promo_code_public('WELCOME-95BD4E') -> reason="expired"    (code exists)
validate_promo_code_public('ZZZ-NOPE-0001')  -> reason="not_found"  (code absent)
```
A valid code additionally returns `discount_type`, `discount_value`,
`amount_off_cents`. The `wrong_contact` vs other reasons leak whether a code is bound
to a given email. Impact: brute-force/enumerate valid discount codes and their
values; contact-binding oracle. Fix: return a single opaque reason to untrusted
callers; rate-limit; do not branch responses on contact binding.

### 6. `promo_codes` — any logged-in user reads all promo codes (Medium)

Policy `"Authenticated can read promo_codes"`: `SELECT … USING
(auth.role() = 'authenticated')`. Live: a non-owner authenticated subject read the
promo_codes row, including `code`, `contact_id`, and a `description` embedding a
customer email (`"Newsletter signup discount for testing@holdco.win"`).

Only a single test code exists today, but the policy scales: every per-contact
`WELCOME-*` code and its bound customer email becomes harvestable by any registered
user. Fix: restrict read to `is_admin_or_artist()` (validation already happens
server-side / via the definer RPC); drop customer emails from `description`.

### 7. `reprice_variants` — anon-executable mass write + definer hardening (Medium)

`SECURITY DEFINER`, `EXECUTE` held by `PUBLIC` (so `anon` inherits it) and
`authenticated`. **Also missing `SET search_path`** (Supabase advisor
`function_search_path_mutable`). Body issues an unqualified mass `UPDATE
product_variants SET price = …` for non-overridden variants.

Live: `anon` executed `reprice_variants('…nonexistent…', null)` → `0` with no
permission error (with `null, null` it repricing all non-overridden variants).
Impact: any anon can trigger a site-wide reprice (integrity / unexpected price
publication mid-edit); the mutable search_path is a definer hardening defect. Note:
this contradicted the migration-level assumption that anon was revoked — the live
grant is `PUBLIC`. Fix: `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; GRANT …
TO service_role;` and add `SET search_path = ''` with schema-qualified objects.

### 8. `site_settings` — anon reads business config (Low-Med)

Policy `site_settings_read`: `SELECT … USING (true)`. Live anon read returned the
singleton row. Most PII columns (`business_phone`, `business_address`,
`order_notification_email`, tax fields) are null; the genuinely confidential value
exposed is **`default_margin_pct: 100`** (pricing markup), plus integration-enabled
flags and `stripe_test_mode` (reconnaissance). Writes are correctly gated
(`is_admin_or_artist()` / `service_role`).

Fix: replace `USING(true)` with either admin-only read, or a curated public view
exposing only the storefront-needed fields (currency, shipping zips, announcement
bar) and never margin/integration internals.

---

## Acquitted (verified scoped — least-privileged callers obtain nothing sensitive)

- **All sensitive PII/payment tables return 0 rows** to both `anon` and a logged-in
  non-owner: `crm_contacts`, `orders`, `order_items`, `profiles`, `addresses`,
  `carts` (direct), `newsletter_subscribers`, `class_bookings`, `commissions`,
  `social_accounts`, `unsubscribe_events`, `email_campaign_recipients`,
  `email_automation_sends`, `wishlist_items`, `contact_list_members`,
  `master_artworks`, `webhook_logs`, `audit_log`, `meta_events`,
  `lumaprints_pricing_cache`, `media_library`, `promo_code_redemptions`. RLS holds.
- `newsletter_subscribers` read is admin-only — the prior "any authenticated user"
  exposure is fixed.
- `book_class_session`, `increment_funnel_metric` — anon-executable but write-only,
  return a status/count, no PII read-back; `increment_funnel_metric` whitelists the
  metric (no dynamic SQL). Residual: capacity-bounded booking spam / counter
  inflation only.
- `is_admin_or_artist()` derives strictly from `auth.uid()` (returns false for anon
  and default-role customers); the ~40 admin policies built on it are sound.
- `record_order_for_contact`, `reserve_original` — `service_role` only.
- `cv_settings` / `cv_entries` / `lumaprints_mediums` public reads — non-sensitive
  (public CV header + email, published CV entries, print-catalog config).
- Storage: PII buckets (`commission-references`, `class-pet-photos`, `print-masters`,
  `shared-files`) are private; public buckets hold only marketing/catalog images.
- Secrets: no secret is client-exposed; service-role/Stripe/Resend/fulfillment keys
  are server-only.

## Lower-priority / hardening (Supabase advisor corroborated)

- Public-submit INSERT policies with `WITH CHECK (true)` on `carts`,
  `class_bookings`, `commissions`, `newsletter_subscribers` — enable spam/poisoning
  of those tables. Intended for public forms; add minimal shape/rate constraints.
- Public buckets (`about-images`, `library`, `product-images`, `testimonials`) allow
  object listing — filename enumeration of non-sensitive images.
- `reprice_variants` mutable `search_path` (see #7).
- Auth: leaked-password protection (HaveIBeenPwned) is disabled.

## Remediation priority

1. Revoke `anon`/`PUBLIC` EXECUTE on `track_cart`, `mark_contact_unsubscribed`,
   `upsert_contact_to_list`, `reprice_variants`; re-route through authorized server
   endpoints or service-role. (#1, #2, #4, #7)
2. Stop returning reusable discount codes / internal ids from anon definers;
   server-mint post-verification. (#3, #4)
3. Restrict `promo_codes` read to admins; strip customer emails from `description`.
   (#6)
4. Single opaque reason + rate limit on `validate_promo_code_public`. (#5)
5. Replace `site_settings_read` `USING(true)` with a curated public projection. (#8)
6. Add `SET search_path` to `reprice_variants`; harden public-submit INSERT policies;
   enable leaked-password protection.

## Reproduce

As the `anon` / `authenticated` role inside `BEGIN; SET LOCAL ROLE anon; SET LOCAL
request.jwt.claims = '{"role":"anon"}'; … ROLLBACK;` (substitute a non-victim `sub`
uuid + `role=authenticated` for the logged-in-non-owner pass). RPC bodies and
EXECUTE ACLs via `pg_get_functiondef` / `pg_proc.proacl`; policies via `pg_policies`.
See `audit/data-exposure-audit-prompt.md` for the full prompt.
