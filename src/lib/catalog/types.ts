// Authored by DotWin
// Catalog contract: the row shapes, the assembled tree, the selection, and the
// small pure helpers every catalog module codes against (plan §4, §5 ADR-1..ADR-5).
// Pure types + zod schemas only. No I/O in this file.

import { z } from 'zod'
import type { Medium } from '@/lib/pricing/mediums'

/** The LumaPrints API host a row was synced from. Ids are host-specific (§9 F12). */
export type ApiHost = 'us.api.lumaprints.com' | 'us.api-sandbox.lumaprints.com' | (string & {})

/**
 * Physical effect of an option, enforced identically at PDP, quote, checkout and
 * pre-submit (ADR-4). Absent key = no geometric effect.
 */
export const geometrySchema = z
  .object({
    /** Mats: glass = print + 2 × value per axis; the submitted size stays the PRINT size (P3). */
    per_side_in: z.number().positive().optional(),
    /**
     * Image Wrap (+3.75 in/axis) and every non-zero paper bleed: the file would need content
     * the aspect-exact masters do not have, so enabling is BLOCKED with a reason (P5, P15).
     */
    requires_file_bleed_in: z.number().positive().optional(),
    /** Metal easel: offerable only at these [width, height] pairs, orientation-aware (P9). */
    size_whitelist: z.array(z.tuple([z.number().positive(), z.number().positive()])).optional(),
    /** Solid Color Wrap: a #rrggbb is required and travels to `solidColorHexCode`. */
    needs_hex: z.boolean().optional(),
    /** Not yet image-checked (rolled-canvas border sizes): blocked until V3 records the probe. */
    probe_owed: z.string().min(1).optional(),
    /** Plausibly changes weight/box (frame, glazing, backboard, posts) → shipping re-quote. */
    shipping_class: z.boolean().optional(),
  })
  .strict()
export type Geometry = z.infer<typeof geometrySchema>

/** Preview material for an option (ADR-6). */
export const swatchSchema = z
  .object({
    color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    image_path: z.string().min(1).optional(),
    frame_face_in: z.number().positive().optional(),
    frame_depth_in: z.number().positive().optional(),
  })
  .strict()
export type Swatch = z.infer<typeof swatchSchema>

/** How a subcategory prices multi-option configurations (ADR-3 / F26). */
export type PricingMode = 'additive' | 'whole_config'
export type DisplayKind = 'swatch' | 'list' | 'radio'
export type SyncStatus = 'running' | 'completed' | 'failed' | 'cancelled'

// ---------------------------------------------------------------------------
// Row shapes (one per table in §4.1, as read back from PostgREST).
// ---------------------------------------------------------------------------

export interface CatalogSubcategoryRow {
  id: string
  medium: Medium
  subcategory_id: number
  api_host: string
  name: string
  display_label: string
  description: string | null
  min_width_in: number
  max_width_in: number
  min_height_in: number
  max_height_in: number
  required_dpi: number
  /** Glass ceiling for framed paper when it differs from the bounds; null = use max bounds. */
  max_glass_w_in: number | null
  max_glass_h_in: number | null
  enabled: boolean
  sort_order: number
  customer_note: string | null
  pricing_mode: PricingMode
  /** Sync bookkeeping (ADR-7): NEW badge = acknowledged_at is null; tombstone = removed_from_api. */
  first_seen_at: string
  last_seen_at: string
  acknowledged_at: string | null
  removed_from_api: boolean
  last_synced_at: string | null
}

export interface CatalogOptionGroupRow {
  id: string
  subcategory_ref: string
  /** Canonical, host-independent key (see keys.ts): 'canvas_border', 'mat_size', … */
  group_key: string
  api_group_name: string
  display_label: string
  /** Exactly one option must be submitted (seeded from P1: the three framed-canvas Frame Styles). */
  required: boolean
  /** false = admin-pinned default, never shown to the customer. */
  customer_visible: boolean
  enabled: boolean
  display_kind: DisplayKind
  /** group_key of the sibling group whose selection gates this one (Mat Color ← mat_size). */
  depends_on_group: string | null
  /** Option ids of that sibling group that HIDE this group (e.g. [No Mat]). */
  depends_hidden_when: number[] | null
  sort_order: number
  first_seen_at: string
  last_seen_at: string
  acknowledged_at: string | null
  removed_from_api: boolean
}

export interface CatalogOptionRow {
  id: string
  group_ref: string
  option_id: number
  api_option_name: string
  display_label: string
  enabled: boolean
  /** OUR default for the group (geometry-neutral). Exactly one per group (partial unique index). */
  is_default: boolean
  /** What the provider resolves when the group is omitted (learned by pricing with []; P15). */
  provider_default: boolean
  sort_order: number
  swatch: Swatch | null
  geometry: Geometry | null
  first_seen_at: string
  last_seen_at: string
  acknowledged_at: string | null
  removed_from_api: boolean
}

export interface CatalogSyncRunRow {
  id: string
  api_host: string
  status: SyncStatus
  dry_run: boolean
  cursor: SyncCursor
  stats: SyncStats
  diff: SyncDiff | null
  error: string | null
  started_at: string
  updated_at: string
  finished_at: string | null
}

/** Where a chunked run resumes (ADR-7). One chunk = one invocation ≤ ~20 provider requests. */
export interface SyncCursor {
  stage: 'categories' | 'subcategories' | 'options' | 'defaults' | 'finalize' | 'done'
  categoryIds?: number[]
  categoryIndex?: number
  subcategoryIds?: number[]
  subcategoryIndex?: number
}

export interface SyncStats {
  requests: number
  categories: number
  subcategories: number
  groups: number
  options: number
  inserted: number
  updated: number
  tombstoned: number
  chunks: number
}

/** Dry-run output: what a real run WOULD change, never applied. */
export interface SyncDiff {
  newSubcategories: Array<{ subcategory_id: number; name: string }>
  newGroups: Array<{ subcategory_id: number; api_group_name: string }>
  newOptions: Array<{ subcategory_id: number; api_group_name: string; option_id: number; api_option_name: string }>
  removedSubcategories: Array<{ subcategory_id: number; name: string }>
  removedGroups: Array<{ subcategory_id: number; group_key: string }>
  removedOptions: Array<{ subcategory_id: number; group_key: string; option_id: number }>
  changedBounds: Array<{ subcategory_id: number; field: string; from: unknown; to: unknown }>
}

// ---------------------------------------------------------------------------
// Assembled tree with effective availability (ADR-5 cascade).
// ---------------------------------------------------------------------------

export interface CatalogOption extends CatalogOptionRow {
  /** enabled AND group.effective_enabled AND not removed_from_api AND not blocked. */
  effective_enabled: boolean
  /** Why the toggle cannot be ON (ADR-4 ◼), or null. Present even when enabled=false. */
  blocked_reason: string | null
}

export interface CatalogOptionGroup extends CatalogOptionGroupRow {
  options: CatalogOption[]
  /** enabled AND subcategory.effective_enabled AND not removed_from_api. */
  effective_enabled: boolean
  /** The option carrying is_default, if any. */
  default_option_id: number | null
}

export interface CatalogSubcategory extends CatalogSubcategoryRow {
  groups: CatalogOptionGroup[]
  medium_enabled: boolean
  /**
   * medium_enabled AND enabled AND not removed_from_api AND every required group has ≥1
   * effective_enabled option (a framed canvas with zero frames is not sellable — F20).
   */
  effective_enabled: boolean
  /** Human reason when effective_enabled is false despite enabled=true (admin banner). */
  blocked_reason: string | null
}

export interface Catalog {
  host: string
  loaded_at: string
  subcategories: CatalogSubcategory[]
}

// ---------------------------------------------------------------------------
// Selection (ADR-2): what a customer chose. Identity helpers live in hash.ts.
// ---------------------------------------------------------------------------

export interface Selection {
  variantId: string
  subcategoryRef: string
  optionIds: number[]
  solidHex?: string
}

export const solidHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

/** A labeled, frozen choice written into purchase_spec.details.print_options (§4.2). */
export interface FrozenPrintOption {
  group_key: string
  group_label: string
  option_id: number
  option_label: string
  price_delta_cents: number
}
