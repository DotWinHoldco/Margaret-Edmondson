// Authored by DotWin
// Pure catalog assembly: rows in, the `Catalog` tree of types.ts out, with the
// ADR-5 cascade and the ADR-4 blocked reasons already resolved.
//
// This is the half of the loader that has no I/O. It lives on its own so the
// quote engine, the verification scripts and the tests can build a tree from
// fixture rows without a database, and so the cascade has exactly one
// implementation: `load.ts` reads the rows and calls this, and nothing else
// re-derives effective availability.
//
// The cascade is AND all the way down and includes tombstones:
//   subcategory.effective = medium_enabled AND enabled AND NOT removed
//                           AND every `required` group still has >= 1 effective option
//   group.effective       = group.enabled AND NOT removed AND subcategory.effective
//   option.effective      = option.enabled AND NOT removed AND group.effective
//                           AND blocked_reason === null
//
// Imports are relative and type-only so plain node (type stripping) can load
// this module from a verification script.

import type {
  Catalog,
  CatalogOption,
  CatalogOptionGroup,
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategory,
  CatalogSubcategoryRow,
} from './types'

/**
 * Customer-visible copy for the ADR-4 bleed block. Plain sentences: these strings
 * reach a shopper on the configurator, not only the admin table.
 */
export const BLOCKED_NEEDS_BLEED =
  'This finish needs a print file with extra bleed. Our print files keep the whole artwork, so it is not available.'

/** The subset of a group row the sellability guard needs. */
export interface RequiredGroupCensusRow {
  id: string
  subcategory_ref: string
  group_key: string
  display_label: string
}

export interface CatalogRowSet {
  host: string
  mediums: Array<{ medium: string; enabled: boolean }>
  subcategories: CatalogSubcategoryRow[]
  groups: CatalogOptionGroupRow[]
  options: CatalogOptionRow[]
  /**
   * Every `required` group the provider still lists, whatever its own toggle says.
   *
   * The storefront read filters disabled groups away, so without this census a
   * required group with every option switched off would simply vanish and its
   * subcategory would look sellable. It is not: the provider rejects the order,
   * after payment. Omit it and the census is taken from `groups`, which is right
   * for a tree assembled from every row (the admin view and the tests).
   */
  requiredGroupCensus?: RequiredGroupCensusRow[]
}

export interface AssembleOptions {
  /** Admin view: the caller kept disabled and tombstoned rows in the row set. */
  includeDisabled: boolean
}

function byOrderThenName(aOrder: number, aName: string, bOrder: number, bName: string): number {
  const orderA = Number.isFinite(aOrder) ? aOrder : 0
  const orderB = Number.isFinite(bOrder) ? bOrder : 0
  if (orderA !== orderB) return orderA - orderB
  return aName.localeCompare(bName)
}

/**
 * ADR-4: why an option can never be turned on, independent of its `enabled` column.
 * Computed for every option (including disabled ones) because the admin table shows
 * the reason next to a toggle that refuses.
 */
export function optionBlockedReason(row: Pick<CatalogOptionRow, 'geometry'>): string | null {
  const geometry = row.geometry
  if (!geometry) return null
  if (typeof geometry.requires_file_bleed_in === 'number') return BLOCKED_NEEDS_BLEED
  if (typeof geometry.probe_owed === 'string' && geometry.probe_owed.length > 0) return geometry.probe_owed
  return null
}

/** An option that could be sold if everything above it were on. */
function optionSelfOk(option: CatalogOption): boolean {
  return option.enabled === true && option.removed_from_api !== true && option.blocked_reason === null
}

function groupSelfOk(group: CatalogOptionGroupRow): boolean {
  return group.enabled === true && group.removed_from_api !== true
}

function subcategoryBlockedReason(
  row: CatalogSubcategoryRow,
  mediumEnabled: boolean,
  emptyRequiredGroup: { display_label: string } | null,
): string | null {
  // Only a row an admin believes is on needs an explanation for why it is not.
  if (row.enabled !== true) return null
  if (row.removed_from_api === true)
    return 'The print provider no longer lists this option, so it cannot be sold.'
  if (!mediumEnabled) return 'This medium is turned off, so nothing under it is offered.'
  if (emptyRequiredGroup)
    return `No option is available in the required group "${emptyRequiredGroup.display_label}", so this cannot be offered. Turn at least one of its options on.`
  return null
}

/**
 * Assemble one host's catalog rows into the tree every caller reads.
 *
 * `opts.includeDisabled` describes the ROW SET, not a filter applied here:
 * nothing is dropped by this function. It only decides where the required-group
 * census comes from when the caller did not supply one, because a tree built
 * from every row already holds its own census and a storefront tree does not.
 */
export function assembleCatalog(rows: CatalogRowSet, opts: AssembleOptions): Catalog {
  const mediumSwitch = new Map<string, boolean>(
    rows.mediums.map((row) => [row.medium, row.enabled === true]),
  )

  const requiredCensus: RequiredGroupCensusRow[] =
    rows.requiredGroupCensus ??
    (opts.includeDisabled
      ? rows.groups.filter((row) => row.required === true && row.removed_from_api !== true)
      : [])

  const optionsByGroup = new Map<string, CatalogOption[]>()
  for (const row of rows.options) {
    const option: CatalogOption = {
      ...row,
      blocked_reason: optionBlockedReason(row),
      effective_enabled: false,
    }
    const bucket = optionsByGroup.get(row.group_ref)
    if (bucket) bucket.push(option)
    else optionsByGroup.set(row.group_ref, [option])
  }
  for (const bucket of optionsByGroup.values()) {
    bucket.sort((a, b) => byOrderThenName(a.sort_order, a.display_label, b.sort_order, b.display_label))
  }

  const groupsBySubcategory = new Map<string, CatalogOptionGroup[]>()
  for (const row of rows.groups) {
    const options = optionsByGroup.get(row.id) ?? []
    const group: CatalogOptionGroup = {
      ...row,
      options,
      effective_enabled: false,
      default_option_id: options.find((option) => option.is_default === true)?.option_id ?? null,
    }
    const bucket = groupsBySubcategory.get(row.subcategory_ref)
    if (bucket) bucket.push(group)
    else groupsBySubcategory.set(row.subcategory_ref, [group])
  }
  for (const bucket of groupsBySubcategory.values()) {
    bucket.sort((a, b) => byOrderThenName(a.sort_order, a.display_label, b.sort_order, b.display_label))
  }

  const subcategories: CatalogSubcategory[] = rows.subcategories.map((row) => {
    const groups = groupsBySubcategory.get(row.id) ?? []
    const mediumEnabled = mediumSwitch.get(row.medium) === true

    // A required group with nothing sellable in it takes the whole subcategory down:
    // there is no valid order to place for it (F20). Read from the census, so a group
    // the storefront filter dropped still counts against the subcategory.
    const emptyRequiredGroup =
      requiredCensus
        .filter((census) => census.subcategory_ref === row.id)
        .find((census) => {
          const assembled = groups.find((candidate) => candidate.id === census.id)
          return !assembled || !groupSelfOk(assembled) || !assembled.options.some(optionSelfOk)
        }) ?? null

    const effective =
      mediumEnabled && row.enabled === true && row.removed_from_api !== true && emptyRequiredGroup === null

    for (const group of groups) {
      group.effective_enabled = effective && groupSelfOk(group)
      for (const option of group.options) {
        option.effective_enabled = group.effective_enabled && optionSelfOk(option)
      }
    }

    return {
      ...row,
      groups,
      medium_enabled: mediumEnabled,
      effective_enabled: effective,
      blocked_reason: subcategoryBlockedReason(row, mediumEnabled, emptyRequiredGroup),
    }
  })

  subcategories.sort((a, b) => byOrderThenName(a.sort_order, a.name, b.sort_order, b.name))

  return { host: rows.host, loaded_at: new Date().toISOString(), subcategories }
}
