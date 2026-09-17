// Authored by DotWin
// Catalog loader: the three catalog tables plus the medium switch, read for one API
// host and handed to `assembleCatalog` (assemble.ts), which resolves ADR-5 effective
// availability and the ADR-4 blocked reasons. This file owns the I/O and the caching;
// the cascade itself has one pure implementation next door, so a script or a test can
// build the same tree from fixture rows without a database.
//
// The storefront tree (`includeDisabled: false`) is filtered at the QUERY on every
// level, not only on subcategories: a disabled or tombstoned group or option is not
// the storefront's business and must not be serialized to a browser. The one thing
// that still has to survive that filter is the required-group guard, because a framed
// canvas whose frame styles are all off is not sellable and the rows proving it are
// exactly the ones being filtered away. So the guard reads its own small census of
// required groups, which is sellability data the storefront needs rather than catalog
// metadata it displays, and passes it to the assembler.
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
import {
  assembleCatalog,
  BLOCKED_NEEDS_BLEED,
  optionBlockedReason,
  type RequiredGroupCensusRow,
} from '@/lib/catalog/assemble'
import type {
  Catalog,
  CatalogOption,
  CatalogOptionGroup,
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategory,
  CatalogSubcategoryRow,
} from '@/lib/catalog/types'

// The cascade moved to assemble.ts; both names keep their old import path so the
// admin table and the tests are unaffected by where the logic now lives.
export { BLOCKED_NEEDS_BLEED, optionBlockedReason }

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
 * The host whose catalog rows a READ uses. Normally the provider host the app talks to
 * (`catalogHost()`); on a preview deploy, which talks to the SANDBOX provider, the
 * catalog tables hold no sandbox rows and every product would offer nothing. P0 proved
 * the two hosts share every id (F12 closed: 1,239 same-name-same-id rows), so a preview
 * may read the production-host rows and still price and order against the sandbox.
 * `CATALOG_READ_HOST` is honoured only outside production; sync writes never use it
 * (they key on the host they walked), so a preview can never write production rows.
 */
export function catalogReadHost(env: Record<string, string | undefined> = process.env): string {
  const override = (env.CATALOG_READ_HOST ?? '').trim()
  if (override && env.VERCEL_ENV !== 'production') return override
  return catalogHost()
}

export interface LoadCatalogOptions {
  /** API host whose ids this tree is built from; defaults to the configured read host. */
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

async function readMediumSwitch(client: SupabaseClient): Promise<Array<{ medium: string; enabled: boolean }>> {
  const result = await client.from('lumaprints_mediums').select('medium, enabled')
  return unwrap<{ medium: string; enabled: boolean }>(result, 'mediums')
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
  const host = opts.host ?? catalogReadHost()
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

  return assembleCatalog(
    {
      host,
      mediums: mediumSwitch,
      subcategories: subcategoryRows,
      groups: groupRows,
      options: optionRows,
      requiredGroupCensus: requiredCensus,
    },
    { includeDisabled },
  )
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
  const host = catalogReadHost()
  const read = unstable_cache(
    async () => loadCatalog(await createServiceClient(), { host, includeDisabled: false }),
    ['lumaprints-catalog', host],
    { tags: [CATALOG_CACHE_TAG], revalidate: CATALOG_REVALIDATE_SECONDS },
  )
  return read()
})

/**
 * The FULL tree (disabled and tombstoned rows included), cached exactly like the
 * storefront one: same tag, same revalidate, memoized per request.
 *
 * Pricing needs this tree rather than the storefront's. The storefront read drops
 * disabled groups, and a disabled group is precisely the one whose geometry-hostile
 * provider default has to be overridden, so quoting against the filtered tree would
 * send the provider an omission it resolves into a 406 after payment. The public quote
 * route serves one request per keystroke on the configurator, and an uncached load is
 * four table reads each time, so it reads this instead.
 *
 * It is server-only data: it carries rows an admin has switched off, and nothing here
 * may be serialized into a browser payload. Callers send prices and labels, not the tree.
 */
export const getFullCatalogCached = cache(async (): Promise<Catalog> => {
  const host = catalogReadHost()
  const read = unstable_cache(
    async () => loadCatalog(await createServiceClient(), { host, includeDisabled: true }),
    ['lumaprints-catalog-full', host],
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
