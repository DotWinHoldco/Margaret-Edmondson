// Authored by DotWin
// Catalog loader: the three catalog tables plus the medium switch, assembled into the
// `Catalog` tree of types.ts with ADR-5 effective availability and ADR-4 blocked
// reasons already resolved, so no caller ever re-derives the cascade.
//
// The cascade is AND all the way down and includes tombstones:
//   subcategory.effective = medium_enabled AND enabled AND NOT removed
//                           AND every `required` group still has >= 1 effective option
//   group.effective       = group.enabled AND NOT removed AND subcategory.effective
//   option.effective      = option.enabled AND NOT removed AND group.effective
//                           AND blocked_reason === null
// A blocked option (ADR-4: needs a bleed the masters do not carry, or a probe still
// owed) is never effective even when the DB row says enabled: the admin toggle also
// refuses, and this is the belt to that pair of braces.
//
// Reads are plain PostgREST selects. The supabase-js builder is PromiseLike, so every
// query is awaited and its `{ data, error }` read; nothing is chained off it.

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medium } from '@/lib/pricing/mediums'
import { createServiceClient } from '@/lib/supabase/server'
import { CATALOG_CACHE_TAG } from '@/lib/catalog/cache-tag'
import { catalogHost } from '@/lib/catalog/walk'
import type {
  Catalog,
  CatalogOption,
  CatalogOptionGroup,
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategory,
  CatalogSubcategoryRow,
} from '@/lib/catalog/types'

// Explicit column lists (house security gate: never select('*')); they mirror the Row
// types in types.ts, so a schema change shows up here as a type error, not a silent extra field.
const SUBCATEGORY_COLS =
  'id, medium, subcategory_id, api_host, name, display_label, description, min_width_in, max_width_in, min_height_in, max_height_in, required_dpi, max_glass_w_in, max_glass_h_in, enabled, sort_order, customer_note, pricing_mode, first_seen_at, last_seen_at, acknowledged_at, removed_from_api, last_synced_at'
const GROUP_COLS =
  'id, subcategory_ref, group_key, api_group_name, display_label, required, customer_visible, enabled, display_kind, depends_on_group, depends_hidden_when, sort_order, first_seen_at, last_seen_at, acknowledged_at, removed_from_api'
const OPTION_COLS =
  'id, group_ref, option_id, api_option_name, display_label, enabled, is_default, provider_default, sort_order, swatch, geometry, first_seen_at, last_seen_at, acknowledged_at, removed_from_api'


/** PostgREST rejects very long `in` lists; every id list is read in slices of this size. */
const IN_CHUNK = 200

/** How long the storefront tree may be served before a background refresh (seconds). */
const CATALOG_REVALIDATE_SECONDS = 300

/**
 * Customer-visible copy for the two ADR-4 blocks. Plain sentences: these strings reach
 * a shopper on the configurator, not only the admin table.
 */
export const BLOCKED_NEEDS_BLEED =
  'This finish needs a print file with extra bleed. Our print files keep the whole artwork, so it is not available.'

export interface LoadCatalogOptions {
  /** API host whose ids this tree is built from; defaults to the configured provider host. */
  host?: string
  /** Admin view: keep disabled and tombstoned rows so the toggle UI can show them. */
  includeDisabled?: boolean
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function unwrap<T>(result: { data: unknown; error: { message?: string } | null }, what: string): T[] {
  if (result.error) throw new Error(`Catalog is temporarily unavailable (${what}).`)
  return (result.data ?? []) as T[]
}

async function readMediumSwitch(client: SupabaseClient): Promise<Map<string, boolean>> {
  const result = await client.from('lumaprints_mediums').select('medium, enabled')
  const rows = unwrap<{ medium: string; enabled: boolean }>(result, 'mediums')
  return new Map(rows.map((row) => [row.medium, row.enabled === true]))
}

async function readSubcategories(
  client: SupabaseClient,
  host: string,
  includeDisabled: boolean,
): Promise<CatalogSubcategoryRow[]> {
  // The storefront read is the same shape the public RLS policy allows, so a cookie
  // client and the service client return the identical set of rows.
  let query = client.from('lumaprints_subcategories').select(SUBCATEGORY_COLS).eq('api_host', host)
  if (!includeDisabled) query = query.eq('enabled', true).eq('removed_from_api', false)
  return unwrap<CatalogSubcategoryRow>(await query, 'subcategories')
}

async function readGroups(
  client: SupabaseClient,
  subcategoryRefs: string[],
): Promise<CatalogOptionGroupRow[]> {
  const rows: CatalogOptionGroupRow[] = []
  for (const slice of chunk(subcategoryRefs, IN_CHUNK)) {
    const result = await client.from('lumaprints_option_groups').select(GROUP_COLS).in('subcategory_ref', slice)
    rows.push(...unwrap<CatalogOptionGroupRow>(result, 'option groups'))
  }
  return rows
}

async function readOptions(client: SupabaseClient, groupRefs: string[]): Promise<CatalogOptionRow[]> {
  const rows: CatalogOptionRow[] = []
  for (const slice of chunk(groupRefs, IN_CHUNK)) {
    const result = await client.from('lumaprints_options').select(OPTION_COLS).in('group_ref', slice)
    rows.push(...unwrap<CatalogOptionRow>(result, 'options'))
  }
  return rows
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

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
  emptyRequiredGroup: CatalogOptionGroup | null,
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
 * Read the three catalog tables for one API host and assemble the tree.
 *
 * `includeDisabled: false` (the storefront) drops disabled and tombstoned
 * subcategories at the query, exactly as the public policy does; groups and options
 * are still returned in full so the cascade can explain an empty required group.
 */
export async function loadCatalog(
  client: SupabaseClient,
  opts: LoadCatalogOptions = {},
): Promise<Catalog> {
  const host = opts.host ?? catalogHost()
  const includeDisabled = opts.includeDisabled === true

  const [mediumSwitch, subcategoryRows] = await Promise.all([
    readMediumSwitch(client),
    readSubcategories(client, host, includeDisabled),
  ])

  const groupRows = subcategoryRows.length
    ? await readGroups(client, subcategoryRows.map((row) => row.id))
    : []
  const optionRows = groupRows.length ? await readOptions(client, groupRows.map((row) => row.id)) : []

  const optionsByGroup = new Map<string, CatalogOption[]>()
  for (const row of optionRows) {
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
  for (const row of groupRows) {
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

  const subcategories: CatalogSubcategory[] = subcategoryRows.map((row) => {
    const groups = groupsBySubcategory.get(row.id) ?? []
    const mediumEnabled = mediumSwitch.get(row.medium) === true

    // A required group with nothing sellable in it takes the whole subcategory down:
    // there is no valid order to place for it (F20).
    const emptyRequiredGroup =
      groups.find(
        (group) => group.required === true && !(groupSelfOk(group) && group.options.some(optionSelfOk)),
      ) ?? null

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

  return { host, loaded_at: new Date().toISOString(), subcategories }
}

// ---------------------------------------------------------------------------
// Server entry points
// ---------------------------------------------------------------------------

/**
 * The storefront tree: cached under the catalog tag (sync and every admin toggle call
 * `invalidateCatalogCache()`), memoized per request by React `cache`.
 *
 * It reads with the SERVICE client and the same `enabled = true AND NOT removed`
 * filter the public policy imposes: the storefront never needs disabled rows, and one
 * client for the whole tree keeps it host-consistent instead of assembling a tree from
 * rows two different policies chose. RLS stays the backstop for any cookie-client read.
 */
export const getPublicCatalog = cache(async (): Promise<Catalog> => {
  const host = catalogHost()
  const read = unstable_cache(
    async () => loadCatalog(await createServiceClient(), { host, includeDisabled: false }),
    ['lumaprints-catalog', host],
    { tags: [CATALOG_CACHE_TAG], revalidate: CATALOG_REVALIDATE_SECONDS },
  )
  return read()
})

/**
 * The admin tree: every row, including disabled and tombstoned ones, read with the
 * caller's authenticated client and never cached (the toggle UI must see its own write).
 */
export async function getAdminCatalog(client: SupabaseClient): Promise<Catalog> {
  return loadCatalog(client, { includeDisabled: true })
}

// ---------------------------------------------------------------------------
// Pure helpers over an assembled tree
// ---------------------------------------------------------------------------

export function subcategoriesForMedium(catalog: Catalog, medium: Medium | string): CatalogSubcategory[] {
  return catalog.subcategories.filter((subcategory) => subcategory.medium === medium)
}

/** By row id (the `subcategoryRef` a selection carries) or by provider subcategory id. */
export function findSubcategory(catalog: Catalog, ref: string | number): CatalogSubcategory | null {
  const wanted = String(ref)
  return (
    catalog.subcategories.find(
      (subcategory) => subcategory.id === wanted || String(subcategory.subcategory_id) === wanted,
    ) ?? null
  )
}

export function effectiveOptions(group: CatalogOptionGroup): CatalogOption[] {
  return group.options.filter((option) => option.effective_enabled)
}

export function optionById(subcategory: CatalogSubcategory, optionId: number): CatalogOption | null {
  for (const group of subcategory.groups) {
    const found = group.options.find((option) => option.option_id === optionId)
    if (found) return found
  }
  return null
}

/**
 * The geometry-neutral option id of every group, customer-visible or not.
 *
 * This is what every provider call sends instead of `[]` (P15: an empty array resolves
 * to Image Wrap on canvas and a 0.25in bleed on paper, both of which 406 an
 * aspect-exact master). A tombstoned group contributes nothing, because the provider
 * rejects an option id it no longer associates with the subcategory; a group whose
 * marked default is blocked or tombstoned falls back to its first sendable option.
 */
export function defaultSelection(subcategory: CatalogSubcategory): number[] {
  const ids: number[] = []
  for (const group of subcategory.groups) {
    if (group.removed_from_api === true) continue
    const sendable = group.options.filter(
      (option) => option.removed_from_api !== true && option.blocked_reason === null,
    )
    const chosen = sendable.find((option) => option.is_default === true) ?? sendable[0]
    if (chosen) ids.push(chosen.option_id)
  }
  return ids
}

/**
 * Dependency gating only (`depends_on_group` / `depends_hidden_when`): Mat Color is
 * offered only once a real mat is chosen, and the server rejects the pair otherwise
 * because the provider accepts it silently at $0 (P8). The admin's `customer_visible`
 * flag is a separate axis the UI checks alongside this.
 *
 * When the customer has not touched the parent group yet, its default stands in, so a
 * dependent group is hidden from the first paint rather than after the first click.
 */
export function isGroupVisible(
  subcategory: CatalogSubcategory,
  group: CatalogOptionGroup,
  selectedOptionIds: readonly number[],
): boolean {
  const parentKey = group.depends_on_group
  if (!parentKey) return true
  const parent = subcategory.groups.find((candidate) => candidate.group_key === parentKey)
  if (!parent) return true

  // The dependent group carries the parent option ids that hide it.
  const hidden = group.depends_hidden_when ?? []
  if (hidden.length === 0) return true

  const parentIds = new Set(parent.options.map((option) => option.option_id))
  const selected = selectedOptionIds.find((id) => parentIds.has(id)) ?? parent.default_option_id
  if (selected === null || selected === undefined) return true
  return !hidden.includes(selected)
}
