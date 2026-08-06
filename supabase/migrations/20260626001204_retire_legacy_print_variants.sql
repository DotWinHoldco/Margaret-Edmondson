-- Retire the legacy print-variant catalog so the rebuilt builder can regenerate
-- S/M/L defaults (with real sizes in the label) + Margaret's custom sizes.
--
-- AUTHORIZED DESTRUCTIVE STEP (explicitly requested). Scope is limited to PRINT
-- variants. ORIGINALS (variant_type = 'original' — the 22 physical paintings for
-- sale) are NEVER touched. Safe because there are 0 order_items today (verified
-- 2026-06-16), so the order_items.variant_id FK (no cascade) can't be violated.
--
-- Idempotent: re-running deletes nothing once the legacy rows are gone.
--
-- DOWN (manual): there is no row-level restore — the builder regenerates default
-- variants from the live LumaPrints catalog + each master's aspect ratio. If you
-- must revert, restore product_variants from the pre-migration backup snapshot
-- (take one first: see the build prompt Phase 0).

-- Safety guard: refuse to run if any order_item references a print variant
-- (would orphan an order). With 0 order_items this is a no-op; it protects
-- future re-runs.
do $$
declare referenced int;
begin
  select count(*) into referenced
  from public.order_items oi
  join public.product_variants v on v.id = oi.variant_id
  where coalesce(v.variant_type,'') <> 'original';
  if referenced > 0 then
    raise exception 'Refusing to delete % print variant(s) referenced by order_items. Snapshot/relink first.', referenced;
  end if;
end $$;

-- Delete every NON-original variant (the print catalog). Originals stay.
delete from public.product_variants
where coalesce(variant_type, '') <> 'original';
