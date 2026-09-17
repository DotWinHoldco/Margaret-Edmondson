-- Authored by DotWin
-- Hardening after the independent security pass on the slug-redirect wave (PR #20).
--
--  1. A retired slug is readable by browser roles only while its product is sellable. The
--     first policy read every row, so the working slug of a draft — a title the store never
--     published — became queryable through the anon key the moment it was renamed. The
--     predicate runs under the caller's own RLS on `products`, so an anonymous reader sees
--     exactly the redirects of the products it could see anyway.
--  2. The trigger function pins an EMPTY search_path, the house standard for SECURITY
--     DEFINER in this repo (every reference inside it is schema-qualified). DEFINER itself
--     stays: the admin product editor updates `products` under RLS as `authenticated`
--     ("Admins can update products"), and browser roles hold no write grant on this table,
--     so without it a rename could not record the redirect.

drop policy if exists "Anyone can read product_slug_redirects" on public.product_slug_redirects;
drop policy if exists "Anyone can read redirects of sellable products" on public.product_slug_redirects;
create policy "Anyone can read redirects of sellable products"
  on public.product_slug_redirects
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_slug_redirects.product_id
        and p.status in ('active', 'sold')
    )
  );

create or replace function public.record_product_slug_redirect()
returns trigger
language plpgsql
security definer
set search_path = ''
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
