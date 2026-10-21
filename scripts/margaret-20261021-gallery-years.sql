-- Authored by DotWin
-- Apply Margaret's confirmed artwork years without changing publication, crops, or subject tags.
-- Source: her October 20 email "Website questions", linked document:
-- https://drive.google.com/open?id=1hTIzrMH_0EIb9yJ-LqyWFIfht8hJeMOS5lo21C15CyA
-- Target project: MargaretEdmondson (klwkajukicsoiwpsgftt).
begin;
do $$
declare
  desired record;
  before_row jsonb;
  after_row jsonb;
  existing_tags text[];
  next_tags text[];
  matched_count integer := 0;
begin
  for desired in select id,title,year from (values
    ('90e0edd7-72d6-448d-bb8e-6eda77e2b011'::uuid, 'Play Ball', '2026'),
    ('8a4a9646-3f72-4d8e-aedc-bacdf1e267eb'::uuid, 'Happenstance', '2026'),
    ('acd6e4e1-1a46-4e0c-a6d7-027cf4d7acc0'::uuid, 'Intuition', '2026'),
    ('1083a2f6-5b53-4358-bd5d-f2d896862be0'::uuid, 'Love Birds', '2026'),
    ('a3dbf6ac-5aea-40b9-8b44-d5ce0d4a0538'::uuid, 'Don''t Mind Me', '2026'),
    ('db23d83f-a374-4278-9df7-a656e4d7988a'::uuid, 'Saguaro', '2026'),
    ('09b5692a-3e1e-4506-9f97-799b5a4f8bf5'::uuid, 'Girls Trip', '2026'),
    ('4318f2e0-5e62-47f4-919d-1111e2d39fda'::uuid, 'Think Again (Paintin'' the Ass)', '2026'),
    ('47afa157-ac15-4e07-915c-9966b34cf818'::uuid, 'Drayton Hall, Charleston, SC', '2025'),
    ('9a9e0a4f-1a6e-433e-97ce-4e140975d0b7'::uuid, 'Aiken-Rhett House, SC', '2025'),
    ('514af929-dad3-4a16-a0ab-45d917efce4c'::uuid, 'Audubon Swamp', '2025'),
    ('67e98e6e-88ef-42e8-8631-7da69acf0868'::uuid, 'Mad Cow', '2025'),
    ('d33ddb24-9849-416a-8973-4a3f9539e75f'::uuid, 'Three Horses', '2025'),
    ('d4cb8721-aa77-4753-9203-88355cfe94f3'::uuid, 'Pins and Needles', '2025'),
    ('4a0cdeeb-0d35-4af0-bac6-3a6373770c94'::uuid, 'Potential', '2025'),
    ('ad30b623-1bd9-4028-b058-5b80f431f41d'::uuid, 'Perspective Play', '2025'),
    ('8b29a146-4d34-4b1a-8837-bd044e6216c1'::uuid, 'Unexpected', '2025'),
    ('24681852-03cc-4ea8-9c5e-ed2a8c0a3df8'::uuid, 'Seeds', '2025'),
    ('3605c6cb-8a03-4b2d-808b-e65ac8f9aa40'::uuid, 'Let''s Go', '2025'),
    ('582c492f-c65d-4b4f-a543-c70656b53b1d'::uuid, 'Grow', '2025'),
    ('07578057-0167-42c5-be06-9b2a1ece0697'::uuid, 'Unseen Purpose', '2025'),
    ('080add65-e0a1-485f-92c3-abd1f7a730ce'::uuid, 'Curious Mind', '2025'),
    ('73296cd1-002c-43d4-a92f-46fe197d2719'::uuid, 'Arrival', '2025'),
    ('9bad626b-af92-4241-bd5b-b39acc10d43c'::uuid, 'Due Date', '2025'),
    ('32a54d3a-3753-4944-91cb-b957cc5a5f1d'::uuid, 'Seasonal Inspiration', '2025'),
    ('edce1cfa-9fd2-4b52-af1a-f1cf6a1b6f0f'::uuid, 'Hot Air', '2025'),
    ('c3bd3f1b-445b-4feb-a8f1-6be7ad4e9db1'::uuid, 'The Dual', '2025'),
    ('be18df2f-5967-4a30-ab7d-36808922e62a'::uuid, 'Solo', '2025'),
    ('7a39ac26-a8ec-4f5a-9818-abef94ea5a4e'::uuid, 'Hot Air II', '2025'),
    ('633d99b2-9c98-49bc-ac56-3bcd42a6afbf'::uuid, 'Royal', '2024'),
    ('9d728716-cbed-4d5e-a19a-b06db889a0c5'::uuid, 'Keepsake', '2024'),
    ('11ba220a-8c1e-4afe-8ba6-f17cd4a85aaa'::uuid, 'Deep in the Heart of Texas', '2024'),
    ('84107ec5-1aaf-4361-b88c-215aef810580'::uuid, 'Graze Daze', '2023'),
    ('e5e4f4b3-e190-4f24-862b-9dab84e85951'::uuid, 'Mountain Boat Dock', '2023'),
    ('9f90d224-177c-4e7c-a16e-ceec106a7618'::uuid, 'Sweet Home Alabama', '2023'),
    ('99bd0e38-f3b5-4107-9a72-0a9b11a93f5a'::uuid, 'Dolphin Watch', '2023'),
    ('ed935689-3737-4ee5-8958-c2245456cdf4'::uuid, 'Dig', '2023'),
    ('6caa084d-1923-410f-8cde-fadbd1e04db8'::uuid, 'Poolside', '2023'),
    ('dbcdc203-5851-4579-b25d-25ca0a8c935d'::uuid, 'Fun at the Beach', '2022'),
    ('195403da-9297-4fdf-92e8-533a74cbf712'::uuid, 'Flower Power', '2021'),
    ('3ad6f748-6476-4c3c-9d76-663134ce193c'::uuid, 'Seaside with Gull', '2020')
  ) as supplied(id,title,year) loop
    matched_count := matched_count + 1;
    select to_jsonb(p),p.tags into before_row,existing_tags from public.products p
      where p.id=desired.id and p.title=desired.title and p.status='active' for update;
    if before_row is null then
      raise exception 'Artwork changed or is unavailable: %',desired.title;
    end if;
    if exists (select 1 from unnest(coalesce(existing_tags,'{}'::text[])) as tag
      where btrim(tag) ~ '^(19|20)[0-9]{2}$' and btrim(tag) <> desired.year) then
      raise exception 'Conflicting year requires review: %',desired.title;
    end if;
    if desired.year = any(coalesce(existing_tags,'{}'::text[])) then continue; end if;
    next_tags := array_append(coalesce(existing_tags,'{}'::text[]),desired.year);
    update public.products set tags=next_tags where id=desired.id;
    select to_jsonb(p) into after_row from public.products p where p.id=desired.id;
    if not (after_row->'tags' ? desired.year) then
      raise exception 'Year verification failed: %',desired.title;
    end if;
    insert into public.audit_log(table_name,record_id,field_name,old_value,new_value)
      values ('products',desired.id,'margaret_gallery_year_20261021',before_row::text,after_row::text);
  end loop;
  if matched_count <> 41 then
    raise exception 'Expected all 41 artworks from the artist list';
  end if;
end $$;
commit;
