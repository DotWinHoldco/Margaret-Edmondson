// Authored by DotWin
// The catalog subset a shopper's browser is allowed to hold (plan §7.1, ADR-8).
//
// The assembled tree carries operator material: the sentence explaining why an option
// is blocked, the provider bookkeeping, the sync timestamps, whatever a future column
// adds. None of that is a storefront concern, and a payload assembled by spreading a
// row leaks every one of those the moment the row gains a field. So this module is an
// explicit allow-list: every object below is rebuilt key by key, and a key that is not
// written here cannot reach a browser however the row changes.
//
// Two deliberate shapes:
//   - `blocked_reason` becomes `blocked: boolean`. The configurator has to render a
//     blocked option disabled rather than hide it (a hidden option is a dead end the
//     shopper cannot understand), but the reason TEXT is written for the operator, so
//     the fact travels and the sentence does not. The storefront shows the customer
//     copy from `CUSTOMER_VIOLATION_MESSAGES` instead.
//   - `geometry` is narrowed to the three keys a screen actually reasons with
//     (mat width, size whitelist, hex requirement). `probe_owed` is an operator note
//     and `requires_file_bleed_in` is already expressed as `blocked`.
//
// Pure module: types and one mapping function, no I/O, so the page, a script and a
// test all build the same payload.

import type {
  Catalog,
  CatalogOption,
  CatalogOptionGroup,
  CatalogSubcategory,
  DisplayKind,
  Geometry,
  Swatch,
} from './types'
import type { Medium } from '@/lib/pricing/mediums'

/** One choice, as a shopper's browser may know it. */
export interface StorefrontOption {
  id: string
  option_id: number
  display_label: string
  is_default: boolean
  sort_order: number
  swatch: Swatch | null
  geometry: Geometry | null
  effective_enabled: boolean
  /** The fact behind `blocked_reason`, never the operator's sentence. */
  blocked: boolean
}

/** One group of choices, as a shopper's browser may know it. */
export interface StorefrontGroup {
  id: string
  group_key: string
  display_label: string
  required: boolean
  customer_visible: boolean
  display_kind: DisplayKind
  depends_on_group: string | null
  depends_hidden_when: number[] | null
  sort_order: number
  default_option_id: number | null
  effective_enabled: boolean
  options: StorefrontOption[]
}

/** One sellable finish, as a shopper's browser may know it. */
export interface StorefrontSubcategory {
  id: string
  medium: Medium
  subcategory_id: number
  display_label: string
  description: string | null
  customer_note: string | null
  min_width_in: number
  max_width_in: number
  min_height_in: number
  max_height_in: number
  required_dpi: number
  max_glass_w_in: number | null
  max_glass_h_in: number | null
  sort_order: number
  effective_enabled: boolean
  groups: StorefrontGroup[]
}

/** What the product page hands the picker: an open door with its tree, or a closed one. */
export type ConfiguratorProp =
  | { open: true; catalog: StorefrontSubcategory[] }
  | { open: false }

function storefrontSwatch(swatch: Swatch | null): Swatch | null {
  if (!swatch) return null
  const out: Swatch = {}
  if (typeof swatch.color_hex === 'string') out.color_hex = swatch.color_hex
  if (typeof swatch.image_path === 'string') out.image_path = swatch.image_path
  if (typeof swatch.frame_face_in === 'number') out.frame_face_in = swatch.frame_face_in
  if (typeof swatch.frame_depth_in === 'number') out.frame_depth_in = swatch.frame_depth_in
  return out
}

function storefrontGeometry(geometry: Geometry | null): Geometry | null {
  if (!geometry) return null
  const out: Geometry = {}
  if (typeof geometry.per_side_in === 'number') out.per_side_in = geometry.per_side_in
  if (Array.isArray(geometry.size_whitelist)) {
    out.size_whitelist = geometry.size_whitelist.map(([w, h]): [number, number] => [w, h])
  }
  if (geometry.needs_hex === true) out.needs_hex = true
  return out
}

function storefrontOption(option: CatalogOption): StorefrontOption {
  return {
    id: option.id,
    option_id: option.option_id,
    display_label: option.display_label,
    is_default: option.is_default === true,
    sort_order: option.sort_order,
    swatch: storefrontSwatch(option.swatch),
    geometry: storefrontGeometry(option.geometry),
    effective_enabled: option.effective_enabled === true,
    blocked: option.blocked_reason !== null && option.blocked_reason !== undefined,
  }
}

function storefrontGroup(group: CatalogOptionGroup): StorefrontGroup {
  return {
    id: group.id,
    group_key: group.group_key,
    display_label: group.display_label,
    required: group.required === true,
    customer_visible: group.customer_visible === true,
    display_kind: group.display_kind,
    depends_on_group: group.depends_on_group,
    depends_hidden_when: group.depends_hidden_when === null ? null : [...group.depends_hidden_when],
    sort_order: group.sort_order,
    default_option_id: group.default_option_id,
    effective_enabled: group.effective_enabled === true,
    options: [...group.options]
      .sort((a, b) => a.sort_order - b.sort_order || a.option_id - b.option_id)
      .map(storefrontOption),
  }
}

function storefrontSubcategory(
  subcategory: CatalogSubcategory,
  groups: CatalogOptionGroup[],
): StorefrontSubcategory {
  return {
    id: subcategory.id,
    medium: subcategory.medium,
    subcategory_id: subcategory.subcategory_id,
    display_label: subcategory.display_label,
    description: subcategory.description,
    customer_note: subcategory.customer_note,
    min_width_in: subcategory.min_width_in,
    max_width_in: subcategory.max_width_in,
    min_height_in: subcategory.min_height_in,
    max_height_in: subcategory.max_height_in,
    required_dpi: subcategory.required_dpi,
    max_glass_w_in: subcategory.max_glass_w_in,
    max_glass_h_in: subcategory.max_glass_h_in,
    sort_order: subcategory.sort_order,
    effective_enabled: subcategory.effective_enabled === true,
    groups: [...groups]
      .sort((a, b) => a.sort_order - b.sort_order || a.group_key.localeCompare(b.group_key))
      .map(storefrontGroup),
  }
}

/**
 * The tree for one product: the sellable finishes of the mediums this product has
 * variants for, and nothing else.
 *
 * Sellable means `effective_enabled` at the subcategory level and at the group level.
 * Options are kept in FULL, including the ones that are off or blocked, because §7.1
 * requires a disabled control with a reason rather than a missing one: a shopper who
 * cannot see the mat they were told about has no way to learn it is unavailable.
 */
export function storefrontCatalogFor(
  catalog: Catalog,
  mediums: readonly string[],
): StorefrontSubcategory[] {
  const wanted = new Set(mediums)
  return catalog.subcategories
    .filter((subcategory) => wanted.has(subcategory.medium) && subcategory.effective_enabled === true)
    .sort((a, b) => a.sort_order - b.sort_order || a.subcategory_id - b.subcategory_id)
    .map((subcategory) =>
      storefrontSubcategory(
        subcategory,
        subcategory.groups.filter((group) => group.effective_enabled === true),
      ),
    )
}
