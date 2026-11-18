-- Authored by DotWin. Separate class identity while preserving existing paid registrations.
-- Existing capabilities, pricing checks, payment settlement and RLS remain authoritative.
insert into public.festive_classes(slug,accepting,early_price,regular_price,early_ends_at,ends_at)
values('festive-paint-marion-il',false,2000,2500,'2026-11-23 00:00:00-06','2026-11-24 20:00:00-06');

create function public.festive_class_public_for(p_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('accepting',accepting and now()<ends_at,'mode',case when (select stripe_test_mode from public.site_settings where id=true) is false then 'live' else 'test' end)
 from public.festive_classes where slug=p_slug and slug in ('festive-paint-at-the-market','festive-paint-marion-il');
$$;

create function public.festive_reserve_for(p_id uuid,p_token text,p_payload jsonb,p_expected_price integer,p_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.festive_classes; o public.festive_registrations; person jsonb; price integer; quantity integer;
begin
 if p_slug is null or p_slug not in ('festive-paint-at-the-market','festive-paint-marion-il') then raise exception 'Unknown class';end if;
 if p_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_payload is null or pg_column_size(p_payload)>1000000 then raise exception 'Invalid registration';end if;
 if jsonb_typeof(p_payload)<>'object' or length(trim(coalesce(p_payload->>'name',''))) not between 2 and 120
 or length(coalesce(p_payload->>'email',''))>254 or coalesce(p_payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or length(trim(coalesce(p_payload->>'phone',''))) not between 7 and 40
 or coalesce(p_payload->>'phone','') !~ '^[+()0-9 .-]+$'
 or jsonb_typeof(p_payload->'painters') is distinct from 'array' then raise exception 'Invalid registration';end if;
 quantity:=jsonb_array_length(p_payload->'painters');
 if quantity<1 then raise exception 'Choose a painter';end if;
 for person in select value from jsonb_array_elements(p_payload->'painters') loop
   if jsonb_typeof(person)<>'object' or coalesce(person->>'painting','') not in ('snowman','ornament','reindeer','santa')
   or jsonb_typeof(person->'name') is distinct from 'string' or length(person->>'name')>80 then raise exception 'Invalid painter';end if;
 end loop;
 -- Serialize retries of one checkout and throttle abandoned reservations per contact.
 perform pg_advisory_xact_lock(hashtextextended('art:'||p_id::text,0));
 select * into o from public.festive_registrations where id=p_id;
 if found then
   if o.class_slug<>p_slug or o.token_hash<>encode(extensions.digest(p_token,'sha256'),'hex') or o.payload<>p_payload then raise exception 'Registration conflict';end if;
   if o.created_at<now()-interval '23 hours' or o.status in ('failed','expired') then raise exception 'Registration expired';end if;
   return jsonb_build_object('class_slug',o.class_slug,'id',o.id,'payload',o.payload,'unit_price',o.unit_price,'total',o.total,'mode',o.mode,'status',o.status,'created_at',o.created_at,'paid_at',o.paid_at);
 end if;
 select * into c from public.festive_classes where slug=p_slug;
 if not found or not c.accepting or now()>=c.ends_at then raise exception 'Registration closed';end if;
 price:=case when now()<c.early_ends_at then c.early_price else c.regular_price end;
 if p_expected_price is distinct from price then raise exception 'Price changed' using errcode='P2001';end if;
 -- Stripe's amount bound is per payment; there is no limit on class attendance.
 if quantity::bigint*price>99999999 then raise exception 'Payment amount too large';end if;
 perform pg_advisory_xact_lock(hashtextextended('art-email:'||lower(p_payload->>'email'),0));
 if (select count(*) from public.festive_registrations where lower(payload->>'email')=lower(p_payload->>'email') and created_at>now()-interval '1 hour')>=20 then raise exception 'Please try again later';end if;
 insert into public.festive_registrations(id,class_slug,token_hash,payload,unit_price,total,mode)
 values(p_id,c.slug,encode(extensions.digest(p_token,'sha256'),'hex'),p_payload,price,price*quantity,case when (select stripe_test_mode from public.site_settings where id=true) is false then 'live' else 'test' end) returning * into o;
 return jsonb_build_object('class_slug',o.class_slug,'id',o.id,'payload',o.payload,'unit_price',o.unit_price,'total',o.total,'mode',o.mode,'status',o.status,'created_at',o.created_at,'paid_at',o.paid_at);
end $$;

create or replace function public.festive_registration_status(p_id uuid,p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.festive_registrations;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null;end if;
 select * into o from public.festive_registrations where id=p_id and token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then return null;end if;
 return jsonb_build_object('class_slug',o.class_slug,'id',o.id,'payload',o.payload,'unit_price',o.unit_price,'total',o.total,'mode',o.mode,'status',o.status,'created_at',o.created_at,'paid_at',o.paid_at);
end $$;


create or replace function public.festive_reserve(p_id uuid,p_token text,p_payload jsonb,p_expected_price integer)
returns jsonb language sql security definer set search_path='' as $$
 select public.festive_reserve_for(p_id,p_token,p_payload,p_expected_price,'festive-paint-at-the-market');
$$;
revoke all on function public.festive_class_public_for(text),public.festive_reserve_for(uuid,text,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.festive_class_public_for(text),public.festive_reserve_for(uuid,text,jsonb,integer,text) to anon,authenticated;
