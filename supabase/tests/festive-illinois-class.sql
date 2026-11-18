-- Authored by DotWin. Rollback-only class isolation, price, capability and atomicity proof.
begin;
update public.festive_classes set accepting=true, ends_at=now()+interval '7 days', early_ends_at=now()+interval '2 days';
do $$
declare v_id uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid(); v_token text:=repeat('a',64);
 v_payload jsonb:='{"name":"Fixture Painter","email":"class-fixture@example.invalid","phone":"2025550100","painters":[{"name":"","painting":"santa"}]}';
 v_result jsonb; v_failed uuid:=gen_random_uuid();
begin
 v_result:=public.festive_reserve_for(v_id,v_token,v_payload,2000,'festive-paint-marion-il');
 assert v_result->>'class_slug'='festive-paint-marion-il';
 assert (v_result->>'total')::int=2000;
 assert public.festive_registration_status(v_id,v_token)->>'class_slug'='festive-paint-marion-il';
 assert public.festive_registration_status(v_id,repeat('b',64)) is null;
 assert public.festive_reserve_for(v_id,v_token,v_payload,2000,'festive-paint-marion-il')=v_result;
 begin
   perform public.festive_reserve_for(v_id,v_token,v_payload,2000,'festive-paint-at-the-market');
   raise exception 'Cross-class retry accepted' using errcode='P9999';
 exception when sqlstate 'P0001' then null; end;
 assert public.festive_reserve(v_other,v_token,v_payload,2000)->>'class_slug'='festive-paint-at-the-market';
 update public.festive_classes set early_ends_at=now()-interval '1 second' where slug='festive-paint-marion-il';
 begin
   perform public.festive_reserve_for(v_failed,v_token,v_payload,2000,'festive-paint-marion-il');
   raise exception 'Stale price accepted' using errcode='P9999';
 exception when sqlstate 'P2001' then null; end;
 assert not exists(select 1 from public.festive_registrations where id=v_failed);
 assert (public.festive_reserve_for(v_failed,v_token,v_payload,2500,'festive-paint-marion-il')->>'total')::int=2500;
 assert (public.festive_reserve_for(v_id,v_token,v_payload,2000,'festive-paint-marion-il')->>'total')::int=2000;
 begin
   perform public.festive_reserve_for(gen_random_uuid(),v_token,v_payload,2000,'unrecognized-class');
   raise exception 'Unknown class accepted' using errcode='P9999';
 exception when sqlstate 'P0001' then null; end;
end $$;
-- Inject a persistence failure and prove the reservation did not partially survive.
create function pg_temp.reject_illinois_fixture() returns trigger language plpgsql as $$
begin if new.payload->>'email'='rollback-fixture@example.invalid' then raise exception 'Injected persistence failure';end if;return new;end $$;
create trigger reject_illinois_fixture after insert on public.festive_registrations for each row execute function pg_temp.reject_illinois_fixture();
do $$ declare v_id uuid:=gen_random_uuid(); begin
 begin
   perform public.festive_reserve_for(v_id,repeat('c',64),'{"name":"Rollback Fixture","email":"rollback-fixture@example.invalid","phone":"2025550100","painters":[{"name":"","painting":"snowman"}]}',2500,'festive-paint-marion-il');
   raise exception 'Failure injection did not execute' using errcode='P9999';
 exception when sqlstate 'P0001' then null; end;
 assert not exists(select 1 from public.festive_registrations where id=v_id);
end $$;
rollback;
