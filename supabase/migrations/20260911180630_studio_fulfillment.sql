-- Authored by DotWin. Additive, reversible studio fulfillment; existing provider prices stay intact.
alter table public.site_settings
  add column fulfillment_policy_version bigint not null default 1,
  add column studio_shipping_mode text not null default 'included' check (studio_shipping_mode in ('included','flat')),
  add column studio_shipping_fee_cents integer not null default 0 check (studio_shipping_fee_cents between 0 and 1000000),
  add column studio_lead_days integer not null default 10 check (studio_lead_days between 0 and 365),
  add column studio_ship_akhi boolean not null default true;

alter table public.products
  add column provider_shipping_mode text check (provider_shipping_mode in ('integration','included','flat')),
  add column provider_shipping_fee_cents integer check (provider_shipping_fee_cents between 0 and 1000000),
  add column studio_shipping_mode text check (studio_shipping_mode in ('included','flat')),
  add column studio_shipping_fee_cents integer check (studio_shipping_fee_cents between 0 and 1000000),
  add column studio_lead_days integer check (studio_lead_days between 0 and 365);

alter table public.product_variants
  add column studio_price_cents integer check (studio_price_cents between 1 and 100000000),
  add column studio_is_active boolean not null default false,
  add column studio_only boolean not null default false,
  add column studio_shipping_mode text check (studio_shipping_mode in ('included','flat')),
  add column studio_shipping_fee_cents integer check (studio_shipping_fee_cents between 0 and 1000000),
  add column studio_lead_days integer check (studio_lead_days between 0 and 365),
  add column studio_source_approved boolean not null default false;

-- Production references and instructions do not belong on publicly readable variants.
create table public.studio_variant_details (
 variant_id uuid primary key references public.product_variants(id) on delete cascade,
 specs jsonb not null default '{}'::jsonb
);
alter table public.studio_variant_details enable row level security;
create policy studio_variant_details_admin on public.studio_variant_details for all to authenticated
 using((select public.is_admin_or_artist())) with check((select public.is_admin_or_artist()));
revoke all on public.studio_variant_details from anon,authenticated;
grant select,insert,update on public.studio_variant_details to authenticated;
grant all on public.studio_variant_details to service_role;

update public.product_variants v set
  studio_price_cents = case when v.price > 0 then round(v.price * 100)::integer else null end,
  studio_is_active = coalesce(v.is_active, false),
  studio_source_approved = (v.variant_type = 'original' or exists (
    select 1 from public.products p join public.master_artworks m on m.id = p.master_artwork_id
    where p.id = v.product_id and m.print_status = 'ready' and m.print_storage_path is not null
  ));

update public.product_variants set studio_is_active=false where not studio_source_approved or studio_price_cents is null or (variant_type<>'original' and (medium is null or coalesce(width_in,0)<=0 or coalesce(height_in,0)<=0));

alter table public.orders add column fulfillment_hold_reason text, add column stripe_mode text check (stripe_mode in ('test','live'));
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending','processing','partially_fulfilled','fulfilled','shipped','delivered','cancelled','refunded','failed_payment','disputed'));

alter table public.order_items
  add column purchase_spec jsonb not null default '{}'::jsonb,
  add column shipping_fee_cents integer not null default 0,
  add column policy_version bigint;
alter table public.checkout_snapshots
  add column policy_version bigint,
  add column shipping_destination jsonb;
alter table public.order_items drop constraint if exists order_items_fulfillment_status_check;
alter table public.order_items add constraint order_items_fulfillment_status_check check (
  fulfillment_status in ('pending','submitting','submitted','in_production','shipped','delivered','cancelled','failed','failed_validation','paused')
);

create table public.studio_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  order_item_id uuid not null references public.order_items(id),
  replacement_of uuid references public.studio_jobs(id),
  quantity integer not null check (quantity between 1 and 99),
  status text not null default 'new' check (status in ('new','printing','framing','packing','on_hold','shipped','delivered','cancelled')),
  due_at timestamptz not null,
  assignee text not null default 'Margaret',
  notes text not null default '',
  hold_reason text,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index studio_jobs_initial_item on public.studio_jobs(order_item_id) where replacement_of is null;
create index studio_jobs_queue on public.studio_jobs(status, due_at);
create index studio_jobs_order on public.studio_jobs(order_id);
create index studio_jobs_replacement on public.studio_jobs(replacement_of);
alter table public.studio_jobs enable row level security;
create policy studio_jobs_admin on public.studio_jobs for all to authenticated
  using ((select public.is_admin_or_artist())) with check ((select public.is_admin_or_artist()));
revoke all on public.studio_jobs from anon, authenticated;
grant select, insert, update on public.studio_jobs to authenticated;
grant all on public.studio_jobs to service_role;

create table public.order_shipments (
  id uuid primary key, -- client-generated idempotency key
  order_id uuid not null references public.orders(id),
  carrier text not null,
  tracking_number text not null,
  tracking_url text,
  shipped_at timestamptz not null default now(),
  delivered_at timestamptz,
  postage_cents integer check (postage_cents between 0 and 1000000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index order_shipments_order on public.order_shipments(order_id);
create index order_shipments_author on public.order_shipments(created_by);
alter table public.order_shipments enable row level security;
create policy order_shipments_admin on public.order_shipments for all to authenticated
  using ((select public.is_admin_or_artist())) with check ((select public.is_admin_or_artist()));
revoke all on public.order_shipments from anon, authenticated;
grant select, insert, update on public.order_shipments to authenticated;
grant all on public.order_shipments to service_role;

create table public.order_shipment_items (
  shipment_id uuid not null references public.order_shipments(id),
  studio_job_id uuid not null references public.studio_jobs(id),
  quantity integer not null check (quantity between 1 and 99),
  primary key(shipment_id, studio_job_id)
);
create index order_shipment_items_job on public.order_shipment_items(studio_job_id);
alter table public.order_shipment_items enable row level security;
create policy order_shipment_items_admin on public.order_shipment_items for all to authenticated
  using ((select public.is_admin_or_artist())) with check ((select public.is_admin_or_artist()));
revoke all on public.order_shipment_items from anon, authenticated;
grant select, insert on public.order_shipment_items to authenticated;
grant all on public.order_shipment_items to service_role;

create table public.studio_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  job_id uuid references public.studio_jobs(id),
  actor_id uuid references auth.users(id),
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index studio_order_events_order on public.studio_order_events(order_id, created_at);
create index studio_order_events_job on public.studio_order_events(job_id);
create index studio_order_events_actor on public.studio_order_events(actor_id);
alter table public.studio_order_events enable row level security;
create policy studio_order_events_admin on public.studio_order_events for all to authenticated
  using ((select public.is_admin_or_artist())) with check ((select public.is_admin_or_artist()));
revoke all on public.studio_order_events from anon, authenticated;
grant select, insert on public.studio_order_events to authenticated;
grant all on public.studio_order_events to service_role;

create table public.studio_notifications (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null unique references public.order_shipments(id),
  status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  sent_at timestamptz,
  payload jsonb,
  first_attempt_at timestamptz,
  created_at timestamptz not null default now()
);
create index studio_notifications_pending on public.studio_notifications(run_after) where status in ('queued','failed');
alter table public.studio_notifications enable row level security;
create policy studio_notifications_admin on public.studio_notifications for all to authenticated
  using ((select public.is_admin_or_artist())) with check ((select public.is_admin_or_artist()));
revoke all on public.studio_notifications from anon, authenticated;
grant select, insert, update on public.studio_notifications to authenticated;
grant all on public.studio_notifications to service_role;

-- Only storefront-safe configuration is exposed. No credentials, margins, email, or private paths.
create or replace function public.get_fulfillment_policy()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('lumaprints_enabled',s.lumaprints_enabled,
    'version',s.fulfillment_policy_version,'shipping_mode',s.studio_shipping_mode,
    'shipping_fee_cents',s.studio_shipping_fee_cents,'lead_days',s.studio_lead_days,'ship_akhi',s.studio_ship_akhi)
  from public.site_settings s where s.id = true;
$$;
revoke all on function public.get_fulfillment_policy() from public, anon, authenticated;
grant execute on function public.get_fulfillment_policy() to anon, authenticated, service_role;

create or replace function public.studio_policy_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.lumaprints_enabled,new.studio_shipping_mode,new.studio_shipping_fee_cents,new.studio_lead_days,new.studio_ship_akhi)
    is distinct from (old.lumaprints_enabled,old.studio_shipping_mode,old.studio_shipping_fee_cents,old.studio_lead_days,old.studio_ship_akhi) then
    new.fulfillment_policy_version := old.fulfillment_policy_version + 1;
    if new.lumaprints_enabled = false then
      update public.order_items set fulfillment_status = 'paused'
        where fulfillment_type = 'lumaprints' and fulfillment_status in ('pending','failed','failed_validation');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.studio_policy_change() from public, anon, authenticated;
create trigger studio_policy_change before update on public.site_settings for each row execute function public.studio_policy_change();

-- Dispatch claims and mode changes lock the same policy row. Claims made before OFF
-- may already be in flight; OFF never claims to retract those requests.
create or replace function public.claim_fulfillment_items(p_item_ids uuid[])
returns table(id uuid) language plpgsql security invoker set search_path = '' as $$
declare enabled boolean;
begin
  if cardinality(p_item_ids) not between 1 and 100 then raise exception 'Invalid item count'; end if;
  select lumaprints_enabled into strict enabled from public.site_settings where site_settings.id = true for share;
  perform 1 from public.orders o where o.id in (select oi.order_id from public.order_items oi where oi.id=any(p_item_ids)) order by o.id for share;
  return query update public.order_items oi set fulfillment_status = 'submitting'
    from public.orders o where oi.id = any(p_item_ids) and o.id = oi.order_id
    and o.status in ('processing','partially_fulfilled') and o.fulfillment_hold_reason is null
    and oi.fulfillment_status in ('pending','failed','failed_validation')
    and (oi.fulfillment_type <> 'lumaprints' or enabled = true)
    returning oi.id;
end;
$$;
revoke all on function public.claim_fulfillment_items(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_fulfillment_items(uuid[]) to service_role;

create or replace function public.start_studio_fulfillment(p_order_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.orders where id = p_order_id and status in ('processing','partially_fulfilled') and fulfillment_hold_reason is null for update;
  if not found then return; end if;
  insert into public.studio_jobs(order_id,order_item_id,quantity,due_at)
    select oi.order_id,oi.id,oi.quantity,now() + make_interval(days => least(365,greatest(0,coalesce((oi.purchase_spec->>'lead_days')::integer,10))))
    from public.order_items oi where oi.order_id = p_order_id and oi.fulfillment_type = 'self_ship'
    and oi.fulfillment_status in ('pending','submitting','submitted')
    on conflict (order_item_id) where replacement_of is null do nothing;
  update public.order_items set fulfillment_status = 'submitted' where order_id = p_order_id
    and fulfillment_type = 'self_ship' and fulfillment_status in ('pending','submitting');
end;
$$;
revoke all on function public.start_studio_fulfillment(uuid) from public, anon, authenticated;
grant execute on function public.start_studio_fulfillment(uuid) to service_role, authenticated;

create or replace function public.update_studio_job(p_job_id uuid, p_revision integer, p_status text, p_assignee text, p_notes text, p_due_at timestamptz, p_hold_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
declare j public.studio_jobs; o public.orders; kind text;
begin
  select * into strict j from public.studio_jobs where id=p_job_id;
  select * into strict o from public.orders where id=j.order_id for update;
  select * into strict j from public.studio_jobs where id=p_job_id for update;
  if j.revision <> p_revision then raise exception 'This work item changed. Refresh before saving.'; end if;
  if (o.status in ('cancelled','refunded','failed_payment','disputed','pending') or o.fulfillment_hold_reason is not null) and p_status <> 'cancelled' then raise exception 'This order is not eligible for production.'; end if;
  if p_status not in ('new','printing','framing','packing','on_hold','cancelled') then raise exception 'Use the shipment action to ship or deliver.'; end if;
  if j.status in ('shipped','delivered','cancelled') then raise exception 'Completed work cannot be reopened. Create a replacement.'; end if;
  if length(p_assignee)>120 or length(p_notes)>10000 or p_due_at is null then raise exception 'Invalid work details'; end if;
  if p_status='on_hold' and length(trim(coalesce(p_hold_reason,'')))=0 then raise exception 'A hold reason is required.'; end if;
  select purchase_spec->>'kind' into kind from public.order_items where id=j.order_item_id;
  if kind='original' and p_status in ('printing','framing') then raise exception 'Originals move directly to packing.'; end if;
  update public.studio_jobs set status=p_status,assignee=p_assignee,notes=p_notes,due_at=p_due_at,
    hold_reason=case when p_status='on_hold' then left(p_hold_reason,1000) else null end,
    revision=revision+1,updated_at=now() where id=p_job_id;
  if p_status='cancelled' and j.replacement_of is null then
    update public.order_items set fulfillment_status='cancelled' where id=j.order_item_id;
  end if;
  insert into public.studio_order_events(order_id,job_id,actor_id,event_type,detail)
    values(j.order_id,j.id,auth.uid(),'work_updated',jsonb_build_object('from',j.status,'to',p_status,'assignee',p_assignee));
end;
$$;
revoke all on function public.update_studio_job(uuid,integer,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.update_studio_job(uuid,integer,text,text,text,timestamptz,text) to authenticated;

create or replace function public.record_studio_shipment(p_id uuid,p_order_id uuid,p_carrier text,p_tracking_number text,p_tracking_url text,p_postage_cents integer,p_items jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare o public.orders; j public.studio_jobs; line jsonb; sent integer; qty integer; current_shipment public.order_shipments;
begin
  select * into strict o from public.orders where id=p_order_id for update;
  select * into current_shipment from public.order_shipments where id=p_id;
  if found then
    if (current_shipment.order_id,current_shipment.carrier,current_shipment.tracking_number,current_shipment.tracking_url,current_shipment.postage_cents)
      is distinct from (p_order_id,trim(p_carrier),trim(p_tracking_number),p_tracking_url,p_postage_cents)
      or (select coalesce(jsonb_agg(jsonb_build_object('job_id',studio_job_id,'quantity',quantity) order by studio_job_id),'[]'::jsonb) from public.order_shipment_items where shipment_id=p_id)
         is distinct from (select jsonb_agg(value order by value->>'job_id') from jsonb_array_elements(p_items))
      then raise exception 'Shipment key already used with different details. Refresh this order.'; end if;
    return p_id;
  end if;
  if o.fulfillment_hold_reason is not null or o.status not in ('processing','partially_fulfilled','shipped','delivered') then raise exception 'This order is not eligible to ship.'; end if;
  if length(trim(p_carrier)) not between 1 and 80 or length(trim(p_tracking_number)) not between 1 and 160 then raise exception 'Carrier and tracking are required.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Select shipment items'; end if;
  if p_tracking_url is not null and p_tracking_url !~ '^https://' then raise exception 'Tracking URL must use HTTPS'; end if;
  insert into public.order_shipments(id,order_id,carrier,tracking_number,tracking_url,postage_cents,created_by)
    values(p_id,p_order_id,trim(p_carrier),trim(p_tracking_number),p_tracking_url,p_postage_cents,auth.uid());
  for line in select value from jsonb_array_elements(p_items) loop
    select * into strict j from public.studio_jobs where id=(line->>'job_id')::uuid and order_id=p_order_id for update;
    if j.status <> 'packing' then raise exception 'Only work ready to pack can ship.'; end if;
    qty := (line->>'quantity')::integer;
    select coalesce(sum(quantity),0) into sent from public.order_shipment_items where studio_job_id=j.id;
    if qty is null or qty<1 or sent+qty>j.quantity then raise exception 'Shipment quantity exceeds remaining work.'; end if;
    insert into public.order_shipment_items values(p_id,j.id,qty);
    if sent+qty=j.quantity then
      update public.studio_jobs set status='shipped',revision=revision+1,updated_at=now() where id=j.id;
      if j.replacement_of is null then
        update public.order_items set fulfillment_status='shipped',carrier=p_carrier,tracking_number=p_tracking_number,tracking_url=p_tracking_url,shipped_at=now() where id=j.order_item_id;
      end if;
    end if;
  end loop;
  update public.orders set status=case when not exists(select 1 from public.order_items where order_id=p_order_id and fulfillment_status not in ('shipped','delivered','cancelled')) then 'shipped' else 'partially_fulfilled' end,updated_at=now() where id=p_order_id and status in ('processing','partially_fulfilled');
  insert into public.studio_notifications(shipment_id) values(p_id);
  insert into public.studio_order_events(order_id,actor_id,event_type,detail) values(p_order_id,auth.uid(),'shipped',jsonb_build_object('shipment_id',p_id,'tracking_number',p_tracking_number));
  return p_id;
end;
$$;
revoke all on function public.record_studio_shipment(uuid,uuid,text,text,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.record_studio_shipment(uuid,uuid,text,text,text,integer,jsonb) to authenticated;

create or replace function public.deliver_studio_shipment(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare shipment public.order_shipments; j record;
begin
  select * into strict shipment from public.order_shipments where id=p_id;
  perform 1 from public.orders where id=shipment.order_id for update;
  if shipment.delivered_at is not null then return; end if;
  update public.order_shipments set delivered_at=coalesce(delivered_at,now()) where id=p_id;
  for j in select sj.* from public.studio_jobs sj join public.order_shipment_items si on si.studio_job_id=sj.id where si.shipment_id=p_id loop
    if (select coalesce(sum(si.quantity),0) from public.order_shipment_items si join public.order_shipments s on s.id=si.shipment_id where si.studio_job_id=j.id and s.delivered_at is not null) = j.quantity then
      update public.studio_jobs set status='delivered',revision=revision+1,updated_at=now() where id=j.id;
      if j.replacement_of is null then update public.order_items set fulfillment_status='delivered',delivered_at=now() where id=j.order_item_id; end if;
    end if;
  end loop;
  update public.orders set status='delivered',updated_at=now() where id=shipment.order_id and status in ('processing','partially_fulfilled','shipped') and not exists(select 1 from public.order_items where order_id=shipment.order_id and fulfillment_status not in ('delivered','cancelled'));
end;
$$;
revoke all on function public.deliver_studio_shipment(uuid) from public, anon, authenticated;
grant execute on function public.deliver_studio_shipment(uuid) to authenticated;

create or replace function public.replace_studio_job(p_id uuid,p_job_id uuid,p_reason text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare j public.studio_jobs;
begin
  select * into strict j from public.studio_jobs where id=p_job_id;
  perform 1 from public.orders where id=j.order_id and status in ('processing','partially_fulfilled','shipped','delivered') and fulfillment_hold_reason is null for update;
  if not found then raise exception 'This order is not eligible for replacement production.'; end if;
  if exists(select 1 from public.studio_jobs where id=p_id and replacement_of=p_job_id) then return p_id; end if;
  if j.status not in ('shipped','delivered') or length(trim(p_reason)) not between 1 and 1000 then raise exception 'A shipped job and replacement reason are required.'; end if;
  if exists(select 1 from public.order_items where id=j.order_item_id and purchase_spec->>'kind'='original') then raise exception 'An original cannot be reprinted. Handle its return separately.'; end if;
  insert into public.studio_jobs(id,order_id,order_item_id,replacement_of,quantity,due_at,notes) values(p_id,j.order_id,j.order_item_id,j.id,j.quantity,now()+interval '10 days',p_reason);
  insert into public.studio_order_events(order_id,job_id,actor_id,event_type,detail) values(j.order_id,p_id,auth.uid(),'replacement_created',jsonb_build_object('reason',p_reason,'original_job',j.id));
  return p_id;
end;
$$;
revoke all on function public.replace_studio_job(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.replace_studio_job(uuid,uuid,text) to authenticated;

-- Cancelling/refunding an order stops outstanding work, including recovery sweeps.
create or replace function public.stop_studio_order()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status in ('cancelled','refunded','disputed','failed_payment') and new.status is distinct from old.status then
    update public.studio_jobs set status=case when new.status in ('disputed','failed_payment') then 'on_hold' else 'cancelled' end,
      hold_reason=case when new.status in ('disputed','failed_payment') then 'Payment needs review' else hold_reason end,revision=revision+1,updated_at=now()
      where order_id=new.id and status not in ('shipped','delivered','cancelled');
    update public.order_items set fulfillment_status=case when new.status in ('disputed','failed_payment') then 'paused' else 'cancelled' end
      where order_id=new.id and fulfillment_status in ('pending','failed','failed_validation','paused') or
      (order_id=new.id and fulfillment_type='self_ship' and fulfillment_status in ('submitting','submitted','in_production'));
  end if;
  return new;
end;
$$;
revoke all on function public.stop_studio_order() from public, anon, authenticated;
create trigger stop_studio_order after update on public.orders for each row execute function public.stop_studio_order();

create or replace function public.save_studio_product(p_product_id uuid,p_product jsonb,p_variants jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare v jsonb;
begin
  perform 1 from public.products where id=p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if not public.is_admin_or_artist() then raise exception 'Forbidden'; end if;
  if jsonb_array_length(p_variants)>100 then raise exception 'Too many options'; end if;
  update public.products set provider_shipping_mode=p_product->>'provider_shipping_mode',
    provider_shipping_fee_cents=(p_product->>'provider_shipping_fee_cents')::integer,studio_shipping_mode=p_product->>'studio_shipping_mode',
    studio_shipping_fee_cents=(p_product->>'studio_shipping_fee_cents')::integer,
    studio_lead_days=(p_product->>'studio_lead_days')::integer,updated_at=now() where id=p_product_id;
  for v in select value from jsonb_array_elements(p_variants) loop
    if coalesce((v->>'studio_is_active')::boolean,false) and (
      (v->>'studio_price_cents')::integer is null or (v->>'studio_price_cents')::integer<1 or
      not coalesce((v->>'studio_source_approved')::boolean,false)) then raise exception 'Live prints need a price and approved production source'; end if;
    if (v->>'new')::boolean = true and not exists(select 1 from public.product_variants where id=(v->>'id')::uuid and product_id=p_product_id) then
      insert into public.product_variants(id,product_id,name,price,variant_type,medium,width_in,height_in,size_label,is_active,is_lumaprints_available,studio_only,
        studio_price_cents,studio_is_active,studio_source_approved,studio_shipping_mode,studio_shipping_fee_cents,studio_lead_days)
      values((v->>'id')::uuid,p_product_id,v->>'name',0,case when v->>'medium' like 'framed_%' then 'framed_canvas_print' else 'canvas_print' end,v->>'medium',(v->>'width_in')::numeric,(v->>'height_in')::numeric,
        (v->>'width_in')||' × '||(v->>'height_in'),false,false,true,
        (v->>'studio_price_cents')::integer,(v->>'studio_is_active')::boolean,(v->>'studio_source_approved')::boolean,
        v->>'studio_shipping_mode',(v->>'studio_shipping_fee_cents')::integer,(v->>'studio_lead_days')::integer);
      update public.products set prints_enabled=true where id=p_product_id;
    else
      update public.product_variants set
        name=case when studio_only then coalesce(v->>'name',name) else name end,
        medium=case when studio_only then coalesce(v->>'medium',medium) else medium end,
        width_in=case when studio_only then coalesce((v->>'width_in')::numeric,width_in) else width_in end,
        height_in=case when studio_only then coalesce((v->>'height_in')::numeric,height_in) else height_in end,
        size_label=case when studio_only and v->>'width_in' is not null then (v->>'width_in')||' × '||(v->>'height_in') else size_label end,
        studio_price_cents=(v->>'studio_price_cents')::integer,
        studio_is_active=(v->>'studio_is_active')::boolean,studio_source_approved=(v->>'studio_source_approved')::boolean,
        studio_only=(v->>'studio_only')::boolean,
        studio_shipping_mode=v->>'studio_shipping_mode',studio_shipping_fee_cents=(v->>'studio_shipping_fee_cents')::integer,
        studio_lead_days=(v->>'studio_lead_days')::integer,updated_at=now()
        where id=(v->>'id')::uuid and product_id=p_product_id;
      if not found then raise exception 'Option not found'; end if;
    end if;
    insert into public.studio_variant_details(variant_id,specs) values((v->>'id')::uuid,coalesce(v->'studio_specs','{}'::jsonb))
      on conflict(variant_id) do update set specs=excluded.specs;
  end loop;
end;
$$;
revoke all on function public.save_studio_product(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_studio_product(uuid,jsonb,jsonb) to authenticated;

create or replace function public.transfer_to_studio(p_item_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
declare i public.order_items;
begin
  select * into strict i from public.order_items where id=p_item_id;
  perform 1 from public.orders where id=i.order_id and status in ('processing','partially_fulfilled') for update;
  if not found then raise exception 'Order cannot enter production'; end if;
  select * into strict i from public.order_items where id=p_item_id for update;
  if i.fulfillment_type<>'lumaprints' or i.fulfillment_status<>'paused' or i.external_order_id is not null then raise exception 'Only unsubmitted paused items can move to the studio'; end if;
  if length(trim(p_reason)) not between 1 and 1000 then raise exception 'Verification reason is required'; end if;
  update public.order_items set fulfillment_type='self_ship',fulfillment_status='pending' where id=p_item_id;
  perform public.start_studio_fulfillment(i.order_id);
  insert into public.studio_order_events(order_id,actor_id,event_type,detail) values(i.order_id,auth.uid(),'transferred_to_studio',jsonb_build_object('item_id',i.id,'reason',p_reason));
end;
$$;
revoke all on function public.transfer_to_studio(uuid,text) from public, anon, authenticated;
grant execute on function public.transfer_to_studio(uuid,text) to authenticated;

-- Bring existing paid self-shipped work into Margaret's queue. Completed packages
-- remain in the historical order ledger; no shipment or email is fabricated.
update public.order_items oi set purchase_spec = jsonb_build_object(
  'title',p.title,'option_name',v.name,'kind',coalesce(v.variant_type,'original'),
  'medium',oi.medium,'size_label',oi.size_label,'width_in',oi.print_width_in,'height_in',oi.print_height_in,'lead_days',10)
from public.products p, public.product_variants v
where p.id=oi.product_id and v.id=oi.variant_id and oi.purchase_spec='{}'::jsonb;
do $$ declare o record; begin
  for o in select distinct order_id from public.order_items where fulfillment_type='self_ship' and fulfillment_status in ('pending','submitting','submitted') loop
    perform public.start_studio_fulfillment(o.order_id);
  end loop;
end $$;

create or replace function public.release_studio_order_hold(p_order_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin_or_artist() or length(trim(p_reason)) not between 1 and 1000 then raise exception 'An administrator review reason is required'; end if;
  perform 1 from public.orders where id=p_order_id and fulfillment_hold_reason is not null and status in ('processing','partially_fulfilled') for update;
  if not found then raise exception 'No releasable hold found'; end if;
  update public.orders set fulfillment_hold_reason=null where id=p_order_id;
  insert into public.studio_order_events(order_id,actor_id,event_type,detail) values(p_order_id,auth.uid(),'payment_reviewed',jsonb_build_object('reason',p_reason));
  perform public.start_studio_fulfillment(p_order_id);
  perform public.queue_reviewed_fulfillment(p_order_id);
end;
$$;
revoke all on function public.release_studio_order_hold(uuid,text) from public, anon, authenticated;
grant execute on function public.release_studio_order_hold(uuid,text) to authenticated;

-- Search and pagination apply to the whole queue, including joined order details.
create or replace function public.list_studio_jobs(p_stage text default null,p_search text default '',p_offset integer default 0)
returns table(job jsonb,total bigint) language sql stable security invoker set search_path='' as $$
 select to_jsonb(j)||jsonb_build_object('is_overdue',j.due_at<now() and j.status not in ('shipped','delivered','cancelled'),'item',jsonb_build_object('purchase_spec',i.purchase_spec,'quantity',i.quantity,'unit_price',i.unit_price,'fulfillment_status',i.fulfillment_status),
  'order',jsonb_build_object('id',o.id,'email',o.email,'order_number',o.order_number,'status',o.status)),count(*) over()
 from public.studio_jobs j join public.order_items i on i.id=j.order_item_id join public.orders o on o.id=j.order_id
 where ((p_stage is null and j.status in ('new','printing','framing','packing','on_hold')) or j.status=p_stage)
 and (coalesce(p_search,'')='' or concat_ws(' ',i.purchase_spec->>'title',i.purchase_spec->>'option_name',o.email,o.order_number::text,o.id::text,j.assignee) ilike '%'||left(p_search,200)||'%')
 order by j.due_at,j.id limit 50 offset greatest(0,least(100000,p_offset));
$$;
revoke all on function public.list_studio_jobs(text,text,integer) from public,anon,authenticated;
grant execute on function public.list_studio_jobs(text,text,integer) to authenticated;

alter table public.order_items add column returned_at timestamptz;
create or replace function public.receive_studio_original_return(p_item_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare i public.order_items;
begin
 if not public.is_admin_or_artist() or length(trim(p_reason)) not between 1 and 1000 then raise exception 'Confirm the physical return and condition'; end if;
 select * into strict i from public.order_items where id=p_item_id;
 perform 1 from public.orders where id=i.order_id and status='refunded' for update;
 if not found then raise exception 'Complete the refund before receiving its return'; end if;
 select * into strict i from public.order_items where id=p_item_id for update;
 if i.returned_at is not null then return; end if;
 if i.purchase_spec->>'kind'<>'original' or i.shipped_at is null then raise exception 'Only a shipped original can be received here'; end if;
 perform 1 from public.product_variants where id=i.variant_id and variant_type='original' for update;
 if not found then raise exception 'Original inventory record not found'; end if;
 update public.product_variants set inventory_count=1 where id=i.variant_id;
 update public.order_items set returned_at=now() where id=i.id;
 insert into public.studio_order_events(order_id,actor_id,event_type,detail) values(i.order_id,auth.uid(),'original_returned',jsonb_build_object('item_id',i.id,'condition',p_reason));
end;
$$;
revoke all on function public.receive_studio_original_return(uuid,text) from public,anon,authenticated;
grant execute on function public.receive_studio_original_return(uuid,text) to authenticated;

-- A refund can restore unshipped originals; a shipped original needs a verified physical return.
create or replace function public.refund_original_holds(p_payment_ref text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select h.id as hold_id, h.variant_id
      from public.original_holds h
      join public.product_variants v on v.id = h.variant_id
     where h.payment_ref = p_payment_ref and h.status = 'converted'
       and not exists(select 1 from public.order_items oi join public.orders o on o.id=oi.order_id
         where oi.variant_id=h.variant_id and oi.shipped_at is not null
         and (o.stripe_payment_intent_id=h.payment_ref or o.stripe_checkout_session_id=h.payment_ref))
     order by h.variant_id
       for update of v, h
  loop
    update public.product_variants
       set inventory_count = coalesce(inventory_count, 0) + 1
     where id = r.variant_id;
    update public.original_holds
       set status = 'released', updated_at = now()
     where id = r.hold_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.refund_original_holds(text) from public,anon,authenticated;
grant execute on function public.refund_original_holds(text) to service_role;

create or replace function public.retry_studio_notification(p_shipment_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not public.is_admin_or_artist() then raise exception 'Forbidden'; end if;
 update public.studio_notifications set status='queued',attempts=0,run_after=now(),last_error=null
 where shipment_id=p_shipment_id and status='failed' and first_attempt_at>now()-interval '23 hours';
 if not found then raise exception 'Check the email provider log before sending another message; the safe retry window has ended or delivery is already queued.'; end if;
end;
$$;
revoke all on function public.retry_studio_notification(uuid) from public,anon,authenticated;
grant execute on function public.retry_studio_notification(uuid) to authenticated;

-- Explicit admin review may restart the existing service-only provider worker.
create or replace function public.queue_reviewed_fulfillment(p_order_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin_or_artist() then raise exception 'Forbidden'; end if;
 insert into public.fulfillment_jobs(order_id)
 select o.id from public.orders o where o.id=p_order_id and o.status in ('processing','partially_fulfilled')
 and o.fulfillment_hold_reason is null and exists(select 1 from public.order_items i where i.order_id=o.id and i.fulfillment_type<>'self_ship' and i.fulfillment_status='pending')
 on conflict(order_id) where status in ('queued','running') do nothing;
end;
$$;
revoke all on function public.queue_reviewed_fulfillment(uuid) from public,anon,authenticated;
grant execute on function public.queue_reviewed_fulfillment(uuid) to authenticated;

create or replace function public.resume_lumaprints_item(p_item_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare i public.order_items;
begin
 perform 1 from public.site_settings where id=true and lumaprints_enabled for share;
 if not found then raise exception 'Turn on Lumaprints before resuming this order.'; end if;
 select * into strict i from public.order_items where id=p_item_id;
 perform 1 from public.orders where id=i.order_id and status in ('processing','partially_fulfilled') and fulfillment_hold_reason is null for update;
 if not found then raise exception 'Review payment or shipping before resuming this order.'; end if;
 select * into strict i from public.order_items where id=p_item_id for update;
 if i.fulfillment_type<>'lumaprints' or i.fulfillment_status<>'paused' or i.external_order_id is not null then raise exception 'Only unsubmitted paused work can resume'; end if;
 if length(trim(p_reason)) not between 1 and 1000 then raise exception 'Confirm the item has not already been ordered'; end if;
 update public.order_items set fulfillment_status='pending' where id=i.id;
 perform public.queue_reviewed_fulfillment(i.order_id);
 insert into public.studio_order_events(order_id,actor_id,event_type,detail) values(i.order_id,auth.uid(),'provider_resumed',jsonb_build_object('item_id',i.id,'reason',p_reason));
end;
$$;
revoke all on function public.resume_lumaprints_item(uuid,text) from public,anon,authenticated;
grant execute on function public.resume_lumaprints_item(uuid,text) to authenticated;
