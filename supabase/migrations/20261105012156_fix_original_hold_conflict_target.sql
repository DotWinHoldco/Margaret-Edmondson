-- Fix SQLSTATE 42702 at original-artwork checkout: variant_id is both an
-- output variable and a table column. Name the existing unique constraint
-- explicitly; preserve the return shape, row locks, TTL and access grants.
create or replace function public.hold_originals(
  p_payment_ref text,
  p_variant_ids uuid[],
  p_ttl_minutes integer default 35
)
returns table (variant_id uuid, ok boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_available integer;
  v_active integer;
begin
  if p_payment_ref is null or length(p_payment_ref) < 8 or length(p_payment_ref) > 255 then
    raise exception 'invalid payment_ref';
  end if;
  if p_ttl_minutes is null or p_ttl_minutes < 5 or p_ttl_minutes > 1440 then
    raise exception 'invalid ttl';
  end if;
  if p_variant_ids is null or cardinality(p_variant_ids) not between 1 and 100 then
    raise exception 'invalid variant list';
  end if;

  for r in
    select v.id, v.variant_type, v.inventory_count
      from public.product_variants v
     where v.id = any(p_variant_ids)
     order by v.id
       for update
  loop
    if r.variant_type is distinct from 'original' then
      variant_id := r.id; ok := true; return next; continue;
    end if;

    -- A reference whose hold already converted stays satisfied (idempotent).
    if exists (
      select 1 from public.original_holds h
       where h.payment_ref = p_payment_ref and h.variant_id = r.id
         and h.status = 'converted'
    ) then
      variant_id := r.id; ok := true; return next; continue;
    end if;

    -- NULL inventory_count has always meant "one unit available" on this
    -- platform (see reserve_original); keep that semantic.
    v_available := coalesce(r.inventory_count, 1);
    select count(*) into v_active
      from public.original_holds h
     where h.variant_id = r.id
       and h.status = 'held'
       and h.expires_at > now()
       and h.payment_ref <> p_payment_ref;

    if v_available - v_active > 0 then
      insert into public.original_holds as oh (variant_id, payment_ref, status, expires_at)
      values (r.id, p_payment_ref, 'held', now() + make_interval(mins => p_ttl_minutes))
      on conflict on constraint original_holds_payment_ref_variant_id_key do update
        set status = 'held',
            expires_at = excluded.expires_at,
            updated_at = now()
        where oh.status <> 'converted';
      variant_id := r.id; ok := true; return next;
    else
      variant_id := r.id; ok := false; return next;
    end if;
  end loop;
end;
$$;
