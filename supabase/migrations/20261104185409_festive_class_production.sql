-- Authored by DotWin. Unlimited-capacity class; immutable group registration and verified payment.
create table public.festive_classes (
 slug text primary key,
 accepting boolean not null default false,
 early_price integer not null check(early_price>0), regular_price integer not null check(regular_price>0),
 early_ends_at timestamptz not null, ends_at timestamptz not null check(ends_at>early_ends_at)
);
create table public.festive_registrations (
 id uuid primary key,
 class_slug text not null references public.festive_classes(slug), token_hash text not null,
 payload jsonb not null, unit_price integer not null check(unit_price>0), total integer not null check(total>0),
 mode text not null check(mode in ('test','live')), status text not null default 'pending' check(status in ('pending','paid','failed','expired')),
 stripe_session text unique, stripe_payment text, created_at timestamptz not null default now(), paid_at timestamptz
);
create index festive_registrations_class on public.festive_registrations(class_slug,created_at desc);
create index festive_registrations_email on public.festive_registrations((payload->>'email'),created_at desc);
create table public.festive_payment_events (
 id text primary key,
 registration_id uuid not null references public.festive_registrations(id), created_at timestamptz not null default now()
);
create index festive_payment_events_registration on public.festive_payment_events(registration_id);
alter table public.festive_classes enable row level security;
alter table public.festive_registrations enable row level security;
alter table public.festive_payment_events enable row level security;
revoke all on public.festive_classes,public.festive_registrations,public.festive_payment_events from anon,authenticated;
grant select on public.festive_classes,public.festive_registrations,public.festive_payment_events to authenticated;
create policy art_classes_owner on public.festive_classes for select to authenticated using((select public.is_admin_or_artist()));
create policy art_registrations_owner on public.festive_registrations for select to authenticated using((select public.is_admin_or_artist()));
create policy art_events_owner on public.festive_payment_events for select to authenticated using((select public.is_admin_or_artist()));

-- This database belongs to Artbyme. The site-wide Stripe toggle supplies payment mode.
insert into public.festive_classes(slug,early_price,regular_price,early_ends_at,ends_at)
values('festive-paint-at-the-market',2000,2500,'2026-11-21 00:00:00-06','2026-11-21 12:30:00-06');

create function public.festive_class_public() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('accepting',accepting and now()<ends_at,'mode',case when (select stripe_test_mode from public.site_settings where id=true) is false then 'live' else 'test' end)
 from public.festive_classes where slug='festive-paint-at-the-market';
$$;

-- Public registration is authorized by an unguessable capability, never by a caller-supplied tenant.
create function public.festive_reserve(p_id uuid,p_token text,p_payload jsonb,p_expected_price integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.festive_classes; o public.festive_registrations; person jsonb; price integer; quantity integer;
begin
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
   if o.token_hash<>encode(extensions.digest(p_token,'sha256'),'hex') or o.payload<>p_payload then raise exception 'Registration conflict';end if;
   if o.created_at<now()-interval '23 hours' or o.status in ('failed','expired') then raise exception 'Registration expired';end if;
   return jsonb_build_object('id',o.id,'payload',o.payload,'unit_price',o.unit_price,'total',o.total,'mode',o.mode,'status',o.status,'created_at',o.created_at,'paid_at',o.paid_at);
 end if;
 select * into c from public.festive_classes where slug='festive-paint-at-the-market';
 if not found or not c.accepting or now()>=c.ends_at then raise exception 'Registration closed';end if;
 price:=case when now()<c.early_ends_at then c.early_price else c.regular_price end;
 if p_expected_price is distinct from price then raise exception 'Price changed' using errcode='P2001';end if;
 -- Stripe's amount bound is per payment; there is no limit on class attendance.
 if quantity::bigint*price>99999999 then raise exception 'Payment amount too large';end if;
 perform pg_advisory_xact_lock(hashtextextended('art-email:'||lower(p_payload->>'email'),0));
 if (select count(*) from public.festive_registrations where lower(payload->>'email')=lower(p_payload->>'email') and created_at>now()-interval '1 hour')>=20 then raise exception 'Please try again later';end if;
 insert into public.festive_registrations(id,class_slug,token_hash,payload,unit_price,total,mode)
 values(p_id,c.slug,encode(extensions.digest(p_token,'sha256'),'hex'),p_payload,price,price*quantity,case when (select stripe_test_mode from public.site_settings where id=true) is false then 'live' else 'test' end) returning * into o;
 return jsonb_build_object('id',o.id,'payload',o.payload,'unit_price',o.unit_price,'total',o.total,'mode',o.mode,'status',o.status,'created_at',o.created_at,'paid_at',o.paid_at);
end $$;

create function public.festive_registration_status(p_id uuid,p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.festive_registrations;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null;end if;
 select * into o from public.festive_registrations where id=p_id and token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then return null;end if;
 return jsonb_build_object('id',o.id,'payload',o.payload,'unit_price',o.unit_price,'total',o.total,'mode',o.mode,'status',o.status,'created_at',o.created_at,'paid_at',o.paid_at);
end $$;

-- Durable delivery records share the class owner's transaction; only signed payments enqueue.
create table public.festive_email_deliveries (
 registration_id uuid not null references public.festive_registrations(id),
 kind text not null check(kind in ('buyer','studio')),
 sent_at timestamptz, provider_id text, lease_until timestamptz,
 primary key(registration_id,kind)
);
alter table public.festive_email_deliveries enable row level security;
revoke all on public.festive_email_deliveries from public,anon,authenticated;
grant select on public.festive_email_deliveries to authenticated;
create policy festive_email_admin on public.festive_email_deliveries for select to authenticated using((select public.is_admin_or_artist()));
grant all on public.festive_classes,public.festive_registrations,public.festive_payment_events,public.festive_email_deliveries to service_role;

-- Only a verified webhook can settle. No browser return URL or anonymous RPC can mark paid.
create function public.festive_payment(p_id uuid,p_event text,p_session text,p_payment text,p_amount integer,p_currency text,p_mode text,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.festive_registrations;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501';end if;
 select * into o from public.festive_registrations where id=p_id for update;
 if not found or p_amount is distinct from o.total or p_currency is distinct from 'usd' or p_mode is distinct from o.mode
 or p_status is null or p_status not in ('pending','paid','failed','expired') or coalesce(p_event,'') !~ '^evt_' or coalesce(p_session,'') !~ '^cs_'
 or (o.stripe_session is not null and o.stripe_session<>p_session) then raise exception 'Payment evidence mismatch';end if;
 if exists(select 1 from public.festive_payment_events where id=p_event) then return;end if;
 insert into public.festive_payment_events(id,registration_id) values(p_event,o.id);
 update public.festive_registrations set stripe_session=p_session,stripe_payment=coalesce(p_payment,stripe_payment),
 status=case when status='paid' then 'paid' when p_status='pending' and status in ('failed','expired') then status else p_status end,
 paid_at=case when p_status='paid' then coalesce(paid_at,now()) else paid_at end where id=o.id;
 if p_status='paid' and o.mode='live' then
   insert into public.festive_email_deliveries(registration_id,kind) values(o.id,'buyer'),(o.id,'studio') on conflict do nothing;
 end if;
end $$;

revoke all on function public.festive_class_public(),public.festive_reserve(uuid,text,jsonb,integer),public.festive_registration_status(uuid,text),public.festive_payment(uuid,text,text,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.festive_class_public(),public.festive_reserve(uuid,text,jsonb,integer),public.festive_registration_status(uuid,text) to anon,authenticated;
grant execute on function public.festive_payment(uuid,text,text,text,integer,text,text,text) to service_role;

-- A short lease serializes email workers; Resend idempotency covers a crash after sending.
create function public.festive_claim_email(p_id uuid,p_kind text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501';end if;
 update public.festive_email_deliveries set lease_until=now()+interval '2 minutes'
 where registration_id=p_id and kind=p_kind and sent_at is null and (lease_until is null or lease_until<now());
 return found;
end $$;
revoke all on function public.festive_claim_email(uuid,text) from public,anon,authenticated;
grant execute on function public.festive_claim_email(uuid,text) to service_role;
