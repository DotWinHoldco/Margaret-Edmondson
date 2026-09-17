-- Authored by DotWin
-- Catalog v2 admin write path (plan P3; security contract in
-- docs/blueprints/2026-09-16-full-catalog.md).
--
-- Browser roles hold SELECT only on lumaprints_subcategories, lumaprints_option_groups and
-- lumaprints_options (20260917000100). Every admin write goes through the SECURITY DEFINER
-- functions below, which:
--   1. require is_admin_or_artist() AND an aal2 (TOTP-verified) session, so a stolen aal1
--      cookie can never write the catalog;
--   2. accept only a fixed whitelist of admin-owned columns per table (sync owns the rest,
--      and a tombstone never touches `enabled`);
--   3. refuse the ADR-4 blocked ON transition: an option whose geometry needs a file bleed
--      or an owed probe cannot be enabled, whatever the client asks;
--   4. keep at most one default per group (the partial unique index is the backstop);
--   5. write one audit_log row per changed field and evict that subcategory's v2 pricing
--      cache rows (F7), in the same transaction as the change.
--
-- Errors are classified by SQLSTATE so a route can map them without parsing text:
--   42501  forbidden (not an admin, or not aal2)
--   P0002  row not found
--   22023  bad patch (unknown field, wrong type, out of range)
--   P0001  refused by a catalog rule (blocked option, tombstoned default)

-- ---------------------------------------------------------------------------
-- Guards and helpers (internal: no browser role may execute them directly)
-- ---------------------------------------------------------------------------

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
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'catalog_admin: a verified (aal2) session is required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- One audit row per changed field. Returns whether anything was written.
create or replace function public.catalog_admin_audit(
  p_table text,
  p_record uuid,
  p_field text,
  p_old text,
  p_new text,
  p_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_old is not distinct from p_new then
    return false;
  end if;
  insert into public.audit_log (table_name, record_id, field_name, old_value, new_value, changed_by)
  values (p_table, p_record, p_field, p_old, p_new, p_by);
  return true;
end;
$$;

-- Mirror of assemble.ts optionBlockedReason: the same two geometry keys block the ON
-- transition here, so the toggle cannot be forced from a hand-made request.
create or replace function public.catalog_option_blocked_reason(p_geometry jsonb)
returns text
language sql
immutable
as $$
  select case
    when p_geometry is null then null
    when jsonb_typeof(p_geometry -> 'requires_file_bleed_in') = 'number'
      then 'This finish needs a print file with extra bleed. Our print files keep the whole artwork, so it is not available.'
    when jsonb_typeof(p_geometry -> 'probe_owed') = 'string' and length(p_geometry ->> 'probe_owed') > 0
      then p_geometry ->> 'probe_owed'
    else null
  end;
$$;

create or replace function public.catalog_admin_patch_keys(p_patch jsonb, p_allowed text[])
returns void
language plpgsql
immutable
as $$
declare
  v_key text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'catalog_admin: patch must be an object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (p_allowed)) then
      raise exception 'catalog_admin: unknown field %', v_key using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function public.catalog_admin_patch_bool(p_patch jsonb, p_key text)
returns boolean
language plpgsql
immutable
as $$
begin
  if jsonb_typeof(p_patch -> p_key) <> 'boolean' then
    raise exception 'catalog_admin: % must be a boolean', p_key using errcode = '22023';
  end if;
  return (p_patch ->> p_key)::boolean;
end;
$$;

create or replace function public.catalog_admin_patch_int(p_patch jsonb, p_key text)
returns integer
language plpgsql
immutable
as $$
declare
  v_num numeric;
begin
  if jsonb_typeof(p_patch -> p_key) <> 'number' then
    raise exception 'catalog_admin: % must be a number', p_key using errcode = '22023';
  end if;
  v_num := (p_patch ->> p_key)::numeric;
  if v_num <> trunc(v_num) or v_num < -1000000 or v_num > 1000000 then
    raise exception 'catalog_admin: % must be a whole number', p_key using errcode = '22023';
  end if;
  return v_num::integer;
end;
$$;

-- A required label: trimmed, 1..120 characters.
create or replace function public.catalog_admin_patch_label(p_patch jsonb, p_key text)
returns text
language plpgsql
immutable
as $$
declare
  v_text text;
begin
  if jsonb_typeof(p_patch -> p_key) <> 'string' then
    raise exception 'catalog_admin: % must be text', p_key using errcode = '22023';
  end if;
  v_text := btrim(p_patch ->> p_key);
  if length(v_text) < 1 or length(v_text) > 120 then
    raise exception 'catalog_admin: % must be 1 to 120 characters', p_key using errcode = '22023';
  end if;
  return v_text;
end;
$$;

-- An optional note: null clears it; otherwise trimmed, at most 2000 characters.
create or replace function public.catalog_admin_patch_note(p_patch jsonb, p_key text)
returns text
language plpgsql
immutable
as $$
declare
  v_text text;
begin
  if jsonb_typeof(p_patch -> p_key) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_patch -> p_key) <> 'string' then
    raise exception 'catalog_admin: % must be text or null', p_key using errcode = '22023';
  end if;
  v_text := btrim(p_patch ->> p_key);
  if length(v_text) > 2000 then
    raise exception 'catalog_admin: % must be at most 2000 characters', p_key using errcode = '22023';
  end if;
  return nullif(v_text, '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Subcategory: enabled · display_label · description · customer_note · sort_order · acknowledged
-- ---------------------------------------------------------------------------

create or replace function public.catalog_admin_patch_subcategory(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid := public.catalog_admin_caller();
  v_row public.lumaprints_subcategories%rowtype;
  v_changed text[] := '{}';
  v_new_text text;
  v_new_bool boolean;
  v_new_int integer;
begin
  perform public.catalog_admin_patch_keys(
    p_patch,
    array['enabled', 'display_label', 'description', 'customer_note', 'sort_order', 'acknowledged']
  );

  select * into v_row from public.lumaprints_subcategories where id = p_id for update;
  if not found then
    raise exception 'catalog_admin: subcategory not found' using errcode = 'P0002';
  end if;

  if p_patch ? 'enabled' then
    v_new_bool := public.catalog_admin_patch_bool(p_patch, 'enabled');
    if public.catalog_admin_audit('lumaprints_subcategories', p_id, 'enabled', v_row.enabled::text, v_new_bool::text, v_by) then
      v_changed := array_append(v_changed, 'enabled');
    end if;
    v_row.enabled := v_new_bool;
  end if;

  if p_patch ? 'display_label' then
    v_new_text := public.catalog_admin_patch_label(p_patch, 'display_label');
    if public.catalog_admin_audit('lumaprints_subcategories', p_id, 'display_label', v_row.display_label, v_new_text, v_by) then
      v_changed := array_append(v_changed, 'display_label');
    end if;
    v_row.display_label := v_new_text;
  end if;

  if p_patch ? 'description' then
    v_new_text := public.catalog_admin_patch_note(p_patch, 'description');
    if public.catalog_admin_audit('lumaprints_subcategories', p_id, 'description', v_row.description, v_new_text, v_by) then
      v_changed := array_append(v_changed, 'description');
    end if;
    v_row.description := v_new_text;
  end if;

  if p_patch ? 'customer_note' then
    v_new_text := public.catalog_admin_patch_note(p_patch, 'customer_note');
    if public.catalog_admin_audit('lumaprints_subcategories', p_id, 'customer_note', v_row.customer_note, v_new_text, v_by) then
      v_changed := array_append(v_changed, 'customer_note');
    end if;
    v_row.customer_note := v_new_text;
  end if;

  if p_patch ? 'sort_order' then
    v_new_int := public.catalog_admin_patch_int(p_patch, 'sort_order');
    if public.catalog_admin_audit('lumaprints_subcategories', p_id, 'sort_order', v_row.sort_order::text, v_new_int::text, v_by) then
      v_changed := array_append(v_changed, 'sort_order');
    end if;
    v_row.sort_order := v_new_int;
  end if;

  if p_patch ? 'acknowledged' then
    if public.catalog_admin_patch_bool(p_patch, 'acknowledged') and v_row.acknowledged_at is null then
      perform public.catalog_admin_audit('lumaprints_subcategories', p_id, 'acknowledged_at', null, now()::text, v_by);
      v_changed := array_append(v_changed, 'acknowledged_at');
      v_row.acknowledged_at := now();
    end if;
  end if;

  if coalesce(array_length(v_changed, 1), 0) > 0 then
    update public.lumaprints_subcategories
       set enabled = v_row.enabled,
           display_label = v_row.display_label,
           description = v_row.description,
           customer_note = v_row.customer_note,
           sort_order = v_row.sort_order,
           acknowledged_at = v_row.acknowledged_at
     where id = p_id;
    delete from public.lumaprints_pricing_cache where subcategory_ref = p_id;
  end if;

  return jsonb_build_object('id', p_id, 'subcategory_ref', p_id, 'changed', to_jsonb(v_changed));
end;
$$;

-- ---------------------------------------------------------------------------
-- Option group: enabled · display_label · customer_visible · display_kind · sort_order · acknowledged
-- ---------------------------------------------------------------------------

create or replace function public.catalog_admin_patch_group(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid := public.catalog_admin_caller();
  v_row public.lumaprints_option_groups%rowtype;
  v_changed text[] := '{}';
  v_new_text text;
  v_new_bool boolean;
  v_new_int integer;
begin
  perform public.catalog_admin_patch_keys(
    p_patch,
    array['enabled', 'display_label', 'customer_visible', 'display_kind', 'sort_order', 'acknowledged']
  );

  select * into v_row from public.lumaprints_option_groups where id = p_id for update;
  if not found then
    raise exception 'catalog_admin: option group not found' using errcode = 'P0002';
  end if;

  if p_patch ? 'enabled' then
    v_new_bool := public.catalog_admin_patch_bool(p_patch, 'enabled');
    if public.catalog_admin_audit('lumaprints_option_groups', p_id, 'enabled', v_row.enabled::text, v_new_bool::text, v_by) then
      v_changed := array_append(v_changed, 'enabled');
    end if;
    v_row.enabled := v_new_bool;
  end if;

  if p_patch ? 'display_label' then
    v_new_text := public.catalog_admin_patch_label(p_patch, 'display_label');
    if public.catalog_admin_audit('lumaprints_option_groups', p_id, 'display_label', v_row.display_label, v_new_text, v_by) then
      v_changed := array_append(v_changed, 'display_label');
    end if;
    v_row.display_label := v_new_text;
  end if;

  if p_patch ? 'customer_visible' then
    v_new_bool := public.catalog_admin_patch_bool(p_patch, 'customer_visible');
    if public.catalog_admin_audit('lumaprints_option_groups', p_id, 'customer_visible', v_row.customer_visible::text, v_new_bool::text, v_by) then
      v_changed := array_append(v_changed, 'customer_visible');
    end if;
    v_row.customer_visible := v_new_bool;
  end if;

  if p_patch ? 'display_kind' then
    if jsonb_typeof(p_patch -> 'display_kind') <> 'string'
       or not ((p_patch ->> 'display_kind') in ('swatch', 'list', 'radio')) then
      raise exception 'catalog_admin: display_kind must be swatch, list or radio' using errcode = '22023';
    end if;
    v_new_text := p_patch ->> 'display_kind';
    if public.catalog_admin_audit('lumaprints_option_groups', p_id, 'display_kind', v_row.display_kind, v_new_text, v_by) then
      v_changed := array_append(v_changed, 'display_kind');
    end if;
    v_row.display_kind := v_new_text;
  end if;

  if p_patch ? 'sort_order' then
    v_new_int := public.catalog_admin_patch_int(p_patch, 'sort_order');
    if public.catalog_admin_audit('lumaprints_option_groups', p_id, 'sort_order', v_row.sort_order::text, v_new_int::text, v_by) then
      v_changed := array_append(v_changed, 'sort_order');
    end if;
    v_row.sort_order := v_new_int;
  end if;

  if p_patch ? 'acknowledged' then
    if public.catalog_admin_patch_bool(p_patch, 'acknowledged') and v_row.acknowledged_at is null then
      perform public.catalog_admin_audit('lumaprints_option_groups', p_id, 'acknowledged_at', null, now()::text, v_by);
      v_changed := array_append(v_changed, 'acknowledged_at');
      v_row.acknowledged_at := now();
    end if;
  end if;

  if coalesce(array_length(v_changed, 1), 0) > 0 then
    update public.lumaprints_option_groups
       set enabled = v_row.enabled,
           display_label = v_row.display_label,
           customer_visible = v_row.customer_visible,
           display_kind = v_row.display_kind,
           sort_order = v_row.sort_order,
           acknowledged_at = v_row.acknowledged_at
     where id = p_id;
    delete from public.lumaprints_pricing_cache where subcategory_ref = v_row.subcategory_ref;
  end if;

  return jsonb_build_object('id', p_id, 'subcategory_ref', v_row.subcategory_ref, 'changed', to_jsonb(v_changed));
end;
$$;

-- ---------------------------------------------------------------------------
-- Option: enabled · display_label · sort_order · swatch · acknowledged
-- (is_default has its own function below: it moves between siblings atomically)
-- ---------------------------------------------------------------------------

create or replace function public.catalog_admin_patch_option(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid := public.catalog_admin_caller();
  v_row public.lumaprints_options%rowtype;
  v_subcategory_ref uuid;
  v_changed text[] := '{}';
  v_new_text text;
  v_new_bool boolean;
  v_new_int integer;
  v_swatch jsonb;
  v_blocked text;
  v_key text;
begin
  perform public.catalog_admin_patch_keys(
    p_patch,
    array['enabled', 'display_label', 'sort_order', 'swatch', 'acknowledged']
  );

  select * into v_row from public.lumaprints_options where id = p_id for update;
  if not found then
    raise exception 'catalog_admin: option not found' using errcode = 'P0002';
  end if;
  select subcategory_ref into v_subcategory_ref from public.lumaprints_option_groups where id = v_row.group_ref;

  if p_patch ? 'enabled' then
    v_new_bool := public.catalog_admin_patch_bool(p_patch, 'enabled');
    if v_new_bool then
      v_blocked := public.catalog_option_blocked_reason(v_row.geometry);
      if v_blocked is not null then
        raise exception 'catalog_admin: option blocked: %', v_blocked using errcode = 'P0001';
      end if;
    end if;
    if public.catalog_admin_audit('lumaprints_options', p_id, 'enabled', v_row.enabled::text, v_new_bool::text, v_by) then
      v_changed := array_append(v_changed, 'enabled');
    end if;
    v_row.enabled := v_new_bool;
  end if;

  if p_patch ? 'display_label' then
    v_new_text := public.catalog_admin_patch_label(p_patch, 'display_label');
    if public.catalog_admin_audit('lumaprints_options', p_id, 'display_label', v_row.display_label, v_new_text, v_by) then
      v_changed := array_append(v_changed, 'display_label');
    end if;
    v_row.display_label := v_new_text;
  end if;

  if p_patch ? 'sort_order' then
    v_new_int := public.catalog_admin_patch_int(p_patch, 'sort_order');
    if public.catalog_admin_audit('lumaprints_options', p_id, 'sort_order', v_row.sort_order::text, v_new_int::text, v_by) then
      v_changed := array_append(v_changed, 'sort_order');
    end if;
    v_row.sort_order := v_new_int;
  end if;

  if p_patch ? 'swatch' then
    v_swatch := p_patch -> 'swatch';
    if jsonb_typeof(v_swatch) = 'null' then
      v_swatch := null;
    elsif jsonb_typeof(v_swatch) <> 'object' then
      raise exception 'catalog_admin: swatch must be an object or null' using errcode = '22023';
    else
      for v_key in select jsonb_object_keys(v_swatch) loop
        if not (v_key in ('color_hex', 'image_path', 'frame_face_in', 'frame_depth_in')) then
          raise exception 'catalog_admin: unknown swatch field %', v_key using errcode = '22023';
        end if;
      end loop;
      if v_swatch ? 'color_hex' and (
           jsonb_typeof(v_swatch -> 'color_hex') <> 'string'
           or (v_swatch ->> 'color_hex') !~ '^#[0-9a-fA-F]{6}$') then
        raise exception 'catalog_admin: swatch.color_hex must be #rrggbb' using errcode = '22023';
      end if;
      if v_swatch ? 'image_path' and (
           jsonb_typeof(v_swatch -> 'image_path') <> 'string'
           or length(v_swatch ->> 'image_path') < 1
           or length(v_swatch ->> 'image_path') > 512) then
        raise exception 'catalog_admin: swatch.image_path must be a path' using errcode = '22023';
      end if;
      if v_swatch ? 'frame_face_in' and (
           jsonb_typeof(v_swatch -> 'frame_face_in') <> 'number'
           or (v_swatch ->> 'frame_face_in')::numeric <= 0) then
        raise exception 'catalog_admin: swatch.frame_face_in must be a positive number' using errcode = '22023';
      end if;
      if v_swatch ? 'frame_depth_in' and (
           jsonb_typeof(v_swatch -> 'frame_depth_in') <> 'number'
           or (v_swatch ->> 'frame_depth_in')::numeric <= 0) then
        raise exception 'catalog_admin: swatch.frame_depth_in must be a positive number' using errcode = '22023';
      end if;
      if v_swatch = '{}'::jsonb then
        v_swatch := null;
      end if;
    end if;
    if public.catalog_admin_audit('lumaprints_options', p_id, 'swatch', v_row.swatch::text, v_swatch::text, v_by) then
      v_changed := array_append(v_changed, 'swatch');
    end if;
    v_row.swatch := v_swatch;
  end if;

  if p_patch ? 'acknowledged' then
    if public.catalog_admin_patch_bool(p_patch, 'acknowledged') and v_row.acknowledged_at is null then
      perform public.catalog_admin_audit('lumaprints_options', p_id, 'acknowledged_at', null, now()::text, v_by);
      v_changed := array_append(v_changed, 'acknowledged_at');
      v_row.acknowledged_at := now();
    end if;
  end if;

  if coalesce(array_length(v_changed, 1), 0) > 0 then
    update public.lumaprints_options
       set enabled = v_row.enabled,
           display_label = v_row.display_label,
           sort_order = v_row.sort_order,
           swatch = v_row.swatch,
           acknowledged_at = v_row.acknowledged_at
     where id = p_id;
    delete from public.lumaprints_pricing_cache where subcategory_ref = v_subcategory_ref;
  end if;

  return jsonb_build_object('id', p_id, 'subcategory_ref', v_subcategory_ref, 'changed', to_jsonb(v_changed));
end;
$$;

-- Move the group's default to this option. The previous default is cleared in the same
-- statement sequence, so the partial unique index never sees two at once. A tombstoned
-- or blocked option cannot become the default: the default is what every untouched
-- configuration sends to the provider.
create or replace function public.catalog_admin_set_default_option(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid := public.catalog_admin_caller();
  v_row public.lumaprints_options%rowtype;
  v_subcategory_ref uuid;
  v_previous uuid;
  v_blocked text;
begin
  select * into v_row from public.lumaprints_options where id = p_id for update;
  if not found then
    raise exception 'catalog_admin: option not found' using errcode = 'P0002';
  end if;
  select subcategory_ref into v_subcategory_ref from public.lumaprints_option_groups where id = v_row.group_ref;

  if v_row.removed_from_api then
    raise exception 'catalog_admin: a removed option cannot be the default' using errcode = 'P0001';
  end if;
  v_blocked := public.catalog_option_blocked_reason(v_row.geometry);
  if v_blocked is not null then
    raise exception 'catalog_admin: option blocked: %', v_blocked using errcode = 'P0001';
  end if;

  if v_row.is_default then
    return jsonb_build_object('id', p_id, 'subcategory_ref', v_subcategory_ref, 'changed', '[]'::jsonb);
  end if;

  select id into v_previous
    from public.lumaprints_options
   where group_ref = v_row.group_ref and is_default = true and id <> p_id
   for update;

  if v_previous is not null then
    update public.lumaprints_options set is_default = false where id = v_previous;
    perform public.catalog_admin_audit('lumaprints_options', v_previous, 'is_default', 'true', 'false', v_by);
  end if;

  update public.lumaprints_options set is_default = true where id = p_id;
  perform public.catalog_admin_audit('lumaprints_options', p_id, 'is_default', 'false', 'true', v_by);

  delete from public.lumaprints_pricing_cache where subcategory_ref = v_subcategory_ref;

  return jsonb_build_object(
    'id', p_id,
    'subcategory_ref', v_subcategory_ref,
    'previous_default', v_previous,
    'changed', '["is_default"]'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Medium (family) switch on the legacy table. lumaprints_mediums is keyed by text, and
-- audit_log.record_id is a uuid, so the audit row carries a deterministic id derived
-- from the medium key.
-- ---------------------------------------------------------------------------

create or replace function public.catalog_admin_set_medium_enabled(p_medium text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid := public.catalog_admin_caller();
  v_current boolean;
  v_record uuid := md5('lumaprints_mediums:' || coalesce(p_medium, ''))::uuid;
  v_changed text[] := '{}';
begin
  if p_enabled is null then
    raise exception 'catalog_admin: enabled must be a boolean' using errcode = '22023';
  end if;
  select enabled into v_current from public.lumaprints_mediums where medium = p_medium for update;
  if not found then
    raise exception 'catalog_admin: medium not found' using errcode = 'P0002';
  end if;

  if v_current is distinct from p_enabled then
    update public.lumaprints_mediums set enabled = p_enabled where medium = p_medium;
    perform public.catalog_admin_audit('lumaprints_mediums', v_record, 'enabled', v_current::text, p_enabled::text, v_by);
    v_changed := array_append(v_changed, 'enabled');
    delete from public.lumaprints_pricing_cache
     where subcategory_ref in (select id from public.lumaprints_subcategories where medium = p_medium);
  end if;

  return jsonb_build_object('medium', p_medium, 'enabled', p_enabled, 'changed', to_jsonb(v_changed));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the five entry points are callable by signed-in users (the functions decide
-- who may proceed); the helpers are internal and run only inside a definer body.
-- ---------------------------------------------------------------------------

revoke all on function public.catalog_admin_caller() from public, anon, authenticated;
revoke all on function public.catalog_admin_audit(text, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.catalog_option_blocked_reason(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_admin_patch_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.catalog_admin_patch_bool(jsonb, text) from public, anon, authenticated;
revoke all on function public.catalog_admin_patch_int(jsonb, text) from public, anon, authenticated;
revoke all on function public.catalog_admin_patch_label(jsonb, text) from public, anon, authenticated;
revoke all on function public.catalog_admin_patch_note(jsonb, text) from public, anon, authenticated;

revoke all on function public.catalog_admin_patch_subcategory(uuid, jsonb) from public, anon;
revoke all on function public.catalog_admin_patch_group(uuid, jsonb) from public, anon;
revoke all on function public.catalog_admin_patch_option(uuid, jsonb) from public, anon;
revoke all on function public.catalog_admin_set_default_option(uuid) from public, anon;
revoke all on function public.catalog_admin_set_medium_enabled(text, boolean) from public, anon;

grant execute on function public.catalog_admin_patch_subcategory(uuid, jsonb) to authenticated, service_role;
grant execute on function public.catalog_admin_patch_group(uuid, jsonb) to authenticated, service_role;
grant execute on function public.catalog_admin_patch_option(uuid, jsonb) to authenticated, service_role;
grant execute on function public.catalog_admin_set_default_option(uuid) to authenticated, service_role;
grant execute on function public.catalog_admin_set_medium_enabled(text, boolean) to authenticated, service_role;
