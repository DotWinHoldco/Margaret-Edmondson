// Authored by DotWin
// The shopper's view of the catalog: which finish can be offered, which size still
// fits it, which control must be greyed out at the size already chosen, and which
// group is not the customer's business yet.
//
// Every answer here comes from the SAME pure modules the server enforces with
// (`availability.ts`, `rules.ts`), so a control this file offers is never one the
// quote route would refuse. Those modules speak `CatalogSubcategory`, which carries
// operator fields the browser deliberately never receives, so the adapter below fills
// the fields they read from the storefront subset and neutral constants for the rest.
//
// Pure module: no React, no I/O.

import type { CatalogOption, CatalogOptionGroup, CatalogSubcategory } from '@/lib/catalog/types'
import type { StorefrontGroup, StorefrontOption, StorefrontSubcategory } from '@/lib/catalog/storefront'
import { offerableOptions, sizeFits, type GroupAvailability } from '@/lib/catalog/availability'

export interface PrintSize {
  widthIn: number
  heightIn: number
}

const STAMP = '1970-01-01T00:00:00.000Z'

function ruleOption(option: StorefrontOption, groupRef: string): CatalogOption {
  return {
    id: option.id,
    group_ref: groupRef,
    option_id: option.option_id,
    api_option_name: option.display_label,
    display_label: option.display_label,
    enabled: option.effective_enabled,
    is_default: option.is_default,
    provider_default: false,
    sort_order: option.sort_order,
    swatch: option.swatch,
    geometry: option.geometry,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    effective_enabled: option.effective_enabled,
    // The browser holds the FACT that an option is blocked and never the operator's
    // sentence, so the adapter supplies a placeholder the rules engine only tests for
    // presence. The reason a shopper reads is the customer copy in CUSTOMER_VIOLATION_MESSAGES.
    blocked_reason: option.blocked ? 'blocked' : null,
  }
}

function ruleGroup(group: StorefrontGroup, subcategoryRef: string): CatalogOptionGroup {
  return {
    id: group.id,
    subcategory_ref: subcategoryRef,
    group_key: group.group_key,
    api_group_name: group.display_label,
    display_label: group.display_label,
    required: group.required,
    customer_visible: group.customer_visible,
    enabled: group.effective_enabled,
    display_kind: group.display_kind,
    depends_on_group: group.depends_on_group,
    depends_hidden_when: group.depends_hidden_when,
    sort_order: group.sort_order,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    options: group.options.map((option) => ruleOption(option, group.id)),
    effective_enabled: group.effective_enabled,
    default_option_id: group.default_option_id,
  }
}

/** The shape `availability.ts` and `rules.ts` read, built from the storefront subset. */
export function toRuleSubcategory(subcategory: StorefrontSubcategory): CatalogSubcategory {
  return {
    id: subcategory.id,
    medium: subcategory.medium,
    subcategory_id: subcategory.subcategory_id,
    api_host: '',
    name: subcategory.display_label,
    display_label: subcategory.display_label,
    description: subcategory.description,
    min_width_in: subcategory.min_width_in,
    max_width_in: subcategory.max_width_in,
    min_height_in: subcategory.min_height_in,
    max_height_in: subcategory.max_height_in,
    required_dpi: subcategory.required_dpi,
    max_glass_w_in: subcategory.max_glass_w_in,
    max_glass_h_in: subcategory.max_glass_h_in,
    enabled: subcategory.effective_enabled,
    sort_order: subcategory.sort_order,
    customer_note: subcategory.customer_note,
    pricing_mode: 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
    groups: subcategory.groups.map((group) => ruleGroup(group, subcategory.id)),
    medium_enabled: subcategory.effective_enabled,
    effective_enabled: subcategory.effective_enabled,
    blocked_reason: null,
  }
}

/** Whether this size is inside the finish's published bounds. */
export function sizeFitsSubcategory(subcategory: StorefrontSubcategory, size: PrintSize): boolean {
  return sizeFits(toRuleSubcategory(subcategory), size)
}

/** Per group, which options can be picked at this size and the customer copy for why not. */
export function availabilityAtSize(
  subcategory: StorefrontSubcategory,
  size: PrintSize,
): GroupAvailability[] {
  return offerableOptions(toRuleSubcategory(subcategory), size)
}

/**
 * Dependency gating, copied from `isGroupVisible` in `src/lib/catalog/load.ts` so the
 * browser applies the same rule without importing that server module (it reads the
 * database and the Next cache). Keep the two in step: Mat Color is offered only once a
 * real mat is chosen, and the server rejects the pair otherwise because the provider
 * accepts it silently at zero dollars.
 */
export function isGroupVisibleFor(
  subcategory: StorefrontSubcategory,
  group: StorefrontGroup,
  selectedOptionIds: readonly number[],
): boolean {
  const parentKey = group.depends_on_group
  if (!parentKey) return true
  const parent = subcategory.groups.find((candidate) => candidate.group_key === parentKey)
  if (!parent) return true

  const hidden = group.depends_hidden_when ?? []
  if (hidden.length === 0) return true

  const parentIds = new Set(parent.options.map((option) => option.option_id))
  const selected = selectedOptionIds.find((id) => parentIds.has(id)) ?? parent.default_option_id
  if (selected === null || selected === undefined) return true
  return !hidden.includes(selected)
}

/**
 * The groups a shopper sees: admin-visible, dependency-visible, and carrying at least
 * one option. An admin-hidden group is never rendered, and its default still travels
 * in the selection below.
 */
export function visibleGroups(
  subcategory: StorefrontSubcategory,
  selectedOptionIds: readonly number[],
): StorefrontGroup[] {
  return subcategory.groups
    .filter((group) => group.customer_visible && group.options.length > 0)
    .filter((group) => isGroupVisibleFor(subcategory, group, selectedOptionIds))
    .sort((a, b) => a.sort_order - b.sort_order || a.group_key.localeCompare(b.group_key))
}

/** The option a group starts on: its marked default, else its first live option. */
export function startingOptionFor(group: StorefrontGroup): number | null {
  const marked = group.options.find(
    (option) => option.option_id === group.default_option_id && !option.blocked,
  )
  if (marked) return marked.option_id
  const firstLive = group.options.find((option) => option.effective_enabled && !option.blocked)
  return firstLive ? firstLive.option_id : null
}

/**
 * The selection to send for a set of wishes: one id per group, repaired to what is
 * offerable at this size, with the dependency-hidden groups REMOVED.
 *
 * Removing them is the part that matters. `evaluateSelection` treats an id sent for a
 * a group the customer cannot see as a contradiction (`group_dependency`: a mat colour
 * with no mat), and fills that group's default itself when the id is absent. So the
 * browser sends every group it can see and nothing it cannot, and the server writes the
 * rest, which is also why the request is never an empty array for a finish with groups
 * (P15: an omission resolves to the provider's geometry-hostile option).
 *
 * Idempotent: normalizing an already normalized selection returns it unchanged.
 */
export function normalizeSelection(
  subcategory: StorefrontSubcategory,
  desired: readonly number[],
  availability?: readonly GroupAvailability[],
): number[] {
  const offerable = (groupKey: string, optionId: number): boolean => {
    if (!availability) return true
    const group = availability.find((entry) => entry.groupKey === groupKey)
    const option = group?.options.find((entry) => entry.optionId === optionId)
    return option ? option.offerable : true
  }

  const picked = new Map<string, number>()
  for (const group of subcategory.groups) {
    const ids = new Set(group.options.map((option) => option.option_id))
    const wanted = desired.find((id) => ids.has(id))
    if (wanted !== undefined && offerable(group.group_key, wanted)) {
      picked.set(group.group_key, wanted)
      continue
    }
    const marked = group.options.find(
      (option) =>
        option.option_id === group.default_option_id &&
        !option.blocked &&
        offerable(group.group_key, option.option_id),
    )
    const fallback =
      marked ??
      group.options.find(
        (option) => option.effective_enabled && !option.blocked && offerable(group.group_key, option.option_id),
      )
    if (fallback) picked.set(group.group_key, fallback.option_id)
  }

  const resolved = [...picked.values()]
  const kept: number[] = []
  for (const group of subcategory.groups) {
    const id = picked.get(group.group_key)
    if (id === undefined) continue
    if (!isGroupVisibleFor(subcategory, group, resolved)) continue
    kept.push(id)
  }
  return [...new Set(kept)].sort((a, b) => a - b)
}

/** The selection a finish starts on: every group on its default. */
export function startingSelection(
  subcategory: StorefrontSubcategory,
  availability?: readonly GroupAvailability[],
): number[] {
  return normalizeSelection(subcategory, [], availability)
}

/** The selection after a choice in one group; the new id wins its group. */
export function selectionAfterChoice(
  subcategory: StorefrontSubcategory,
  current: readonly number[],
  group: StorefrontGroup,
  optionId: number,
  availability?: readonly GroupAvailability[],
): number[] {
  const groupIds = new Set(group.options.map((option) => option.option_id))
  return normalizeSelection(
    subcategory,
    [optionId, ...current.filter((id) => !groupIds.has(id))],
    availability,
  )
}

/** The chosen option of a group, if the current selection names one. */
export function chosenOption(
  group: StorefrontGroup,
  selectedOptionIds: readonly number[],
): StorefrontOption | null {
  return group.options.find((option) => selectedOptionIds.includes(option.option_id)) ?? null
}

/** The option in this finish carrying an id, wherever it lives. */
export function optionInSubcategory(
  subcategory: StorefrontSubcategory,
  optionId: number,
): StorefrontOption | null {
  for (const group of subcategory.groups) {
    const found = group.options.find((option) => option.option_id === optionId)
    if (found) return found
  }
  return null
}

/** Whether any currently selected option demands a hex colour (Solid Color Wrap). */
export function needsHex(subcategory: StorefrontSubcategory, selectedOptionIds: readonly number[]): boolean {
  return selectedOptionIds.some((id) => optionInSubcategory(subcategory, id)?.geometry?.needs_hex === true)
}

export const HEX_PATTERN = '#[0-9a-fA-F]{6}'

export function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

/**
 * The variant fields the configurator reads. A product page's own variant type is
 * wider than this; anything structurally carrying these fields can be offered as a
 * size, which keeps the page's row shape out of this folder.
 */
export interface PrintVariant {
  id: string
  name: string
  price: number
  medium: string | null
  width_in: number | null
  height_in: number | null
  size_tier?: 'S' | 'M' | 'L' | null
  size_label?: string | null
  variant_type?: string | null
  fulfillment_type?: string
  shipping_mode?: 'included' | 'flat' | 'integration'
  shipping_fee_cents?: number
  lead_days?: number | null
  /** Print types (provider subcategory ids) this size is NOT sold in; the owner's per-size veto. */
  excluded_subcategory_ids?: number[] | null
  /** The print type the stored `price` was computed for (the size's own depth). */
  fulfillment_metadata?: { lumaprints_subcategory_id?: number | string | null } | null
}

/** The print type the variant's stored price belongs to, or null for a row that never said. */
export function variantStoredSubcategoryId(variant: Pick<PrintVariant, 'fulfillment_metadata'>): number | null {
  const raw = variant.fulfillment_metadata?.lumaprints_subcategory_id
  const id = Number(raw)
  return raw === null || raw === undefined || !Number.isFinite(id) || id <= 0 ? null : id
}

/**
 * Whether the owner sells this size in this print type. A size is offered in every
 * switched-on print type of its family that can take it, MINUS the ones unticked on the
 * product page; the storefront, the quote route, checkout and the warmer all ask here.
 */
export function variantSoldIn(
  variant: Pick<PrintVariant, 'excluded_subcategory_ids'>,
  subcategoryId: number,
): boolean {
  const excluded = variant.excluded_subcategory_ids
  return !Array.isArray(excluded) || !excluded.some((id) => Number(id) === subcategoryId)
}

/** The print size a variant sells, or null when the row has no usable dimensions. */
export function variantSize(variant: PrintVariant): PrintSize | null {
  const widthIn = Number(variant.width_in)
  const heightIn = Number(variant.height_in)
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) return null
  return { widthIn, heightIn }
}

/** The sizes of one medium that this finish can actually take, smallest first. */
export function sizesFor(
  subcategory: StorefrontSubcategory,
  variants: readonly PrintVariant[],
): PrintVariant[] {
  const rule = toRuleSubcategory(subcategory)
  return variants
    .filter((variant) => variant.medium === subcategory.medium)
    .filter((variant) => variantSoldIn(variant, subcategory.subcategory_id))
    .filter((variant) => {
      const size = variantSize(variant)
      return size !== null && sizeFits(rule, size)
    })
    .sort(
      (a, b) =>
        (Number(a.width_in) || 0) * (Number(a.height_in) || 0) -
        (Number(b.width_in) || 0) * (Number(b.height_in) || 0),
    )
}

/** The finishes of a medium that can be sold AND have at least one size that fits. */
export function offerableFinishes(
  catalog: readonly StorefrontSubcategory[],
  medium: string,
  variants: readonly PrintVariant[],
): StorefrontSubcategory[] {
  return catalog
    .filter((subcategory) => subcategory.medium === medium && subcategory.effective_enabled)
    .filter((subcategory) => sizesFor(subcategory, variants).length > 0)
    .sort((a, b) => a.sort_order - b.sort_order || a.subcategory_id - b.subcategory_id)
}
