-- Margin now applies to the FULL landed cost (Lumaprints cost + shipping) instead
-- of being added after the markup:  price = (cost + shipping) × (1 + margin/100).
-- e.g. $35 cost + $12 shipping = $47, at 100% margin → $94.
create or replace function reprice_variants(p_product uuid default null, p_category uuid default null)
returns integer language sql security definer as $$
  with site as (select coalesce(default_margin_pct, 100) m from site_settings where id = true),
  upd as (
    update product_variants v
    set price = round((coalesce(v.lumaprints_cost_cents, 0) + coalesce(v.shipping_cost_cents, 0))
                 * (1 + coalesce(v.margin_override_pct, p.default_margin_pct, c.default_margin_pct, (select m from site)) / 100.0)) / 100.0,
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
