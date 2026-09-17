-- =============================================================================
-- Pricing cache v2 + the storefront configurator flag (plan §4.2, ADR-3, ADR-8).
--
-- The cache today is keyed (medium, size_label): one price per family per size,
-- which is the shape of a store that sells one configuration per medium. The
-- quote engine prices a CONFIGURATION -- a subcategory, a size, and a set of
-- option ids -- so the identity becomes (subcategory_ref, width_in, height_in,
-- price_key_hash), where price_key_hash is the sha256 of the sorted option ids
-- and '' means "no options" (plan §4.2, the pricing half of the two hashes).
--
-- Additive subcategories (canvas, framed canvas, metal, paper, foam, peel and
-- stick) store the provider's base price in `base_cents` and that response's own
-- per-option prices in `option_breakdown`, so any configuration of the same size
-- composes as base + the sum of its deltas without another provider call. The
-- 105xxx frame profiles price the WHOLE configuration (P14: the mat delta moves
-- with the paper and the backing chosen), so each of their rows is one exact
-- configuration and nothing is ever summed across rows.
--
-- `shipping_class_hash` is the sha256 of the sorted option ids that plausibly
-- change the weight or the box (frames, glazing, backboards, posts). Shipping is
-- quoted worst-case CONUS per class and reused by every configuration in the same
-- class at the same size, so choosing a different mat colour never re-quotes
-- freight.
--
-- Additive by design: every v2 column is nullable or defaulted, `medium` and
-- `size_label` become nullable so a v2 row need not fake a legacy key, and the
-- legacy unique (medium, size_label) stays until P8 retires the legacy engine.
-- Both engines therefore run side by side on one table, which is what keeps the
-- live store selling through the cutover.
--
-- RLS on lumaprints_pricing_cache already exists (admin read + admin write, with
-- server writes going through the service role) and is deliberately untouched.
-- =============================================================================

alter table lumaprints_pricing_cache
  add column if not exists subcategory_ref uuid references lumaprints_subcategories(id) on delete cascade,
  add column if not exists width_in numeric,
  add column if not exists height_in numeric,
  add column if not exists price_key_hash text,
  add column if not exists shipping_class_hash text not null default '',
  add column if not exists option_breakdown jsonb,
  add column if not exists base_cents integer;

-- A v2 row is identified by the configuration, not by a family label. Dropping
-- NOT NULL here (rather than writing a placeholder medium and size_label) keeps
-- the legacy unique key honest: NULLs do not collide in a unique index, so v2
-- rows cannot accidentally occupy a legacy (medium, size_label) slot.
alter table lumaprints_pricing_cache alter column medium drop not null;
alter table lumaprints_pricing_cache alter column size_label drop not null;

comment on column lumaprints_pricing_cache.subcategory_ref is
  'The lumaprints_subcategories row this price is for. NULL on a legacy (medium, size_label) row.';
comment on column lumaprints_pricing_cache.price_key_hash is
  'sha256 of the sorted option ids priced in this row; empty string means no options. Pricing identity (plan §4.2).';
comment on column lumaprints_pricing_cache.shipping_class_hash is
  'sha256 of the sorted option ids that change weight or box. Shipping is memoized per class, so mats and colours never re-quote freight.';
comment on column lumaprints_pricing_cache.option_breakdown is
  'The provider response''s own per-option prices, [{option_id, price_cents}], used to compose additive configurations without another call.';
comment on column lumaprints_pricing_cache.base_cents is
  'The provider base price for this subcategory and size, cents, before any option delta.';

-- The v2 identity. Partial, so the legacy rows (subcategory_ref NULL) are not
-- forced to carry a hash and cannot collide with each other on one NULL key.
create unique index if not exists lumaprints_pricing_cache_v2_key
  on lumaprints_pricing_cache (subcategory_ref, width_in, height_in, price_key_hash)
  where subcategory_ref is not null;

-- Toggling an option evicts every quote row of its subcategory (ADR-3, F7), and
-- the shipping memo reads by subcategory and size; both are this index.
create index if not exists lumaprints_pricing_cache_subcategory_idx
  on lumaprints_pricing_cache (subcategory_ref);

-- =============================================================================
-- ADR-8: the storefront cutover flag, seeded DARK.
--
-- The configurator and the legacy dropdown both ship. The flag decides which one
-- renders, so the cutover is a toggle rather than a deploy and the rollback is
-- the same toggle. It starts false: the catalog rows launch with only today's
-- live configuration enabled, so flipping it on is behaviour-neutral by
-- construction, and nothing customer-facing changes until an owner flips it.
-- =============================================================================

alter table site_settings
  add column if not exists print_configurator_enabled boolean not null default false;

comment on column site_settings.print_configurator_enabled is
  'ADR-8 storefront flag: false renders the legacy print dropdown, true renders the print configurator. Seeded dark; flipping it back is the rollback.';
