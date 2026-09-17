-- Authored by DotWin
-- Old product slugs redirect instead of 404ing.
--
-- On 2026-09-14 the owner renamed "Think Again" (slug think-again → think-again-paintin-the-ass)
-- from the product editor. Nothing recorded the old slug, so the homepage tile, every
-- newsletter and every search result that carried it answered "Page not found" for three
-- days. This table remembers every slug a product has been published under; a trigger
-- writes it on every rename; the audit log backfills the renames that already happened.
--
-- Security shape: RLS on; browser roles may SELECT (an old slug is a public URL by
-- definition) and nothing else. Writes come from the trigger (SECURITY DEFINER, so an
-- admin's own product update — which runs under RLS as `authenticated` — can record the
-- rename without a write grant) and from the service role.

create table if not exists public.product_slug_redirects (
  old_slug   text primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists product_slug_redirects_product_id_idx
  on public.product_slug_redirects (product_id);

alter table public.product_slug_redirects enable row level security;

drop policy if exists "Anyone can read product_slug_redirects" on public.product_slug_redirects;
create policy "Anyone can read product_slug_redirects"
  on public.product_slug_redirects
  for select
  to anon, authenticated
  using (true);

-- Default privileges hand new tables to anon/authenticated in full; take everything back
-- and hand out SELECT alone. No write policy exists for either role, and no write grant.
revoke all on public.product_slug_redirects from anon, authenticated;
grant select on public.product_slug_redirects to anon, authenticated;

-- The trigger. SECURITY DEFINER so the row is written whoever renamed the product; the
-- search_path is pinned so the definer cannot be pointed at another schema's tables.
create or replace function public.record_product_slug_redirect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    if old.slug is not null and old.slug <> '' then
      insert into public.product_slug_redirects (old_slug, product_id)
      values (old.slug, new.id)
      on conflict (old_slug) do update
        set product_id = excluded.product_id,
            created_at = now();
    end if;
    -- A slug that is live again must not redirect away from itself.
    delete from public.product_slug_redirects where old_slug = new.slug;
  end if;
  return new;
end;
$$;

revoke all on function public.record_product_slug_redirect() from public, anon, authenticated;

drop trigger if exists product_slug_redirect on public.products;
create trigger product_slug_redirect
  after update of slug on public.products
  for each row
  execute function public.record_product_slug_redirect();

-- Backfill: every slug the audit log saw a product leave, pointed at the product that
-- left it most recently, unless some product holds that slug today.
insert into public.product_slug_redirects (old_slug, product_id)
select distinct on (a.old_value) a.old_value, a.record_id
from public.audit_log a
join public.products p on p.id = a.record_id
where a.table_name = 'products'
  and a.field_name = 'slug'
  and a.old_value is not null
  and a.old_value <> ''
  and not exists (select 1 from public.products q where q.slug = a.old_value)
order by a.old_value, a.created_at desc
on conflict (old_slug) do nothing;
