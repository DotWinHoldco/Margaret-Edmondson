-- Authored by DotWin
-- Adopt conformance: bring git RLS in line with prod and tighten three policies the
-- DotWin rls gate flags. Idempotent and replay-safe (drop-if-exists then create). Applying
-- to prod is safe: product_categories already has these policies live; the carts/
-- unsubscribe_events/social_posts changes are behavior-preserving tightenings.

-- ── product_categories: capture the RLS that exists on prod but is missing from git ──
-- Migration 2026061501 created this table without RLS. Prod has RLS + 4 policies; without
-- this, a from-zero replay would build the table world-writable (anon holds full DML grants).
alter table public.product_categories enable row level security;

drop policy if exists "Public can read product_categories" on public.product_categories;
create policy "Public can read product_categories"
  on public.product_categories for select
  using (true);

drop policy if exists "Admins can insert product_categories" on public.product_categories;
create policy "Admins can insert product_categories"
  on public.product_categories for insert
  with check (is_admin_or_artist());

drop policy if exists "Admins can update product_categories" on public.product_categories;
create policy "Admins can update product_categories"
  on public.product_categories for update
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

drop policy if exists "Admins can delete product_categories" on public.product_categories;
create policy "Admins can delete product_categories"
  on public.product_categories for delete
  using (is_admin_or_artist());

-- ── carts: anon may only insert a GUEST cart (no profile) ──
-- Mirrors the existing anon UPDATE policy (profile_id is null). Replaces with check (true),
-- which allowed an anonymous caller to insert a cart row attributed to any profile.
drop policy if exists "Anon insert carts" on public.carts;
create policy "Anon insert carts"
  on public.carts for insert
  to anon
  with check (profile_id is null);

-- ── unsubscribe_events: anon insert must carry the audit key (email) ──
-- Replaces with check (true). The /api/unsubscribe route verifies a signed token before
-- recording the event; requiring email keeps the audit row meaningful. Abuse is mitigated by
-- route-level rate limiting (tracked separately).
drop policy if exists "Anon insert unsubscribe_events" on public.unsubscribe_events;
create policy "Anon insert unsubscribe_events"
  on public.unsubscribe_events for insert
  to anon
  with check (email is not null);

-- ── social_posts: make the admin policy's identity dependence explicit ──
-- is_admin_or_artist() already implies an authenticated caller; adding auth.uid() is a no-op
-- tightening that states the scope on a table carrying an account_id reference.
drop policy if exists "Admin manage social_posts" on public.social_posts;
create policy "Admin manage social_posts"
  on public.social_posts for all
  using (is_admin_or_artist() and auth.uid() is not null)
  with check (is_admin_or_artist() and auth.uid() is not null);
