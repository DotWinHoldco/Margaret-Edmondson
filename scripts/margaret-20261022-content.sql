-- Authored by DotWin
-- Artist-requested LinkedIn profile, corroborated against the published CV.
-- Restore Unexpected's confirmed 2025 year, absent again after a subsequent product edit.
begin;
update public.site_settings set linkedin_url='https://www.linkedin.com/in/margaret-edmondson-724390192', updated_at=now()
  where id=true and linkedin_url is null;
do $$
declare
  before_row jsonb;
  after_row jsonb;
  current_tags text[];
begin
  select to_jsonb(p), tags into before_row,current_tags from public.products p
    where id='8b29a146-4d34-4b1a-8837-bd044e6216c1' and title='Unexpected' for update;
  if before_row is null then raise exception 'Unexpected artwork changed'; end if;
  if exists(select 1 from unnest(current_tags) tag where tag ~ '^(19|20)[0-9]{2}$' and tag <> '2025') then
    raise exception 'Conflicting artwork year';
  end if;
  if not ('2025' = any(coalesce(current_tags,'{}'::text[]))) then
    update public.products set tags=array_append(coalesce(current_tags,'{}'::text[]),'2025') where id='8b29a146-4d34-4b1a-8837-bd044e6216c1';
    select to_jsonb(p) into after_row from public.products p where id='8b29a146-4d34-4b1a-8837-bd044e6216c1';
    insert into public.audit_log(table_name,record_id,field_name,old_value,new_value)
      values ('products','8b29a146-4d34-4b1a-8837-bd044e6216c1','margaret_gallery_year_20261022',before_row::text,after_row::text);
  end if;
end $$;
commit;
