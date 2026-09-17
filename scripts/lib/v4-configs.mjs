// Authored by DotWin
//
// The V4 order suite's PLAN, as a pure module: one maximal-option configuration per
// medium family, built from a Phase 0 catalog snapshot and proved against the real
// rules engine before a single provider call is made.
//
// Why this is its own file: the plan is the part of V4 that can be tested without
// spending provider budget or placing an order. The harness imports it, the unit test
// imports it, and both see exactly the same configurations. A configuration the engine
// refuses is a HARNESS bug, not a provider finding, so `buildV4Plan` throws rather than
// letting V4 send it and report the provider's answer as evidence.
//
// Three rules this module exists to keep (plan §9 F30, §6 P0, ADR-4):
//
//   - Every configuration is EXPLICIT. An empty `orderItemOptions` on a subcategory
//     that has groups resolves, provider-side, to Image Wrap on canvas and a 0.25in
//     bleed on paper, which 406 an aspect-exact master. Groups this plan does not
//     choose for get OUR engine default, never an omission.
//   - A blocked option is never chosen. `blocked_reason` carries the bleed block and
//     the owed rolled-canvas probe; the engine's own defaults already skip them, and
//     the pickers here filter on the same field.
//   - Nothing is asserted from this file. It builds a request; the provider's answer
//     and our own rows are the evidence.
//
// Pure ESM: no provider, no database, no filesystem. It imports the REAL catalog
// modules (assembler, seed rules, rules engine) through the project's module
// resolution, so a drifting replica cannot make the harness agree with itself.

import { assembleCatalog } from '../../src/lib/catalog/assemble'
import { canonicalGroupKey } from '../../src/lib/catalog/keys'
import { defaultOptionIds, evaluateSelection, glassCeiling } from '../../src/lib/catalog/rules'
import {
  geometryForOption,
  mediumForSubcategory,
  pickSeededDefault,
  resolveDependsHiddenWhen,
} from '../../src/lib/catalog/seed-rules'

/** The Solid Color Wrap the canvas order carries (P16: never echoed, so we record it). */
export const DEFAULT_SOLID_HEX = '#c8102e'

/**
 * Report order of the eight families. Also the order of the plan, so the printed
 * table and the V4 result table read the same way every run.
 */
export const MEDIUM_ORDER = [
  'canvas',
  'framed_canvas',
  'fine_art_paper',
  'framed_fine_art_paper',
  'foam_mounted_fine_art_paper',
  'metal',
  'peel_and_stick',
  'rolled_canvas',
]

const num = (value) => Number(value)
const nowIso = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// Snapshot -> catalog rows -> assembled tree
// ---------------------------------------------------------------------------

/**
 * Build the tree the rules engine reads from a Phase 0 snapshot, with every row
 * enabled, so the plan is measured against the PROVIDER's catalog rather than
 * whatever the admin has toggled today.
 *
 * The medium comes from `mediumForSubcategory`, which splits rolled canvas out of
 * provider category 101: the two share a category and are different products, and V4
 * owes one order per family, not one per category.
 */
export function treeFromSnapshot(snapshot) {
  const subcategories = []
  const groups = []
  const options = []
  const mediums = new Set()
  const stamp = nowIso()

  for (const category of snapshot.categories ?? []) {
    const categoryId = Number(category.id)
    for (const sub of category.subcategories ?? []) {
      const medium = mediumForSubcategory(categoryId, String(sub.name))
      mediums.add(medium)
      const subRef = `sub-${sub.subcategoryId}`
      subcategories.push({
        id: subRef,
        medium,
        subcategory_id: Number(sub.subcategoryId),
        api_host: snapshot.host,
        name: String(sub.name),
        display_label: String(sub.name),
        description: null,
        min_width_in: num(sub.minimumWidth),
        max_width_in: num(sub.maximumWidth),
        min_height_in: num(sub.minimumHeight),
        max_height_in: num(sub.maximumHeight),
        required_dpi: Number(sub.requiredDPI),
        // The published bounds ARE the glass ceiling until a probe proves another (P4).
        max_glass_w_in: null,
        max_glass_h_in: null,
        enabled: true,
        sort_order: 0,
        customer_note: null,
        pricing_mode: categoryId === 105 ? 'whole_config' : 'additive',
        first_seen_at: stamp,
        last_seen_at: stamp,
        acknowledged_at: stamp,
        removed_from_api: false,
        last_synced_at: stamp,
      })

      const namedByKey = new Map()
      for (const group of sub.optionGroups ?? []) {
        namedByKey.set(
          canonicalGroupKey(group.optionGroup),
          (group.optionGroupItems ?? []).map((item) => ({
            option_id: Number(item.optionId),
            api_option_name: String(item.optionName),
          })),
        )
      }

      const defaults = new Set()
      for (const group of sub.optionGroups ?? []) {
        const groupKey = canonicalGroupKey(group.optionGroup)
        const seeded = pickSeededDefault(
          groupKey,
          categoryId,
          String(sub.name),
          namedByKey.get(groupKey) ?? [],
        )
        if (seeded !== null) defaults.add(seeded)
      }

      for (const group of sub.optionGroups ?? []) {
        const groupKey = canonicalGroupKey(group.optionGroup)
        const groupRef = `${subRef}-${groupKey}`
        groups.push({
          id: groupRef,
          subcategory_ref: subRef,
          group_key: groupKey,
          api_group_name: group.optionGroup,
          display_label: group.optionGroup,
          // The three framed-canvas depths are the only subcategories that reject an
          // empty option array (P1/F13); their Frame Styles group is therefore required.
          required: groupKey === 'frame_style' && categoryId === 102,
          customer_visible: true,
          enabled: true,
          display_kind: 'list',
          depends_on_group: groupKey === 'mat_color' ? 'mat_size' : null,
          depends_hidden_when: resolveDependsHiddenWhen(groupKey, namedByKey),
          sort_order: 0,
          first_seen_at: stamp,
          last_seen_at: stamp,
          acknowledged_at: stamp,
          removed_from_api: false,
        })

        for (const item of group.optionGroupItems ?? []) {
          const optionId = Number(item.optionId)
          options.push({
            id: `${groupRef}-${optionId}`,
            group_ref: groupRef,
            option_id: optionId,
            api_option_name: String(item.optionName),
            display_label: String(item.optionName),
            enabled: true,
            is_default: defaults.has(optionId),
            provider_default: false,
            sort_order: 0,
            swatch: null,
            geometry: geometryForOption(groupKey, String(item.optionName)),
            first_seen_at: stamp,
            last_seen_at: stamp,
            acknowledged_at: stamp,
            removed_from_api: false,
          })
        }
      }
    }
  }

  return assembleCatalog(
    {
      host: snapshot.host,
      mediums: [...mediums].map((medium) => ({ medium, enabled: true })),
      subcategories,
      groups,
      options,
    },
    { includeDisabled: true },
  )
}

// ---------------------------------------------------------------------------
// Small readers over the assembled tree
// ---------------------------------------------------------------------------

const subsOfMedium = (catalog, medium) =>
  catalog.subcategories
    .filter((sub) => sub.medium === medium)
    .sort((a, b) => a.subcategory_id - b.subcategory_id)

const groupOf = (sub, groupKey) => sub.groups.find((group) => group.group_key === groupKey) ?? null

/** Options in a group we are allowed to choose: never a blocked one (ADR-4). */
const choosable = (group) =>
  (group?.options ?? [])
    .filter((option) => option.blocked_reason === null && option.removed_from_api !== true)
    .sort((a, b) => a.option_id - b.option_id)

/** First choosable option whose provider name matches one of the patterns, in order. */
function byName(group, patterns) {
  const list = choosable(group)
  for (const pattern of patterns) {
    const hit = list.find((option) => pattern.test(option.api_option_name))
    if (hit) return hit
  }
  return null
}

/** A non-default choosable option if the group offers one, else its default. */
function nonDefault(group) {
  const list = choosable(group)
  if (list.length === 0) return null
  return list.find((option) => option.is_default !== true) ?? list[0]
}

/** The default choosable option, else the first one. */
function defaultOf(group) {
  const list = choosable(group)
  if (list.length === 0) return null
  return list.find((option) => option.is_default === true) ?? list[0]
}

/**
 * Engine defaults with the named choices swapped into their own groups.
 *
 * The starting point is `defaultOptionIds` — the same function the configurator and
 * the pre-submit gate use — so a group this recipe says nothing about still travels
 * with our geometry-neutral option rather than being left to the provider (F30).
 */
function withChoices(sub, choices) {
  const ids = new Set(defaultOptionIds(sub))
  for (const choice of choices) {
    if (!choice || !choice.option) continue
    const group = choice.group
    for (const option of group.options) ids.delete(option.option_id)
    ids.add(choice.option.option_id)
  }
  return [...ids].sort((a, b) => a - b)
}

/** `{ group, option }` for a chooser, or null when the group is absent. */
function pick(sub, groupKey, chooser) {
  const group = groupOf(sub, groupKey)
  if (!group) return null
  const option = chooser(group)
  return option ? { group, option } : null
}

function describe(sub, ids) {
  const names = []
  for (const group of sub.groups) {
    for (const option of group.options) {
      if (ids.includes(option.option_id)) names.push(`${group.group_key}=${option.api_option_name} (${option.option_id})`)
    }
  }
  return names
}

// ---------------------------------------------------------------------------
// The eight recipes (plan §10 V4)
// ---------------------------------------------------------------------------

/**
 * One entry per family. `pickSubcategory` chooses the profile the order is placed on,
 * `size` is fixed by the plan where the plan names one (the fractional sizes, the
 * easel's whitelisted size, the framed-paper size whose glass fits its ceiling), and
 * `choices` names every group this configuration decides for itself.
 */
const RECIPES = {
  canvas: {
    // The depth whose hanging hardware offers a real alternative, so the order
    // exercises a non-default choice rather than the only member of a one-item group.
    pickSubcategory: (subs) =>
      subs.find((sub) => choosable(groupOf(sub, 'hanging_hardware')).length > 1) ?? subs[0],
    size: { width: 16, height: 20 },
    hex: true,
    choices: (sub) => [
      pick(sub, 'canvas_border', (group) => byName(group, [/^solid colou?r$/i])),
      pick(sub, 'hanging_hardware', nonDefault),
      pick(sub, 'canvas_finish', nonDefault),
    ],
    notes: [
      'Solid Color Wrap carries solidColorHexCode; the provider never echoes it (P16), so the request record is the evidence.',
      'Size 16 x 20 is a standard grid size inside every canvas depth bounds.',
    ],
  },

  framed_canvas: {
    // A profile that actually offers Oak or Walnut, so "non-default frame style" is a
    // named wood rather than "whatever is second in the list".
    pickSubcategory: (subs) =>
      subs.find((sub) => byName(groupOf(sub, 'frame_style'), [/\boak\b/i, /\bwalnut\b/i])) ?? subs[0],
    size: { width: 16, height: 20 },
    choices: (sub) => [
      pick(sub, 'frame_style', (group) => byName(group, [/\boak\b/i, /\bwalnut\b/i]) ?? choosable(group)[1] ?? choosable(group)[0]),
      pick(sub, 'canvas_border', (group) => byName(group, [/^mirror wrap$/i])),
      pick(sub, 'hanging_hardware', nonDefault),
      pick(sub, 'canvas_finish', nonDefault),
    ],
    notes: ['Frame Styles is the one required group in the catalog (P1/F13); it is chosen explicitly here.'],
  },

  fine_art_paper: {
    pickSubcategory: (subs) => subs.find((sub) => /archival matte/i.test(sub.name)) ?? subs[0],
    size: { width: 9.25, height: 11 },
    choices: (sub) => [pick(sub, 'bleed_size', (group) => byName(group, [/^no bleed/i]))],
    notes: [
      'Fractional size 9.25 x 11 (F15: fractional inches are accepted on every endpoint).',
      'No Bleed is the only bleed this catalog can sell: every other member expects a shrunken file (ADR-4 bleed block).',
    ],
  },

  framed_fine_art_paper: {
    // The plan names the 105005 profile; any 105xxx is a valid stand-in if the
    // snapshot ever drops it.
    pickSubcategory: (subs) => subs.find((sub) => sub.subcategory_id === 105005) ?? subs[0],
    size: { width: 11, height: 14 },
    choices: (sub) => [
      pick(sub, 'mat_size', (group) => byName(group, [/^3(\.0)?\s*inch/i])),
      pick(sub, 'mat_color', (group) => byName(group, [/french blue/i, /indigo/i, /moss point/i, /sauterne/i]) ?? choosable(group).find((o) => !/white/i.test(o.api_option_name))),
      pick(sub, 'paper_type', nonDefault),
      pick(sub, 'glazing', (group) => byName(group, [/^acrylic glass/i])),
      pick(sub, 'hanging_hardware', nonDefault),
      pick(sub, 'backing', nonDefault),
      // Mounting is chosen explicitly at our geometry-neutral option: dry mounting is
      // what the product is, and "maximal" means every group decided, not every group
      // flipped.
      pick(sub, 'print_mounting', defaultOf),
    ],
    notes: [
      'A 3in mat grows the glass to 17 x 20in, inside the 60 x 40in ceiling (P3/P4).',
      'Mat Color is a dependent group: it is only legitimate because a real mat is chosen.',
    ],
  },

  foam_mounted_fine_art_paper: {
    pickSubcategory: (subs) => subs.find((sub) => /archival matte/i.test(sub.name)) ?? subs[0],
    size: { width: 12.5, height: 16 },
    choices: (sub) => [pick(sub, 'bleed_size', (group) => byName(group, [/^no bleed/i]))],
    notes: ['Second fractional size of the suite: 12.5 x 16 (F15).'],
  },

  metal: {
    pickSubcategory: (subs) =>
      subs.find((sub) => /silver/i.test(sub.name)) ?? subs.find((sub) => /white/i.test(sub.name)) ?? subs[0],
    size: { width: 8, height: 10 },
    choices: (sub) => [pick(sub, 'metal_hardware', (group) => byName(group, [/^metal easel$/i]))],
    notes: [
      'The easel is whitelisted to seven sizes by our own rules; the provider prices it at any size (P9/F31). 8 x 10 is on the list.',
      'Glossy Silver publishes narrower bounds (10-36 x 8-24in); 8 x 10 fits it rotated, which is how the engine and the provider both read it (F32).',
    ],
  },

  peel_and_stick: {
    pickSubcategory: (subs) => subs[0],
    size: { width: 12, height: 12 },
    choices: () => [],
    notes: ['This subcategory publishes no option groups at all, so an empty array is the whole configuration, not an omission.'],
  },

  rolled_canvas: {
    pickSubcategory: (subs) => subs[0],
    size: { width: 16, height: 20 },
    choices: () => [],
    notes: [
      'Engine defaults only: the four Rolled Canvas Border Size options are blocked with an owed V3 image-check probe, so none of them is sent.',
    ],
  },
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * One order configuration per medium family present in the tree.
 *
 * Throws when a configuration the recipes produced does not survive
 * `evaluateSelection`: V4 exists to measure the provider, and a request our own gate
 * would refuse measures the harness instead.
 */
export function buildV4Plan(catalog, opts = {}) {
  const hex = typeof opts.hex === 'string' && opts.hex.length > 0 ? opts.hex : DEFAULT_SOLID_HEX
  const present = MEDIUM_ORDER.filter((medium) => subsOfMedium(catalog, medium).length > 0)
  const plan = []

  for (const medium of present) {
    const recipe = RECIPES[medium]
    if (!recipe) throw new Error(`buildV4Plan: no configuration recipe for medium "${medium}"`)
    const subs = subsOfMedium(catalog, medium)
    const sub = recipe.pickSubcategory(subs)
    if (!sub) throw new Error(`buildV4Plan: ${medium} has no subcategory to order`)

    const choices = recipe.choices(sub).filter(Boolean)
    const optionIds = withChoices(sub, choices)
    const size = { ...recipe.size }
    const solidHex = recipe.hex === true ? hex : undefined

    const notes = [...(recipe.notes ?? [])]
    notes.push(`options: ${describe(sub, optionIds).join(' · ') || 'none (the subcategory publishes no groups)'}`)
    const groupsWithOptions = sub.groups.filter((group) => choosable(group).length > 0).length
    if (groupsWithOptions > 0 && optionIds.length === 0) {
      throw new Error(
        `buildV4Plan: ${medium} ${sub.subcategory_id} would send an empty option array on a subcategory with ${groupsWithOptions} group(s) — the provider resolves that to Image Wrap / a 0.25in bleed (F30)`,
      )
    }
    if (groupsWithOptions === 0) notes.push('no option groups: an explicitly empty array is the correct request here')

    const ceiling = glassCeiling(sub)
    notes.push(`bounds ${sub.min_width_in}-${sub.max_width_in} x ${sub.min_height_in}-${sub.max_height_in}in · ceiling ${ceiling.w} x ${ceiling.h}in · required DPI ${sub.required_dpi}`)

    const evaluation = evaluateSelection(
      sub,
      { widthIn: size.width, heightIn: size.height },
      optionIds,
      solidHex,
    )
    if (evaluation.violations.length > 0) {
      throw new Error(
        `buildV4Plan: ${medium} ${sub.subcategory_id} ${size.width}x${size.height} was refused by the rules engine ` +
          `[${evaluation.violations.map((violation) => `${violation.code}${violation.optionId ? `:${violation.optionId}` : ''}`).join(', ')}] ` +
          `for options [${optionIds.join(', ')}]. A configuration the engine refuses is a harness bug, not a provider finding.`,
      )
    }
    if (evaluation.outerWidthIn !== size.width || evaluation.outerHeightIn !== size.height) {
      notes.push(`glass/outer size with the mat: ${evaluation.outerWidthIn} x ${evaluation.outerHeightIn}in`)
    }

    plan.push({
      medium,
      subcategoryId: sub.subcategory_id,
      subcategoryName: sub.name,
      size,
      optionIds,
      ...(solidHex ? { solidColorHexCode: solidHex } : {}),
      label: `${medium}-${sub.subcategory_id}-${String(size.width).replace('.', '_')}x${String(size.height).replace('.', '_')}`,
      notes,
    })
  }

  return plan
}

/** The subcategory row a plan entry was built from (V4 needs its required DPI). */
export function subcategoryForEntry(catalog, entry) {
  return catalog.subcategories.find((sub) => sub.subcategory_id === entry.subcategoryId) ?? null
}
