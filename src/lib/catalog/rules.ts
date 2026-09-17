// Authored by DotWin
// ADR-4: the geometry and constraint engine. Dimension math only, never a re-render.
//
// The provider enforces almost none of this BEFORE payment (P4, P8, P9): pricing
// happily quotes a size past the published bounds, a mat past the glass ceiling, an
// easel at a size the provider does not sell, and a mat colour with no mat. So this
// module is the only gate between a customer and a 406 that arrives after the card
// is charged, and it runs identically at the PDP, at quote time, at checkout and
// before submit.
//
// Every rule reads catalog DATA (bounds, `geometry`, group flags), never an id
// literal: ids differ between the sandbox and production hosts (§9 F12), and a rule
// keyed on one would silently pass the wrong product on the other.
//
// Pure module: no I/O, no framework imports, and every relative import is type-only,
// so plain node (type stripping) can import this file from a verification script.

import type {
  CatalogOption,
  CatalogOptionGroup,
  CatalogSubcategory,
} from './types'
import type { ConstraintViolation } from '../pricing/quote-types'

/** Tolerance for inch comparisons, so a size that rounds onto a bound still fits. */
const EPS = 1e-6

/** LumaPrints allows 1% between the image aspect and the ordered aspect. */
const ASPECT_TOLERANCE_PCT = 1

export interface RuleSize {
  widthIn: number
  heightIn: number
}

/** The print master a size is checked against (resolution and shape). */
export interface RuleMaster {
  printWidthPx: number
  printHeightPx: number
}

export interface EvaluationResult {
  violations: ConstraintViolation[]
  /** The customer's choices plus every untouched group's default, sorted and unique. */
  normalizedOptionIds: number[]
  /** Glass/outer size after `per_side_in` options; equals the print size otherwise. */
  outerWidthIn: number
  outerHeightIn: number
  /** Selected options that plausibly change weight or box, sorted. Drives the shipping memo. */
  shippingClassIds: number[]
}

// ---------------------------------------------------------------------------
// Small local helpers (kept local on purpose: this module imports no values)
// ---------------------------------------------------------------------------

/** 12 -> "12", 3.875 -> "3.875". Mirrors the size-tier label formatter. */
function trimNum(n: number): string {
  return Number(n.toFixed(4)).toString()
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min - EPS && value <= max + EPS
}

/**
 * Orientation-aware fit. The provider normalises orientation on its side (P4/F32),
 * and a 36 by 24 frame sells the same glass as a 24 by 36 one, so a size fits when
 * either the ordered pair or its rotation sits inside the bounds.
 */
function fitsEitherWay(
  widthIn: number,
  heightIn: number,
  minW: number,
  maxW: number,
  minH: number,
  maxH: number,
): boolean {
  const straight = inRange(widthIn, minW, maxW) && inRange(heightIn, minH, maxH)
  const rotated = inRange(heightIn, minW, maxW) && inRange(widthIn, minH, maxH)
  return straight || rotated
}

function optionsOf(subcategory: CatalogSubcategory): Array<{ group: CatalogOptionGroup; option: CatalogOption }> {
  const out: Array<{ group: CatalogOptionGroup; option: CatalogOption }> = []
  for (const group of subcategory.groups) for (const option of group.options) out.push({ group, option })
  return out
}

/**
 * True when leaving this group out of a provider call would let the provider resolve
 * it to something geometry-hostile: Image Wrap on canvas (+3.75in of image per axis),
 * a 0.25in bleed on paper (a shrunken image). Both reject an aspect-exact master at
 * image check, which is the 406 that took launch night down.
 *
 * Mirrors the loader's own rule; the loader cannot be imported here because this
 * module stays free of runtime imports.
 */
function hasHostileProviderDefault(group: CatalogOptionGroup): boolean {
  return group.options.some(
    (option) =>
      option.provider_default === true && typeof option.geometry?.requires_file_bleed_in === 'number',
  )
}

/**
 * The id a group contributes when the customer chose nothing in it. Identical to
 * `defaultSelection` in the loader, per group: our marked default when the group is
 * live and that option is on, and ALSO when the group is off but the provider would
 * resolve the omission to a hostile option. A tombstoned or blocked default
 * contributes nothing rather than guessing at a substitute.
 */
function defaultIdForGroup(group: CatalogOptionGroup): number | null {
  if (group.removed_from_api === true) return null
  const marked = group.options.find((option) => option.is_default === true)
  if (!marked || marked.removed_from_api === true || marked.blocked_reason !== null) return null
  if ((group.effective_enabled && marked.enabled === true) || hasHostileProviderDefault(group)) {
    return marked.option_id
  }
  return null
}

/**
 * Dependency gating (`depends_on_group` / `depends_hidden_when`): Mat Color is offered
 * only once a real mat is chosen. Identical to the loader's `isGroupVisible`; when the
 * customer has not touched the parent group its default stands in, so a dependent
 * group is hidden from the first paint rather than after the first click.
 */
function isGroupVisible(
  subcategory: CatalogSubcategory,
  group: CatalogOptionGroup,
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

/** The parent group and the option that hides a dependent group, for the copy. */
function hidingContext(
  subcategory: CatalogSubcategory,
  group: CatalogOptionGroup,
): { parent: CatalogOptionGroup | null } {
  const parent = subcategory.groups.find((candidate) => candidate.group_key === group.depends_on_group) ?? null
  return { parent }
}

/** The glass ceiling for a subcategory: the explicit columns when set, else the bounds (P4). */
function glassCeiling(subcategory: CatalogSubcategory): { w: number; h: number } {
  return {
    w: subcategory.max_glass_w_in ?? subcategory.max_width_in,
    h: subcategory.max_glass_h_in ?? subcategory.max_height_in,
  }
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * Evaluate one selection against one subcategory at one size.
 *
 * Returns every violation it finds rather than the first, because the configurator
 * shows them all at once, and returns the NORMALIZED option ids (the customer's
 * choices plus every untouched group's default) even when there are violations, so a
 * caller can show what would be ordered next to why it cannot be.
 *
 * Defaults deliberately fill dependency-hidden groups too. Today's live framed-paper
 * default set is `[64, 74, 83, 94, 96, 146, 148]`: a mat COLOUR travels with a No Mat
 * choice because it is our configuration rather than a customer's, and the provider
 * prices it at zero. A customer who explicitly picks a mat colour without a mat is a
 * different thing, and that is the `group_dependency` violation below.
 */
export function evaluateSelection(
  subcategory: CatalogSubcategory,
  size: RuleSize,
  optionIds: readonly number[],
  solidHex?: string,
  master?: RuleMaster,
): EvaluationResult {
  const violations: ConstraintViolation[] = []
  const widthIn = Number(size.widthIn)
  const heightIn = Number(size.heightIn)

  // --- 1. Resolve every requested id against THIS subcategory's own options ------
  const index = optionsOf(subcategory)
  const requested: number[] = []
  for (const raw of optionIds) {
    const id = Number(raw)
    if (!Number.isInteger(id) || id <= 0 || requested.includes(id)) continue
    requested.push(id)
  }

  const chosenByGroup = new Map<string, { group: CatalogOptionGroup; option: CatalogOption }>()
  const chosen: Array<{ group: CatalogOptionGroup; option: CatalogOption }> = []

  for (const id of requested) {
    const hit = index.find((entry) => entry.option.option_id === id)
    if (!hit) {
      violations.push({
        code: 'option_unknown',
        message: 'That choice is not offered for this product.',
        optionId: id,
      })
      continue
    }
    const already = chosenByGroup.get(hit.group.id)
    if (already) {
      violations.push({
        code: 'group_duplicate',
        message: `Choose only one ${hit.group.display_label}.`,
        groupKey: hit.group.group_key,
        optionId: id,
      })
      continue
    }
    chosenByGroup.set(hit.group.id, hit)
    chosen.push(hit)

    if (hit.option.blocked_reason !== null) {
      violations.push({
        code: 'option_blocked',
        message: hit.option.blocked_reason,
        groupKey: hit.group.group_key,
        optionId: id,
      })
    } else if (hit.option.effective_enabled !== true) {
      violations.push({
        code: 'option_unavailable',
        message: `${hit.option.display_label} is not available right now. Please choose another ${hit.group.display_label}.`,
        groupKey: hit.group.group_key,
        optionId: id,
      })
    }
  }

  // --- 2. Dependency: a choice in a group the customer cannot see ----------------
  const chosenIds = chosen.map((entry) => entry.option.option_id)
  for (const entry of chosen) {
    if (isGroupVisible(subcategory, entry.group, chosenIds)) continue
    const { parent } = hidingContext(subcategory, entry.group)
    violations.push({
      code: 'group_dependency',
      message: parent
        ? `${entry.group.display_label} applies only when you choose a different ${parent.display_label}.`
        : `${entry.group.display_label} does not apply to this configuration.`,
      groupKey: entry.group.group_key,
      optionId: entry.option.option_id,
    })
  }

  // --- 3. Fill the untouched groups with our own defaults (never send []) --------
  const normalized: number[] = [...chosenIds]
  for (const group of subcategory.groups) {
    if (chosenByGroup.has(group.id)) continue
    const fallback = defaultIdForGroup(group)
    if (fallback !== null && !normalized.includes(fallback)) normalized.push(fallback)
    if (fallback === null && hasHostileProviderDefault(group)) {
      // Omitting this group would let the provider resolve it to an option that needs
      // image content the masters do not carry. There is nothing safe to send, so the
      // configuration is refused rather than ordered into a 406 after payment.
      violations.push({
        code: 'option_unavailable',
        message: `${group.display_label} has no available choice, so this cannot be ordered right now.`,
        groupKey: group.group_key,
      })
    }
  }
  normalized.sort((a, b) => a - b)

  const selected = normalized
    .map((id) => index.find((entry) => entry.option.option_id === id))
    .filter((entry): entry is { group: CatalogOptionGroup; option: CatalogOption } => Boolean(entry))

  // --- 4. Required groups: exactly one, counted AFTER the defaults --------------
  for (const group of subcategory.groups) {
    if (group.required !== true || group.removed_from_api === true) continue
    const count = selected.filter((entry) => entry.group.id === group.id).length
    if (count === 1) continue
    violations.push({
      code: 'group_required',
      message:
        count === 0
          ? `Choose a ${group.display_label}.`
          : `Choose only one ${group.display_label}.`,
      groupKey: group.group_key,
    })
  }

  // --- 5. The hex a Solid Color wrap carries ------------------------------------
  const needsHex = selected.find((entry) => entry.option.geometry?.needs_hex === true)
  if (needsHex) {
    const hex = (solidHex ?? '').trim()
    if (!hex) {
      violations.push({
        code: 'hex_required',
        message: `Choose a color for ${needsHex.option.display_label} before you continue.`,
        groupKey: needsHex.group.group_key,
        optionId: needsHex.option.option_id,
      })
    } else if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      violations.push({
        code: 'hex_invalid',
        message: 'That color is not a valid six digit hex code, for example #1a1a1a.',
        groupKey: needsHex.group.group_key,
        optionId: needsHex.option.option_id,
      })
    }
  }

  // --- 6. Size: bounds, then the master's resolution and shape ------------------
  const sizeUsable = Number.isFinite(widthIn) && Number.isFinite(heightIn) && widthIn > 0 && heightIn > 0
  if (!sizeUsable) {
    violations.push({
      code: 'size_out_of_bounds',
      message: 'Enter a width and a height greater than zero.',
    })
  } else if (
    !fitsEitherWay(
      widthIn,
      heightIn,
      subcategory.min_width_in,
      subcategory.max_width_in,
      subcategory.min_height_in,
      subcategory.max_height_in,
    )
  ) {
    violations.push({
      code: 'size_out_of_bounds',
      message: `${trimNum(widthIn)} by ${trimNum(heightIn)} inches is outside the ${trimNum(subcategory.min_width_in)} to ${trimNum(subcategory.max_width_in)} by ${trimNum(subcategory.min_height_in)} to ${trimNum(subcategory.max_height_in)} inch range for ${subcategory.display_label}.`,
    })
  }

  if (sizeUsable && master) {
    const dpi = subcategory.required_dpi
    const printW = Number(master.printWidthPx)
    const printH = Number(master.printHeightPx)
    const maxWidthIn = dpi > 0 ? Math.floor((printW / dpi) * 100) / 100 : 0
    const maxHeightIn = dpi > 0 ? Math.floor((printH / dpi) * 100) / 100 : 0
    const resolutionOk = dpi > 0 && widthIn * dpi <= printW + EPS && heightIn * dpi <= printH + EPS
    if (!resolutionOk) {
      violations.push({
        code: 'size_resolution',
        message: `Too large. This artwork supports up to ${trimNum(maxWidthIn)} by ${trimNum(maxHeightIn)} inches at ${dpi} DPI.`,
      })
    }

    // Orientation-aware on purpose: the provider's image check normalises orientation
    // (F32) and would pass a rotated master, so ours compares the shape as ordered.
    const ratio = printH > 0 ? printW / printH : Number.POSITIVE_INFINITY
    const orderedRatio = widthIn / heightIn
    const base = Math.min(ratio, orderedRatio)
    const aspectDeltaPct =
      base > 0 && Number.isFinite(base) ? (Math.abs(orderedRatio - ratio) / base) * 100 : Number.POSITIVE_INFINITY
    if (!(aspectDeltaPct <= ASPECT_TOLERANCE_PCT + EPS)) {
      violations.push({
        code: 'size_aspect',
        message: `${aspectDeltaPct.toFixed(1)}% off the shape of the artwork. Adjust a dimension.`,
      })
    }
  }

  // --- 7. Mats grow the frame around an unchanged print size (P3) ---------------
  let perSideTotal = 0
  let matEntry: { group: CatalogOptionGroup; option: CatalogOption } | null = null
  for (const entry of selected) {
    const perSide = entry.option.geometry?.per_side_in
    if (typeof perSide === 'number' && perSide > 0) {
      perSideTotal += perSide
      if (!matEntry) matEntry = entry
    }
  }
  const outerWidthIn = sizeUsable ? widthIn + 2 * perSideTotal : widthIn
  const outerHeightIn = sizeUsable ? heightIn + 2 * perSideTotal : heightIn

  if (sizeUsable && perSideTotal > 0 && matEntry) {
    const ceiling = glassCeiling(subcategory)
    if (!fitsEitherWay(outerWidthIn, outerHeightIn, 0, ceiling.w, 0, ceiling.h)) {
      violations.push({
        code: 'glass_ceiling',
        message: `${matEntry.option.display_label} makes this ${trimNum(outerWidthIn)} by ${trimNum(outerHeightIn)} inches framed, which is larger than the ${trimNum(ceiling.w)} by ${trimNum(ceiling.h)} inch limit for ${subcategory.display_label}. Choose a narrower mat or a smaller print.`,
        groupKey: matEntry.group.group_key,
        optionId: matEntry.option.option_id,
      })
    }
  }

  // --- 8. Whitelisted sizes (the metal easel: the provider prices it anywhere) ---
  if (sizeUsable) {
    for (const entry of selected) {
      const list = entry.option.geometry?.size_whitelist
      if (!list || list.length === 0) continue
      const fits = list.some(
        ([w, h]) =>
          (Math.abs(w - widthIn) < EPS && Math.abs(h - heightIn) < EPS) ||
          (Math.abs(w - heightIn) < EPS && Math.abs(h - widthIn) < EPS),
      )
      if (fits) continue
      violations.push({
        code: 'size_whitelist',
        message: `${entry.option.display_label} is available only at ${list
          .map(([w, h]) => `${trimNum(w)} by ${trimNum(h)}`)
          .join(', ')} inches.`,
        groupKey: entry.group.group_key,
        optionId: entry.option.option_id,
      })
    }
  }

  const shippingClassIds = selected
    .filter((entry) => entry.option.geometry?.shipping_class === true)
    .map((entry) => entry.option.option_id)
    .sort((a, b) => a - b)

  return { violations, normalizedOptionIds: normalized, outerWidthIn, outerHeightIn, shippingClassIds }
}

/** The ids a subcategory contributes when the customer has chosen nothing at all. */
export function defaultOptionIds(subcategory: CatalogSubcategory): number[] {
  const ids: number[] = []
  for (const group of subcategory.groups) {
    const id = defaultIdForGroup(group)
    if (id !== null && !ids.includes(id)) ids.push(id)
  }
  return ids.sort((a, b) => a - b)
}

/** Whether a size fits a subcategory's published bounds, orientation-aware. */
export function sizeWithinBounds(subcategory: CatalogSubcategory, size: RuleSize): boolean {
  return fitsEitherWay(
    Number(size.widthIn),
    Number(size.heightIn),
    subcategory.min_width_in,
    subcategory.max_width_in,
    subcategory.min_height_in,
    subcategory.max_height_in,
  )
}

export { glassCeiling, isGroupVisible as isDependentGroupVisible }
