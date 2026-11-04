begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare v_id uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid();
begin
 insert into public.festive_registrations(id,class_slug,token_hash,payload,unit_price,total,mode)
 values(v_id,'festive-paint-at-the-market','fixture','{}',2000,4000,'live'),(v_other,'festive-paint-at-the-market','fixture','{}',2000,4000,'test');
 perform public.festive_link_intent(v_id,'pi_fixture_elements',4000,'live');
 perform public.festive_link_intent(v_id,'pi_fixture_elements',4000,'live');
 begin
   perform public.festive_link_intent(v_id,'pi_wrong',4000,'live');
   raise exception 'Expected duplicate binding rejection' using errcode='P9999';
 exception when sqlstate 'P0001' then null; end;
 begin
   perform public.festive_payment_intent(v_id,'evt_wrong','pi_wrong',4000,'usd','live','paid');
   raise exception 'Expected wrong intent rejection' using errcode='P9999';
 exception when sqlstate 'P0001' then null; end;
 begin
   perform public.festive_payment_intent(v_id,'evt_wrong_amount','pi_fixture_elements',2000,'usd','live','paid');
   raise exception 'Expected wrong amount rejection' using errcode='P9999';
 exception when sqlstate 'P0001' then null; end;
 perform public.festive_payment_intent(v_id,'evt_processing','pi_fixture_elements',4000,'usd','live','pending');
 if exists(select 1 from public.festive_email_deliveries where registration_id=v_id) then raise exception 'Unpaid email';end if;
 perform public.festive_payment_intent(v_id,'evt_paid','pi_fixture_elements',4000,'usd','live','paid');
 perform public.festive_payment_intent(v_id,'evt_paid','pi_fixture_elements',4000,'usd','live','paid');
 perform public.festive_payment_intent(v_id,'evt_late_cancel','pi_fixture_elements',4000,'usd','live','expired');
 if (select status from public.festive_registrations where id=v_id)<>'paid' then raise exception 'Paid downgraded';end if;
 if (select count(*) from public.festive_email_deliveries where registration_id=v_id)<>2 then raise exception 'Missing email pair';end if;
 perform public.festive_link_intent(v_other,'pi_test_elements',4000,'test');
 perform public.festive_payment_intent(v_other,'evt_test_paid','pi_test_elements',4000,'usd','test','paid');
 if exists(select 1 from public.festive_email_deliveries where registration_id=v_other) then raise exception 'Test email';end if;
end $$;
rollback;
