-- Authored by DotWin
-- The client requested password-only access. Keep stored-role checks, restricted
-- grants, and atomic catalog auditing; remove only the second-factor requirement.
begin;

create or replace function public.catalog_admin_caller()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_admin_or_artist() then
    raise exception 'catalog_admin: forbidden' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

alter policy "Admins read lumaprints_pricing_cache"
  on public.lumaprints_pricing_cache
  using (public.is_admin_or_artist());

alter policy "Admins write lumaprints_pricing_cache"
  on public.lumaprints_pricing_cache
  using (public.is_admin_or_artist())
  with check (public.is_admin_or_artist());

alter policy "Admins can read audit_log" on public.audit_log
  using (public.is_admin_or_artist());

commit;
