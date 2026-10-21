-- Original prices belong to the product base-price trigger, not print cost markup.
-- Saving a product also reprices its prints; absent print costs must not zero an original.
create or replace function public.reprice_variants(
  p_product uuid default null::uuid,
  p_category uuid default null::uuid
)
returns integer
language sql
security definer
set search_path to ''
as $function$
  with site as (select coalesce(default_margin_pct, 100) m from public.site_settings where id = true),
  upd as (
    update public.product_variants v
    set price = round((coalesce(v.lumaprints_cost_cents, 0) + coalesce(v.shipping_cost_cents, 0))
                 * (1 + coalesce(v.margin_override_pct, p.default_margin_pct, c.default_margin_pct, (select m from site)) / 100.0)) / 100.0,
        updated_at = now()
    from public.products p
    left join public.categories c on c.id = p.category_id
    where v.product_id = p.id
      and v.variant_type is distinct from 'original'
      and v.manual_price_override_cents is null
      and (p_product is null or v.product_id = p_product)
      and (p_category is null or p.category_id = p_category)
    returning 1
  )
  select count(*)::int from upd;
$function$;

revoke all on function public.reprice_variants(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reprice_variants(uuid, uuid) to service_role;
