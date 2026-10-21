-- Authored by DotWin
-- Owner-requested merchandising changes, atomic and audited. No schema changes.
-- Apply only to MargaretEdmondson (klwkajukicsoiwpsgftt), after build-check.
begin;
do $$
declare
  before_options jsonb;
  before_groups jsonb;
  before_categories jsonb;
  before_medium jsonb;
  before_block jsonb;
  row_before jsonb;
  row_after jsonb;
begin
  select jsonb_agg(to_jsonb(o)) into before_options
    from public.lumaprints_options o join public.lumaprints_option_groups g on g.id=o.group_ref
    join public.lumaprints_subcategories s on s.id=g.subcategory_ref
    where s.api_host='us.api.lumaprints.com' and s.medium in ('canvas','framed_canvas','framed_fine_art_paper');
  select jsonb_agg(to_jsonb(g)) into before_groups
    from public.lumaprints_option_groups g join public.lumaprints_subcategories s on s.id=g.subcategory_ref
    where s.api_host='us.api.lumaprints.com' and s.medium in ('canvas','framed_canvas','framed_fine_art_paper');
  select jsonb_agg(to_jsonb(c)) into before_categories from public.categories c where slug in ('beach','custom-portraits');

  select to_jsonb(b) into before_block from public.page_blocks b where id='2104756e-7665-4d12-a641-86be395d6873';
  select to_jsonb(m) into before_medium from public.lumaprints_mediums m where medium='framed_fine_art_paper';

  -- The provider's existing 1, 1.5, 2, 2.5 and 3 inch mats and requested black-core mat.
  update public.lumaprints_options o set enabled=true
    from public.lumaprints_option_groups g, public.lumaprints_subcategories s
    where o.group_ref=g.id and g.subcategory_ref=s.id and s.api_host='us.api.lumaprints.com'
      and s.medium='framed_fine_art_paper' and not o.removed_from_api
      and ((g.group_key='mat_size' and (o.geometry->>'per_side_in')::numeric between 1 and 3)
        or (g.group_key='mat_color' and o.api_option_name='White with Black Core'));

  -- Wire and kraft are included in every offered frame and priced by the normal quote engine.
  -- Clear first to respect the unique default-per-group index.
  update public.lumaprints_options o set is_default=false
    from public.lumaprints_option_groups g, public.lumaprints_subcategories s
    where o.group_ref=g.id and g.subcategory_ref=s.id and s.api_host='us.api.lumaprints.com'
      and ((s.medium='framed_fine_art_paper' and g.group_key='backing')
        or (s.medium in ('framed_canvas','framed_fine_art_paper') and g.group_key='hanging_hardware'));
  update public.lumaprints_options o set
      enabled = case when g.group_key='backing' then o.api_option_name='Kraft Paper' else o.api_option_name ~ '^Hanging Wire installed' end,
      is_default = case when g.group_key='backing' then o.api_option_name='Kraft Paper' else o.api_option_name ~ '^Hanging Wire installed' end
    from public.lumaprints_option_groups g, public.lumaprints_subcategories s
    where o.group_ref=g.id and g.subcategory_ref=s.id and s.api_host='us.api.lumaprints.com' and not o.removed_from_api
      and ((s.medium='framed_fine_art_paper' and g.group_key='backing')
        or (s.medium in ('framed_canvas','framed_fine_art_paper') and g.group_key='hanging_hardware'));
  update public.lumaprints_option_groups g set enabled=true, customer_visible=false
    from public.lumaprints_subcategories s
    where g.subcategory_ref=s.id and s.api_host='us.api.lumaprints.com'
      and ((s.medium='framed_fine_art_paper' and g.group_key='backing')
        or (s.medium in ('framed_canvas','framed_fine_art_paper') and g.group_key='hanging_hardware'));

  -- Solid colour is an API-supported alternative; Image Wrap remains blocked because it needs different image bleed.
  update public.lumaprints_option_groups g set enabled=true, customer_visible=true, display_label='Canvas sides'
    from public.lumaprints_subcategories s
    where g.subcategory_ref=s.id and s.api_host='us.api.lumaprints.com'
      and s.medium in ('canvas','framed_canvas') and g.group_key='canvas_border';
  update public.lumaprints_options o set enabled=true
    from public.lumaprints_option_groups g, public.lumaprints_subcategories s
    where o.group_ref=g.id and g.subcategory_ref=s.id and s.api_host='us.api.lumaprints.com'
      and s.medium in ('canvas','framed_canvas') and g.group_key='canvas_border'
      and o.api_option_name in ('Solid Color','Mirror Wrap') and not o.removed_from_api;

  update public.categories set name='Commissions', description='Commission a painting inspired by your people, pets, home, favorite places, or a personal idea.' where slug='custom-portraits';
  update public.categories set description='Coastal scenes, landmarks, and beach life from Florida (FL), South Carolina (SC), Alabama (AL), and California (CA).' where slug='beach';

  update public.page_blocks set config=jsonb_set(config,'{subheading}','"Personal paintings inspired by your people, pets, home, places, and ideas."'::jsonb)
    where id='2104756e-7665-4d12-a641-86be395d6873' and config->>'subheading'='Custom pet & house portraits in your medium of choice.';
  select to_jsonb(b) into row_after from public.page_blocks b where id='2104756e-7665-4d12-a641-86be395d6873';
  if before_block is distinct from row_after then
    insert into public.audit_log(table_name,record_id,field_name,old_value,new_value)
      values ('page_blocks','2104756e-7665-4d12-a641-86be395d6873','margaret_request_20261021',before_block::text,row_after::text);
  end if;

  for row_before in select value from jsonb_array_elements(before_options) loop
    select to_jsonb(o) into row_after from public.lumaprints_options o where id=(row_before->>'id')::uuid;
    if row_before is distinct from row_after then
      insert into public.audit_log(table_name,record_id,field_name,old_value,new_value)
        values ('lumaprints_options',(row_before->>'id')::uuid,'margaret_request_20261021',row_before::text,row_after::text);
    end if;
  end loop;
  for row_before in select value from jsonb_array_elements(before_groups) loop
    select to_jsonb(g) into row_after from public.lumaprints_option_groups g where id=(row_before->>'id')::uuid;
    if row_before is distinct from row_after then
      insert into public.audit_log(table_name,record_id,field_name,old_value,new_value)
        values ('lumaprints_option_groups',(row_before->>'id')::uuid,'margaret_request_20261021',row_before::text,row_after::text);
    end if;
  end loop;
  for row_before in select value from jsonb_array_elements(before_categories) loop
    select to_jsonb(c) into row_after from public.categories c where id=(row_before->>'id')::uuid;
    if row_before is distinct from row_after then
      insert into public.audit_log(table_name,record_id,field_name,old_value,new_value)
        values ('categories',(row_before->>'id')::uuid,'margaret_request_20261021',row_before::text,row_after::text);
    end if;
  end loop;
  -- Keep legacy checkout and the builder on the same backing as the configured path.
  update public.lumaprints_mediums set option_ids=array_replace(option_ids,94,95)
    where medium='framed_fine_art_paper';
  select to_jsonb(m) into row_after from public.lumaprints_mediums m where medium='framed_fine_art_paper';
  if before_medium is distinct from row_after then
    insert into public.audit_log(table_name,record_id,field_name,old_value,new_value)
      select 'lumaprints_mediums',s.id,'margaret_request_20261021',before_medium::text,row_after::text
      from public.lumaprints_subcategories s where s.api_host='us.api.lumaprints.com' and s.subcategory_id=(row_after->>'subcategory_id')::integer;
  end if;
  -- Abort the entire unit if any framed profile cannot supply the promised finish.
  if exists (select 1 from public.lumaprints_option_groups g join public.lumaprints_subcategories s on s.id=g.subcategory_ref
      where s.api_host='us.api.lumaprints.com' and s.enabled and s.medium in ('framed_canvas','framed_fine_art_paper')
      and (g.group_key='hanging_hardware' or (s.medium='framed_fine_art_paper' and g.group_key='backing'))
      and not exists (select 1 from public.lumaprints_options o where o.group_ref=g.id and o.is_default and o.enabled and not o.removed_from_api)) then
    raise exception 'Requested frame finish is unavailable; no changes applied';
  end if;
  -- New defaults change quotes. Cached wholesale prices must be fetched again.
  delete from public.lumaprints_pricing_cache c using public.lumaprints_subcategories s
    where c.subcategory_ref=s.id and s.api_host='us.api.lumaprints.com' and s.medium in ('framed_canvas','framed_fine_art_paper');
end $$;
commit;
