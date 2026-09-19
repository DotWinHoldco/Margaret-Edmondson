-- Authored by DotWin
-- Run against the migrated database. Real profile identities are read in place;
-- transaction-local JWT claims exercise RLS and RPCs without changing accounts/data.
begin;
do $$
declare
  v_user record;
  v_admins integer := 0;
begin
  for v_user in select id, role from public.profiles where role in ('admin', 'artist') loop
    v_admins := v_admins + 1;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user.id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    set local role authenticated;
    if not public.is_admin_or_artist() then
      raise exception 'Stored % role was rejected', v_user.role;
    end if;
    if not exists (select 1 from public.lumaprints_pricing_cache) then
      raise exception 'Password-only admin could not read pricing cache';
    end if;
    if not exists (select 1 from public.audit_log) then
      raise exception 'Password-only admin could not read audit log';
    end if;
    -- An unknown row must reach the not-found branch, proving the role gate passed.
    begin
      perform public.catalog_admin_patch_subcategory('00000000-0000-0000-0000-000000000000', '{}'::jsonb);
      raise exception 'Expected a missing subcategory';
    exception when no_data_found then null;
    end;
    reset role;
  end loop;
  if v_admins = 0 then raise exception 'No admin profiles available to verify'; end if;

  -- A signed-in identity without a privileged profile must still be rejected.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated","aal":"aal1"}', true);
  set local role authenticated;
  if public.is_admin_or_artist() then raise exception 'Non-admin was accepted'; end if;
  if exists (select 1 from public.lumaprints_pricing_cache) or exists (select 1 from public.audit_log) then
    raise exception 'Non-admin could read private pricing or audit data';
  end if;
  begin
    perform public.catalog_admin_patch_subcategory('00000000-0000-0000-0000-000000000000', '{}'::jsonb);
    raise exception 'Non-admin could call catalog mutation';
  exception when insufficient_privilege then null;
  end;
  if has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
     or has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_log', 'DELETE')
     or has_table_privilege('authenticated', 'public.lumaprints_pricing_cache', 'TRUNCATE')
     or has_function_privilege('authenticated', 'public.catalog_admin_caller()', 'EXECUTE') then
    raise exception 'Restricted grants were broadened';
  end if;
  reset role;
end;
$$;
select 'Password-only admin access and non-admin rejection passed' as result;
rollback;
