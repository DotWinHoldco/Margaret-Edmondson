-- Authored by DotWin. Bind and settle the same PaymentIntent flow used by the shop.
create unique index festive_registration_payment_unique on public.festive_registrations(stripe_payment) where stripe_payment is not null;

create function public.festive_link_intent(p_id uuid,p_intent text,p_amount integer,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.festive_registrations;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501';end if;
 select * into o from public.festive_registrations where id=p_id for update;
 if not found or p_amount is distinct from o.total or p_mode is distinct from o.mode
 or coalesce(p_intent,'') !~ '^pi_' or o.stripe_session is not null
 or (o.stripe_payment is not null and o.stripe_payment<>p_intent) then raise exception 'Payment evidence mismatch';end if;
 update public.festive_registrations set stripe_payment=p_intent where id=p_id;
end $$;

create function public.festive_payment_intent(p_id uuid,p_event text,p_intent text,p_amount integer,p_currency text,p_mode text,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.festive_registrations;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501';end if;
 select * into o from public.festive_registrations where id=p_id for update;
 if not found or p_amount is distinct from o.total or p_currency is distinct from 'usd' or p_mode is distinct from o.mode
 or p_status is null or p_status not in ('pending','paid','expired') or coalesce(p_event,'') !~ '^evt_' or coalesce(p_intent,'') !~ '^pi_'
 or o.stripe_session is not null or o.stripe_payment is distinct from p_intent then raise exception 'Payment evidence mismatch';end if;
 if exists(select 1 from public.festive_payment_events where id=p_event) then return;end if;
 insert into public.festive_payment_events(id,registration_id) values(p_event,o.id);
 update public.festive_registrations set status=case when status='paid' then 'paid' else p_status end,
 paid_at=case when p_status='paid' then coalesce(paid_at,now()) else paid_at end where id=o.id;
 if p_status='paid' and o.mode='live' then
   insert into public.festive_email_deliveries(registration_id,kind) values(o.id,'buyer'),(o.id,'studio') on conflict do nothing;
 end if;
end $$;
revoke all on function public.festive_link_intent(uuid,text,integer,text),public.festive_payment_intent(uuid,text,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.festive_link_intent(uuid,text,integer,text),public.festive_payment_intent(uuid,text,text,integer,text,text,text) to service_role;
