// Authored by DotWin
// Seed rules: what a NEWLY discovered catalog row starts life as.
//
// Every rule keys on the provider's NAME, never on its id. Ids are host-specific
// (the sandbox and production catalogs are not guaranteed to number the same row
// alike, plan §9 F12), so an id-keyed rule would seed the wrong geometry on the
// host that matters. Names are stable across both hosts in the Phase 0 snapshots.
//
// These are SEEDS, not state: sync applies them when it inserts a row and never
// re-applies them to a row that already exists (ADR-7). Once the admin has moved
// a label, a swatch or a sort order, it is theirs.
//
// Pure functions only: no I/O, no provider calls, no database.

import type { Medium } from '@/lib/pricing/mediums'
import { canonicalGroupKey, DEPENDENT_GROUPS } from './keys'
import type { DisplayKind, Geometry, PricingMode, Swatch } from './types'

/** The minimum an option must carry for these rules to run. */
export interface NamedOption {
  option_id: number
  api_option_name: string
}

// ---------------------------------------------------------------------------
// Medium (the customer-facing family)
// ---------------------------------------------------------------------------

/**
 * Map a provider category + subcategory name onto one of the eight families.
 *
 * An unknown category throws rather than defaulting: the provider adding a
 * category is a plan change (new marketing copy, new PDP grouping, possibly new
 * geometry), and swallowing it would file the rows under a family whose copy
 * lies about the product.
 */
export function mediumForSubcategory(categoryId: number, name: string): Medium {
  switch (categoryId) {
    case 101:
      // Rolled canvas ships unstretched: a different physical product and a
      // different family, even though the provider files it under Canvas.
      return /rolled canvas/i.test(name) ? 'rolled_canvas' : 'canvas'
    case 102:
      return 'framed_canvas'
    case 103:
      return 'fine_art_paper'
    case 105:
      return 'framed_fine_art_paper'
    case 106:
      return 'metal'
    case 107:
      return 'peel_and_stick'
    case 108:
      return 'foam_mounted_fine_art_paper'
    default:
      throw new Error(`Unknown provider category ${categoryId} (${name}): the catalog has grown a family this plan does not cover`)
  }
}

/**
 * The provider category a family came from. This is the inverse of the mapping
 * above and exists for one reason: the rules that need a category (whole-config
 * pricing on framed paper, the physical caveats, which hanging hardware is the
 * neutral default) run again later in the walk, when only the stored row is in
 * hand and the walked category is long gone. Rolled canvas and stretched canvas
 * share a provider category, which is why the forward map needs the name and
 * this one does not.
 */
export function categoryIdForMedium(medium: Medium): number {
  switch (medium) {
    case 'canvas':
    case 'rolled_canvas':
      return 101
    case 'framed_canvas':
      return 102
    case 'fine_art_paper':
      return 103
    case 'framed_fine_art_paper':
      return 105
    case 'metal':
      return 106
    case 'peel_and_stick':
      return 107
    case 'foam_mounted_fine_art_paper':
      return 108
  }
}

// ---------------------------------------------------------------------------
// Subcategory seeds
// ---------------------------------------------------------------------------

/**
 * Physical-product caveats the customer has to read BEFORE buying, not after a
 * return. Plain sentences, no dashes, rendered verbatim on the PDP.
 */
const METAL_NOTE = 'Up to about 1/4 inch of the edge is trimmed during sublimation.'
const FOAM_NOTE = 'Prints larger than 16 x 24 inches are best framed to stay flat.'

export interface SubcategorySeed {
  display_label: string
  description: string | null
  customer_note: string | null
  pricing_mode: PricingMode
  max_glass_w_in: number | null
  max_glass_h_in: number | null
}

export function subcategorySeed(categoryId: number, name: string): SubcategorySeed {
  return {
    display_label: name,
    description: null,
    customer_note: categoryId === 106 ? METAL_NOTE : categoryId === 108 ? FOAM_NOTE : null,
    // Framed fine art paper prices the WHOLE configuration: the mat delta moves
    // with the paper and the backing chosen, so summing cached per-option deltas
    // misprices it (recorded in P14, max observed drift $2.80).
    pricing_mode: categoryId === 105 ? 'whole_config' : 'additive',
    // The published bounds ARE the glass ceiling (P4); a separate ceiling is only
    // seeded when a probe ever proves one, never guessed here.
    max_glass_w_in: null,
    max_glass_h_in: null,
  }
}

// ---------------------------------------------------------------------------
// Group seeds
// ---------------------------------------------------------------------------

/** Groups whose members are a colour/material choice: show the material, not a word. */
const SWATCH_GROUPS = new Set(['frame_style', 'mat_color'])
/** Groups that are a short, mutually exclusive choice: a radio row, not a select. */
const RADIO_GROUPS = new Set([
  'canvas_border',
  'glazing',
  'bleed_size',
  'canvas_underlayer',
  'canvas_finish',
  'backing',
  'print_mounting',
])

export function displayKindForGroup(groupKey: string): DisplayKind {
  if (SWATCH_GROUPS.has(groupKey)) return 'swatch'
  if (RADIO_GROUPS.has(groupKey)) return 'radio'
  return 'list'
}

export interface GroupSeed {
  group_key: string
  display_label: string
  display_kind: DisplayKind
  depends_on_group: string | null
  customer_visible: boolean
  /** Seeded false; the defaults stage flips it from the provider's own refusal. */
  required: boolean
}

export function groupSeed(apiGroupName: string): GroupSeed {
  const group_key = canonicalGroupKey(apiGroupName)
  return {
    group_key,
    display_label: apiGroupName,
    display_kind: displayKindForGroup(group_key),
    depends_on_group: DEPENDENT_GROUPS[group_key]?.on ?? null,
    customer_visible: true,
    required: false,
  }
}

/**
 * Resolve the sibling option ids that HIDE a dependent group (Mat Color is
 * meaningless without a mat). The ids only exist once the sibling group's
 * options have been read, so this runs after a subcategory's whole option tree
 * is in hand, and is refreshed every sync: it is derived from provider data, not
 * an admin choice, and it would rot silently if the provider renumbered.
 */
export function resolveDependsHiddenWhen(
  groupKey: string,
  siblingOptionsByKey: Map<string, NamedOption[]>,
): number[] | null {
  const dep = DEPENDENT_GROUPS[groupKey]
  if (!dep) return null
  const siblings = siblingOptionsByKey.get(dep.on)
  if (!siblings) return null
  const ids = siblings
    .filter((o) => dep.hiddenWhenOptionMatches.test(o.api_option_name))
    .map((o) => o.option_id)
    .sort((a, b) => a - b)
  return ids.length ? ids : null
}

// ---------------------------------------------------------------------------
// Option seeds: geometry
// ---------------------------------------------------------------------------

/**
 * The metal easel's offerable sizes, from the provider's own storefront. The
 * pricing API quotes an easel at ANY size (P9), so this list is the only gate.
 */
const METAL_EASEL_SIZES: Array<[number, number]> = [
  [8, 10],
  [8, 12],
  [11, 14],
  [11, 17],
  [12, 12],
  [12, 16],
  [16, 24],
]

const ROLLED_BORDER_PROBE_OWED =
  'Rolled-canvas border sizes have not been image-checked yet; run the V3 geometry probe before enabling.'

/**
 * Rolled-canvas border sizes, however the group key came out. `canonicalGroupKey`
 * currently files this group under `canvas_border` (see the note in the module
 * doc of the sync), so the rules that must not miss it are written to accept both
 * the canonical key and the slug fallback.
 */
function isRolledBorderGroup(groupKey: string): boolean {
  return /rolled/.test(groupKey) && /border/.test(groupKey)
}

/** Options that plausibly change the weight or the box, so shipping must re-quote. */
function isShippingClass(groupKey: string, optionName: string): boolean {
  if (groupKey === 'frame_style') return true
  if (groupKey === 'glazing' && /acrylic glass/i.test(optionName)) return true
  if (/backboard/i.test(optionName)) return true
  if (/mounting posts/i.test(optionName)) return true
  if (/^inset frame/i.test(optionName)) return true
  return false
}

/**
 * The physical effect of an option, by name. Absent keys mean no effect; the
 * keys present here are exactly what the rules engine enforces at PDP, quote,
 * checkout and pre-submit, because the provider enforces none of them before
 * payment (P4 / P8 / P9).
 */
export function geometryForOption(groupKey: string, optionName: string): Geometry | null {
  const g: Geometry = {}

  // Image Wrap consumes 3.75in of image per axis that an aspect-exact master
  // does not have. Same shape of problem for every non-zero paper bleed: the
  // provider expects a SHRUNKEN image, which goes negative at a 1in bleed.
  if (/^image wrap$/i.test(optionName)) g.requires_file_bleed_in = 3.75
  const bleed = optionName.match(/^(\d+(?:\.\d+)?)in bleed/i)
  if (bleed) g.requires_file_bleed_in = Number(bleed[1])

  // A mat grows the frame around an unchanged PRINT size (P3).
  const perSide = optionName.match(/^(\d+(?:\.\d+)?) inch(?:es)? on each side/i)
  if (perSide) g.per_side_in = Number(perSide[1])

  if (/^metal easel$/i.test(optionName)) g.size_whitelist = METAL_EASEL_SIZES.map(([w, h]) => [w, h] as [number, number])

  if (/^solid colou?r$/i.test(optionName)) g.needs_hex = true

  // Keyed on the option NAME, not on the group key. "white space" appears on the
  // four rolled-canvas border sizes and nowhere else in the catalog, and a rule
  // that survives a group being filed under an unexpected key is the difference
  // between an un-probed option shipping blocked and shipping enabled.
  if (isRolledBorderGroup(groupKey) || /white space/i.test(optionName)) g.probe_owed = ROLLED_BORDER_PROBE_OWED

  if (isShippingClass(groupKey, optionName)) g.shipping_class = true

  return Object.keys(g).length ? g : null
}

// ---------------------------------------------------------------------------
// Option seeds: swatch
// ---------------------------------------------------------------------------

/**
 * Frame finishes, most specific token first. "Driftwood White" has to beat plain
 * "White" or a driftwood frame previews as a white one, which is the F18 failure
 * mode (a preview that sells the wrong product).
 */
const FRAME_COLORS: Array<[RegExp, string]> = [
  [/driftwood\s+gray/i, '#9a9a92'],
  [/driftwood\s+white/i, '#e8e4dc'],
  [/\bblack\b/i, '#1a1a1a'],
  [/\bwhite\b/i, '#f4f1ea'],
  [/\boak\b/i, '#c8a165'],
  [/\bwalnut\b/i, '#5b3a29'],
  [/\bnatural\b/i, '#d9b98a'],
  [/\bmaple\b/i, '#e3c28d'],
  [/\bespresso\b/i, '#3b2a20'],
  [/\bgold\b/i, '#c9a227'],
  [/\bsilver\b/i, '#b8b8b8'],
  [/\bcopper\b/i, '#b87333'],
]

/**
 * Mat board colours. Inside a mat group these win over the frame table, so mat
 * "White" is a true white board rather than the warm white of a painted frame.
 */
const MAT_COLORS: Array<[RegExp, string]> = [
  [/off\s+white/i, '#f5f2ea'],
  [/antique\s+white/i, '#f1e9d6'],
  [/\bcream\b/i, '#f3e9c9'],
  [/\bpearl\b/i, '#eae6df'],
  [/\bsand\b/i, '#d8c9a8'],
  [/\bsauterne\b/i, '#d9c27a'],
  [/dawn\s+grey/i, '#b8b8b4'],
  [/french\s+blue/i, '#5b7fa6'],
  [/silver\s+florentine/i, '#c0c0c0'],
  [/\bindigo\b/i, '#2f3f6a'],
  [/moss\s+point\s+green/i, '#6f7d5a'],
  [/smooth\s+black/i, '#111111'],
  [/white\s+with\s+black\s+core/i, '#f8f8f8'],
  [/\bwhite\b/i, '#ffffff'],
]

function firstColor(table: Array<[RegExp, string]>, name: string): string | undefined {
  for (const [re, hex] of table) if (re.test(name)) return hex
  return undefined
}

/**
 * Visible face width of a frame, in inches, so the preview scales one frame
 * against another truthfully. Frame options name their own depth ("1.25in Black
 * Floating Frame") or their profile ("0.875x1.125 Black Frame"); on framed paper
 * the profile is the SUBCATEGORY ("1.25w x 0.875h Black Frame"), so that is the
 * last fallback.
 */
export function frameFaceIn(optionName: string, subcategoryName: string): number | undefined {
  const depth = optionName.match(/^(\d+(?:\.\d+)?)in/i)
  if (depth) return Number(depth[1])
  const profile = optionName.match(/^(\d+(?:\.\d+)?)x/i)
  if (profile) return Number(profile[1])
  const fromSubcategory = subcategoryName.match(/(\d+(?:\.\d+)?)w x/i)
  if (fromSubcategory) return Number(fromSubcategory[1])
  return undefined
}

export function swatchForOption(groupKey: string, optionName: string, subcategoryName: string): Swatch | null {
  const s: Swatch = {}
  if (groupKey === 'mat_color') {
    const hex = firstColor(MAT_COLORS, optionName)
    if (hex) s.color_hex = hex
  } else if (groupKey === 'frame_style') {
    const hex = firstColor(FRAME_COLORS, optionName)
    if (hex) s.color_hex = hex
    const face = frameFaceIn(optionName, subcategoryName)
    if (face !== undefined) s.frame_face_in = face
  }
  return Object.keys(s).length ? s : null
}

export interface OptionSeed {
  display_label: string
  swatch: Swatch | null
  geometry: Geometry | null
}

export function optionSeed(groupKey: string, optionName: string, subcategoryName: string): OptionSeed {
  return {
    display_label: optionName,
    swatch: swatchForOption(groupKey, optionName, subcategoryName),
    geometry: geometryForOption(groupKey, optionName),
  }
}

// ---------------------------------------------------------------------------
// OUR default per group
// ---------------------------------------------------------------------------

/**
 * The geometry-neutral member of each group: the option that orders the product
 * the customer's aspect-exact master actually fits. It is deliberately NOT the
 * provider's own default, which resolves an empty options array to Image Wrap on
 * canvas and a 0.25in bleed on paper (P15) and 406s at image check.
 *
 * Returns a matcher rather than an id, because ids differ between hosts.
 */
function seededDefaultMatcher(groupKey: string, categoryId: number, subcategoryName: string): RegExp | null {
  if (isRolledBorderGroup(groupKey)) return /^2 inch border plus 1 inch white space$/i
  switch (groupKey) {
    case 'canvas_border':
      return /^mirror wrap$/i
    case 'bleed_size':
      return /^no bleed/i
    case 'mat_size':
      return /^no mat$/i
    case 'paper_type':
      return /^archival matte fine art paper$/i
    case 'canvas_underlayer':
      return /^no canvas underlayer$/i
    case 'mat_color':
      return /^white$/i
    case 'glazing':
      return /^acrylic glass/i
    case 'backing':
      return /^no backing$/i
    case 'print_mounting':
      return /^dry mounted to foam core$/i
    case 'metal_hardware':
      return /^inset frame$/i
    case 'hanging_hardware':
      // Each family hangs differently, and the provider names the same hardware
      // differently per family, so the default is chosen per category.
      if (categoryId === 101) return /^sawtooth hanger installed$/i
      if (categoryId === 102) return /^hanging wire installed$/i
      if (categoryId === 105) return /^hanging wire installed on frame$/i
      return null
    case 'frame_style': {
      // The black floating frame OF THIS DEPTH: a 1.25in canvas in a 0.75in
      // frame is a different product, and the depth lives in the names.
      const depth = subcategoryName.match(/^(\d+(?:\.\d+)?in)/i)
      if (depth) return new RegExp(`^${depth[1].replace('.', '\\.')}\\s+black floating frame$`, 'i')
      return /black floating frame$/i
    }
    default:
      return null
  }
}

/**
 * Which option should carry `is_default` for a group.
 *
 * Order: our own geometry-neutral rule, then what the provider resolves for an
 * empty set, then the first option in the group. The last fallback exists
 * because "exactly one default per group" is a database constraint and a group
 * the rules do not know (a family the provider adds next week) still has to
 * resolve to something rather than blocking the sync.
 */
export function pickSeededDefault(
  groupKey: string,
  categoryId: number,
  subcategoryName: string,
  options: NamedOption[],
  providerDefaultIds: readonly number[] = [],
): number | null {
  if (options.length === 0) return null
  const matcher = seededDefaultMatcher(groupKey, categoryId, subcategoryName)
  if (matcher) {
    const hit = options.find((o) => matcher.test(o.api_option_name))
    if (hit) return hit.option_id
  }
  const fromProvider = options.find((o) => providerDefaultIds.includes(o.option_id))
  if (fromProvider) return fromProvider.option_id
  return options[0].option_id
}
