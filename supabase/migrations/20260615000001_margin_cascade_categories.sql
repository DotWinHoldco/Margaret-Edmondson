-- Margin cascade (variant > product > category > site) + category default margins,
-- plus schema-drift fixes (product_categories was live-only; product_variants.updated_at
-- was written by code but never existed).

-- Category-level default markup % (NULL = inherit the site default).
alter table categories add column if not exists default_margin_pct numeric;

-- Product default margin becomes a true override: NULL = inherit category → site.
-- (Drop the old hard 100.0 default so an unset product actually inherits.)
alter table products alter column default_margin_pct drop default;

-- Many-to-many product↔category (cross-posting). Existed only in the live DB.
create table if not exists product_categories (
  product_id uuid not null references products(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists product_categories_pk on product_categories(product_id, category_id);

-- Audit column the variant routes already write.
alter table product_variants add column if not exists updated_at timestamptz default now();

-- Single-statement re-price across the cascade. Pass a product OR a category OR
-- neither (= whole catalog). Re-applies the resolved markup
-- (variant ?? product ?? category ?? site ?? 100) to the stored Lumaprints cost
-- for every non-manual-override variant. Returns the count updated.
create or replace function reprice_variants(p_product uuid default null, p_category uuid default null)
returns integer language sql security definer as $$
  with site as (select coalesce(default_margin_pct, 100) m from site_settings where id = true),
  upd as (
    update product_variants v
    set price = (round(coalesce(v.lumaprints_cost_cents, 0)
                 * (1 + coalesce(v.margin_override_pct, p.default_margin_pct, c.default_margin_pct, (select m from site)) / 100.0))
                 + coalesce(v.shipping_cost_cents, 0)) / 100.0,
        updated_at = now()
    from products p
    left join categories c on c.id = p.category_id
    where v.product_id = p.id
      and v.manual_price_override_cents is null
      and (p_product is null or v.product_id = p_product)
      and (p_category is null or p.category_id = p_category)
    returning 1
  )
  select count(*)::int from upd;
$$;
revoke all on function reprice_variants(uuid, uuid) from anon;
grant execute on function reprice_variants(uuid, uuid) to authenticated, service_role;
