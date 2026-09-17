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
// The storefront tree (`includeDisabled: false`) is filtered at the QUERY on every
// level, not only on subcategories: a disabled or tombstoned group or option is not
// the storefront's business and must not be serialized to a browser. The one thing
// that still has to survive that filter is the required-group guard, because a framed
// canvas whose frame styles are all off is not sellable and the rows proving it are
// exactly the ones being filtered away. So the guard reads its own small census of
// required groups, which is sellability data the storefront needs rather than catalog
// metadata it displays.
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
  includeDisabled: boolean,
): Promise<CatalogOptionGroupRow[]> {
  const rows: CatalogOptionGroupRow[] = []
  for (const slice of chunk(subcategoryRefs, IN_CHUNK)) {
    let query = client.from('lumaprints_option_groups').select(GROUP_COLS).in('subcategory_ref', slice)
    if (!includeDisabled) query = query.eq('enabled', true).eq('removed_from_api', false)
    rows.push(...unwrap<CatalogOptionGroupRow>(await query, 'option groups'))
  }
  return rows
}

async function readOptions(
  client: SupabaseClient,
  groupRefs: string[],
  includeDisabled: boolean,
): Promise<CatalogOptionRow[]> {
  const rows: CatalogOptionRow[] = []
  for (const slice of chunk(groupRefs, IN_CHUNK)) {
    let query = client.from('lumaprints_options').select(OPTION_COLS).in('group_ref', slice)
    if (!includeDisabled) query = query.eq('enabled', true).eq('removed_from_api', false)
    rows.push(...unwrap<CatalogOptionRow>(await query, 'options'))
  }
  return rows
}

/** The subset of a group row the sellability guard needs. */
interface RequiredGroupCensusRow {
  id: string
  subcategory_ref: string
  group_key: string
  display_label: string
}

/**
 * Every `required` group the provider still lists, whatever its own toggle says.
 *
 * The storefront read filters disabled groups away, so without this census a required
 * group with every option switched off would simply vanish and its subcategory would
 * look sellable. It is not: the provider rejects the order, after payment.
 */
async function readRequiredGroupCensus(
  client: SupabaseClient,
  subcategoryRefs: string[],
): Promise<RequiredGroupCensusRow[]> {
  const rows: RequiredGroupCensusRow[] = []
  for (const slice of chunk(subcategoryRefs, IN_CHUNK)) {
    const result = await client
      .from('lumaprints_option_groups')
      .select('id, subcategory_ref, group_key, display_label')
      .in('subcategory_ref', slice)
      .eq('required', true)
      .eq('removed_from_api', false)
    rows.push(...unwrap<RequiredGroupCensusRow>(result, 'required option groups'))
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

  const subcategoryRefs = subcategoryRows.map((row) => row.id)
  const groupRows = subcategoryRefs.length ? await readGroups(client, subcategoryRefs, includeDisabled) : []
  const optionRows = groupRows.length
    ? await readOptions(client, groupRows.map((row) => row.id), includeDisabled)
    : []
  // The admin tree already holds every group, so its census is free.
  const requiredCensus: RequiredGroupCensusRow[] = includeDisabled
    ? groupRows.filter((row) => row.required === true && row.removed_from_api !== true)
    : subcategoryRefs.length
      ? await readRequiredGroupCensus(client, subcategoryRefs)
      : []

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
 * True when leaving this group out of a provider call would let the provider resolve
 * it to something geometry-hostile: Image Wrap on canvas (+3.75in of image per axis),
 * a 0.25in bleed on paper (a shrunken image). Both reject an aspect-exact master at
 * image check, which is the 406 that took launch night down.
 */
function hasHostileProviderDefault(group: CatalogOptionGroup): boolean {
  return group.options.some(
    (option) =>
      option.provider_default === true && typeof option.geometry?.requires_file_bleed_in === 'number',
  )
}

/**
 * The option ids to send for a subcategory when the customer has chosen nothing.
 *
 * This is what every provider call sends instead of `[]` (P15: an empty array resolves
 * to Image Wrap on canvas and a 0.25in bleed on paper, both of which 406 an
 * aspect-exact master). Per group, exactly one id is contributed, and only the group's
 * marked `is_default`:
 *
 *  - when the group is live and that option is on, it is the neutral choice we sell;
 *  - ALSO when the group is off, hidden, or its default has been switched off, BUT the
 *    provider would resolve the omission to a geometry-hostile option. Our default goes
 *    anyway, because it is our configuration rather than a customer's choice, and the
 *    alternative is not "no option" but the provider's bad one.
 *
 * Never contributed: a tombstoned option (the provider rejects an id it no longer
 * associates with the subcategory) or a blocked one (ADR-4). A group with nothing
 * sendable contributes nothing rather than guessing at a substitute.
 *
 * Call this on a tree loaded with `includeDisabled: true`. The storefront tree
 * deliberately drops disabled groups, so the hostile-default rule above cannot see the
 * groups it exists for.
 */
export function defaultSelection(subcategory: CatalogSubcategory): number[] {
  const ids: number[] = []
  for (const group of subcategory.groups) {
    if (group.removed_from_api === true) continue
    const marked = group.options.find((option) => option.is_default === true)
    if (!marked || marked.removed_from_api === true || marked.blocked_reason !== null) continue
    if ((group.effective_enabled && marked.enabled === true) || hasHostileProviderDefault(group)) {
      ids.push(marked.option_id)
    }
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
