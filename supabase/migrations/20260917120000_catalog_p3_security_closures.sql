-- Authored by DotWin
-- P3 security pass closures (independent review of the catalog admin write path,
-- 2026-09-17). The wave's invariant is "a stolen aal1 cookie can never write the
-- catalog"; two tables the RPCs lean on still had aal1-writable browser policies.
--
-- 1. lumaprints_pricing_cache: the money-bearing cache the quote engine reads and every
--    admin toggle evicts was writable by any admin/artist session at aal1 through
--    PostgREST (policy `for all to authenticated using (is_admin_or_artist())`, no
--    assurance clause), and `cost_cents` (wholesale) was readable without stepping up.
--    Both policies now require an aal2 session, matching `catalog_admin_caller()` and
--    `requireAdmin()`. anon loses every grant; TRUNCATE (which no policy can constrain)
--    is revoked from both browser roles. Admin routes keep writing through the cookie
--    client because they already run behind the aal2 gate.
-- 2. audit_log: the INSERT policy named no column, so an aal1 admin could POST rows
--    with any `changed_by`, forging the trail the P3 RPCs write. No application code
--    inserts audit_log from a browser session (the only writers are the SECURITY
--    DEFINER functions, which run as the owner), so the browser INSERT grant and policy
--    go away; reads stay admin-only and now aal2.
-- 3. lumaprints_options.swatch.image_path reached a CSS url() on the public product
--    page constrained only by length. It is now a site-relative path or a Supabase
--    public-storage URL (what the media library issues), with no quote, paren,
--    backslash or whitespace, enforced by a CHECK so every writer, sync included, obeys.
--
-- Verified before apply (2026-09-17): 0 options carry an image_path; 140 audit rows.

-- ---------------------------------------------------------------------------
-- 1. Pricing cache: aal2 for every browser verb, no anon, no TRUNCATE
-- ---------------------------------------------------------------------------

drop policy if exists "Admins read lumaprints_pricing_cache" on public.lumaprints_pricing_cache;
create policy "Admins read lumaprints_pricing_cache"
  on public.lumaprints_pricing_cache for select
  to authenticated
  using (public.is_admin_or_artist() and coalesce(auth.jwt() ->> 'aal', '') = 'aal2');

drop policy if exists "Admins write lumaprints_pricing_cache" on public.lumaprints_pricing_cache;
create policy "Admins write lumaprints_pricing_cache"
  on public.lumaprints_pricing_cache for all
  to authenticated
  using (public.is_admin_or_artist() and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
  with check (public.is_admin_or_artist() and coalesce(auth.jwt() ->> 'aal', '') = 'aal2');

revoke all on public.lumaprints_pricing_cache from anon;
revoke truncate on public.lumaprints_pricing_cache from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Audit log: definer-only writes, aal2 admin reads
-- ---------------------------------------------------------------------------

drop policy if exists "Admins can insert audit_log" on public.audit_log;
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
revoke all on public.audit_log from anon;

drop policy if exists "Admins can read audit_log" on public.audit_log;
create policy "Admins can read audit_log" on public.audit_log
  for select to authenticated
  using (public.is_admin_or_artist() and coalesce(auth.jwt() ->> 'aal', '') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. Swatch image path: a path we can render, nothing else
-- ---------------------------------------------------------------------------

alter table public.lumaprints_options drop constraint if exists lumaprints_options_swatch_image_path_check;
alter table public.lumaprints_options
  add constraint lumaprints_options_swatch_image_path_check
  check (
    swatch is null
    or swatch ->> 'image_path' is null
    or swatch ->> 'image_path' ~ '^(/[^[:space:]"''()\\]{1,511}|https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/[^[:space:]"''()\\]{1,400})$'
  );
