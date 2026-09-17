// Authored by DotWin
// The catalog's write surface: everything sync v2 needs to read and change, and
// nothing else. One interface, two implementations (Supabase here, in-memory in
// the test suite), so merge semantics are proved against the real fixture without
// a database and without ever calling the provider.
//
// Why this is not a handful of `.upsert()` calls: PostgREST compiles `.upsert()`
// to INSERT ... ON CONFLICT DO UPDATE SET <every column in the payload>, so an
// upsert of a row that already exists would overwrite `enabled`, `is_default`,
// `display_label`, `swatch`, `geometry` and `sort_order` with seed values every
// single sync. That is exactly the state reset ADR-7 forbids: the admin's whole
// catalog configuration would silently revert on a cron tick. So every write here
// is a SELECT, then an INSERT or an UPDATE with an explicit column list, keyed by
// the natural key. A 23505 on the insert means a concurrent writer won the race,
// which is not an error: re-read and apply the API-sourced patch instead.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategoryRow,
  CatalogSyncRunRow,
  PricingMode,
  SyncCursor,
  SyncDiff,
  SyncStats,
  SyncStatus,
} from '@/lib/catalog/types'

// ---------------------------------------------------------------------------
// Payloads. Insert shapes carry the seeds; patch shapes carry ONLY the fields
// the provider owns, which is what makes "merge, never reset" a type, not a rule
// someone has to remember.
// ---------------------------------------------------------------------------

export interface SubcategoryInsert {
  medium: string
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
  max_glass_w_in: number | null
  max_glass_h_in: number | null
  enabled: boolean
  sort_order: number
  customer_note: string | null
  pricing_mode: PricingMode
  first_seen_at: string
  last_seen_at: string
  acknowledged_at: string | null
  removed_from_api: boolean
  last_synced_at: string
}

export interface SubcategoryApiPatch {
  name: string
  min_width_in: number
  max_width_in: number
  min_height_in: number
  max_height_in: number
  required_dpi: number
  last_seen_at: string
  last_synced_at: string
  removed_from_api: false
}

export interface OptionGroupInsert {
  subcategory_ref: string
  group_key: string
  api_group_name: string
  display_label: string
  required: boolean
  customer_visible: boolean
  enabled: boolean
  display_kind: string
  depends_on_group: string | null
  depends_hidden_when: number[] | null
  sort_order: number
  first_seen_at: string
  last_seen_at: string
  acknowledged_at: string | null
  removed_from_api: boolean
}

export interface OptionGroupApiPatch {
  api_group_name: string
  depends_on_group: string | null
  depends_hidden_when: number[] | null
  last_seen_at: string
  removed_from_api: false
}

export interface OptionInsert {
  group_ref: string
  option_id: number
  api_option_name: string
  display_label: string
  enabled: boolean
  is_default: boolean
  provider_default: boolean
  sort_order: number
  swatch: Record<string, unknown> | null
  geometry: Record<string, unknown> | null
  first_seen_at: string
  last_seen_at: string
  acknowledged_at: string | null
  removed_from_api: boolean
}

export interface OptionApiPatch {
  api_option_name: string
  last_seen_at: string
  removed_from_api: false
}

export interface SyncRunInsert {
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

export interface SyncRunPatch {
  status?: SyncStatus
  cursor?: SyncCursor
  stats?: SyncStats
  diff?: SyncDiff | null
  error?: string | null
  finished_at?: string | null
}

/** A row that was inserted, or one that already existed and was merged into. */
export interface WriteResult<T> {
  row: T
  created: boolean
}

// ---------------------------------------------------------------------------

export interface CatalogStore {
  // Subcategories, keyed by (api_host, subcategory_id).
  listSubcategories(host: string): Promise<CatalogSubcategoryRow[]>
  insertSubcategory(row: SubcategoryInsert): Promise<WriteResult<CatalogSubcategoryRow>>
  updateSubcategory(id: string, patch: SubcategoryApiPatch): Promise<CatalogSubcategoryRow>
  setSubcategoryEnabled(id: string, enabled: boolean): Promise<void>
  countEnabledSubcategories(host: string): Promise<number>
  tombstoneSubcategoriesNotSeen(host: string, seenSince: string): Promise<number>

  // Option groups, keyed by (subcategory_ref, group_key).
  listGroups(subcategoryRef: string): Promise<CatalogOptionGroupRow[]>
  insertGroup(row: OptionGroupInsert): Promise<WriteResult<CatalogOptionGroupRow>>
  updateGroup(id: string, patch: OptionGroupApiPatch): Promise<CatalogOptionGroupRow>
  setGroupFlags(id: string, flags: { required?: boolean; enabled?: boolean }): Promise<void>
  tombstoneGroupsNotSeen(host: string, seenSince: string): Promise<number>

  // Options, keyed by (group_ref, option_id).
  listOptions(groupRef: string): Promise<CatalogOptionRow[]>
  insertOption(row: OptionInsert): Promise<WriteResult<CatalogOptionRow>>
  updateOption(id: string, patch: OptionApiPatch): Promise<CatalogOptionRow>
  setOptionFlags(id: string, flags: { enabled?: boolean; provider_default?: boolean }): Promise<void>
  /**
   * Make exactly one option the group's default. Clears the group first so the
   * partial unique index (one row per group WHERE is_default) never trips
   * mid-write; a null option id leaves the group with no default.
   */
  setGroupDefault(groupRef: string, optionId: number | null): Promise<void>
  tombstoneOptionsNotSeen(host: string, seenSince: string): Promise<number>

  // Runs.
  createRun(row: SyncRunInsert): Promise<CatalogSyncRunRow>
  getRun(id: string): Promise<CatalogSyncRunRow | null>
  findRunningRun(host: string): Promise<CatalogSyncRunRow | null>
  listRuns(host: string, limit: number): Promise<CatalogSyncRunRow[]>
  updateRun(id: string, patch: SyncRunPatch): Promise<CatalogSyncRunRow>
}

// ---------------------------------------------------------------------------
// Supabase implementation
// ---------------------------------------------------------------------------

const SUBCATEGORIES = 'lumaprints_subcategories'
const GROUPS = 'lumaprints_option_groups'
const OPTIONS = 'lumaprints_options'
const RUNS = 'catalog_sync_runs'

// Explicit column lists, not `*`: a projection is part of the contract, and a
// column added to one of these tables later should reach this module by someone
// deciding it belongs here, not by a wildcard picking it up on the next deploy.
const SUBCATEGORY_COLUMNS =
  'id, medium, subcategory_id, api_host, name, display_label, description, min_width_in, max_width_in, min_height_in, max_height_in, required_dpi, max_glass_w_in, max_glass_h_in, enabled, sort_order, customer_note, pricing_mode, first_seen_at, last_seen_at, acknowledged_at, removed_from_api, last_synced_at'
const GROUP_COLUMNS =
  'id, subcategory_ref, group_key, api_group_name, display_label, required, customer_visible, enabled, display_kind, depends_on_group, depends_hidden_when, sort_order, first_seen_at, last_seen_at, acknowledged_at, removed_from_api'
const OPTION_COLUMNS =
  'id, group_ref, option_id, api_option_name, display_label, enabled, is_default, provider_default, sort_order, swatch, geometry, first_seen_at, last_seen_at, acknowledged_at, removed_from_api'
const RUN_COLUMNS = 'id, api_host, status, dry_run, cursor, stats, diff, error, started_at, updated_at, finished_at'

/** Postgres unique_violation: a concurrent writer inserted the same natural key. */
const UNIQUE_VIOLATION = '23505'

interface PostgrestFailure {
  message: string
  code?: string
}

function fail(context: string, error: PostgrestFailure | null): never {
  throw new Error(`${context}: ${error?.message ?? 'unknown database error'}`)
}

/** PostgREST filters travel in the URL, so long id lists are sent in slices. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const ID_CHUNK = 100

export function createSupabaseCatalogStore(client: SupabaseClient): CatalogStore {
  const db = client

  async function subcategoryIdsForHost(host: string): Promise<string[]> {
    const { data, error } = await db.from(SUBCATEGORIES).select('id').eq('api_host', host)
    if (error) fail('list subcategory ids', error)
    return (data ?? []).map((r: { id: string }) => r.id)
  }

  async function groupIdsForSubcategories(refs: string[]): Promise<string[]> {
    const ids: string[] = []
    for (const slice of chunk(refs, ID_CHUNK)) {
      const { data, error } = await db.from(GROUPS).select('id').in('subcategory_ref', slice)
      if (error) fail('list group ids', error)
      ids.push(...(data ?? []).map((r: { id: string }) => r.id))
    }
    return ids
  }

  async function updateSubcategoryRow(id: string, patch: SubcategoryApiPatch): Promise<CatalogSubcategoryRow> {
    const { data, error } = await db.from(SUBCATEGORIES).update(patch).eq('id', id).select(SUBCATEGORY_COLUMNS).single()
    if (error) fail('update subcategory', error)
    return data as CatalogSubcategoryRow
  }

  async function updateGroupRow(id: string, patch: OptionGroupApiPatch): Promise<CatalogOptionGroupRow> {
    const { data, error } = await db.from(GROUPS).update(patch).eq('id', id).select(GROUP_COLUMNS).single()
    if (error) fail('update option group', error)
    return data as CatalogOptionGroupRow
  }

  async function updateOptionRow(id: string, patch: OptionApiPatch): Promise<CatalogOptionRow> {
    const { data, error } = await db.from(OPTIONS).update(patch).eq('id', id).select(OPTION_COLUMNS).single()
    if (error) fail('update option', error)
    return data as CatalogOptionRow
  }

  return {
    async listSubcategories(host) {
      const { data, error } = await db
        .from(SUBCATEGORIES)
        .select(SUBCATEGORY_COLUMNS)
        .eq('api_host', host)
        .order('subcategory_id', { ascending: true })
      if (error) fail('list subcategories', error)
      return (data ?? []) as CatalogSubcategoryRow[]
    },

    async insertSubcategory(row) {
      const { data, error } = await db.from(SUBCATEGORIES).insert(row).select(SUBCATEGORY_COLUMNS).single()
      if (!error) return { row: data as CatalogSubcategoryRow, created: true }
      if (error.code !== UNIQUE_VIOLATION) fail('insert subcategory', error)
      // Concurrent writer won: adopt their row and apply only the provider's fields.
      const { data: existing, error: readError } = await db
        .from(SUBCATEGORIES)
        .select(SUBCATEGORY_COLUMNS)
        .eq('api_host', row.api_host)
        .eq('subcategory_id', row.subcategory_id)
        .single()
      if (readError) fail('re-read subcategory after conflict', readError)
      const merged = await updateSubcategoryRow((existing as CatalogSubcategoryRow).id, {
        name: row.name,
        min_width_in: row.min_width_in,
        max_width_in: row.max_width_in,
        min_height_in: row.min_height_in,
        max_height_in: row.max_height_in,
        required_dpi: row.required_dpi,
        last_seen_at: row.last_seen_at,
        last_synced_at: row.last_synced_at,
        removed_from_api: false,
      })
      return { row: merged, created: false }
    },

    updateSubcategory: updateSubcategoryRow,

    async setSubcategoryEnabled(id, enabled) {
      const { error } = await db.from(SUBCATEGORIES).update({ enabled }).eq('id', id)
      if (error) fail('set subcategory enabled', error)
    },

    async countEnabledSubcategories(host) {
      const { count, error } = await db
        .from(SUBCATEGORIES)
        .select('id', { count: 'exact', head: true })
        .eq('api_host', host)
        .eq('enabled', true)
      if (error) fail('count enabled subcategories', error)
      return count ?? 0
    },

    async tombstoneSubcategoriesNotSeen(host, seenSince) {
      const { data, error } = await db
        .from(SUBCATEGORIES)
        .update({ removed_from_api: true, enabled: false })
        .eq('api_host', host)
        .eq('removed_from_api', false)
        .lt('last_seen_at', seenSince)
        .select('id')
      if (error) fail('tombstone subcategories', error)
      return (data ?? []).length
    },

    async listGroups(subcategoryRef) {
      const { data, error } = await db
        .from(GROUPS)
        .select(GROUP_COLUMNS)
        .eq('subcategory_ref', subcategoryRef)
        .order('sort_order', { ascending: true })
      if (error) fail('list option groups', error)
      return (data ?? []) as CatalogOptionGroupRow[]
    },

    async insertGroup(row) {
      const { data, error } = await db.from(GROUPS).insert(row).select(GROUP_COLUMNS).single()
      if (!error) return { row: data as CatalogOptionGroupRow, created: true }
      if (error.code !== UNIQUE_VIOLATION) fail('insert option group', error)
      const { data: existing, error: readError } = await db
        .from(GROUPS)
        .select(GROUP_COLUMNS)
        .eq('subcategory_ref', row.subcategory_ref)
        .eq('group_key', row.group_key)
        .single()
      if (readError) fail('re-read option group after conflict', readError)
      const merged = await updateGroupRow((existing as CatalogOptionGroupRow).id, {
        api_group_name: row.api_group_name,
        depends_on_group: row.depends_on_group,
        depends_hidden_when: row.depends_hidden_when,
        last_seen_at: row.last_seen_at,
        removed_from_api: false,
      })
      return { row: merged, created: false }
    },

    updateGroup: updateGroupRow,

    async setGroupFlags(id, flags) {
      const patch: Record<string, boolean> = {}
      if (flags.required !== undefined) patch.required = flags.required
      if (flags.enabled !== undefined) patch.enabled = flags.enabled
      if (Object.keys(patch).length === 0) return
      const { error } = await db.from(GROUPS).update(patch).eq('id', id)
      if (error) fail('set option group flags', error)
    },

    async tombstoneGroupsNotSeen(host, seenSince) {
      const refs = await subcategoryIdsForHost(host)
      let tombstoned = 0
      for (const slice of chunk(refs, ID_CHUNK)) {
        const { data, error } = await db
          .from(GROUPS)
          .update({ removed_from_api: true, enabled: false })
          .in('subcategory_ref', slice)
          .eq('removed_from_api', false)
          .lt('last_seen_at', seenSince)
          .select('id')
        if (error) fail('tombstone option groups', error)
        tombstoned += (data ?? []).length
      }
      return tombstoned
    },

    async listOptions(groupRef) {
      const { data, error } = await db
        .from(OPTIONS)
        .select(OPTION_COLUMNS)
        .eq('group_ref', groupRef)
        .order('sort_order', { ascending: true })
      if (error) fail('list options', error)
      return (data ?? []) as CatalogOptionRow[]
    },

    async insertOption(row) {
      const { data, error } = await db.from(OPTIONS).insert(row).select(OPTION_COLUMNS).single()
      if (!error) return { row: data as CatalogOptionRow, created: true }
      if (error.code !== UNIQUE_VIOLATION) fail('insert option', error)
      const { data: existing, error: readError } = await db
        .from(OPTIONS)
        .select(OPTION_COLUMNS)
        .eq('group_ref', row.group_ref)
        .eq('option_id', row.option_id)
        .single()
      if (readError) fail('re-read option after conflict', readError)
      const merged = await updateOptionRow((existing as CatalogOptionRow).id, {
        api_option_name: row.api_option_name,
        last_seen_at: row.last_seen_at,
        removed_from_api: false,
      })
      return { row: merged, created: false }
    },

    updateOption: updateOptionRow,

    async setOptionFlags(id, flags) {
      const patch: Record<string, boolean> = {}
      if (flags.enabled !== undefined) patch.enabled = flags.enabled
      if (flags.provider_default !== undefined) patch.provider_default = flags.provider_default
      if (Object.keys(patch).length === 0) return
      const { error } = await db.from(OPTIONS).update(patch).eq('id', id)
      if (error) fail('set option flags', error)
    },

    async setGroupDefault(groupRef, optionId) {
      const { error: clearError } = await db
        .from(OPTIONS)
        .update({ is_default: false })
        .eq('group_ref', groupRef)
        .eq('is_default', true)
      if (clearError) fail('clear group default', clearError)
      if (optionId === null) return
      const { error } = await db
        .from(OPTIONS)
        .update({ is_default: true })
        .eq('group_ref', groupRef)
        .eq('option_id', optionId)
      if (error) fail('set group default', error)
    },

    async tombstoneOptionsNotSeen(host, seenSince) {
      const refs = await subcategoryIdsForHost(host)
      const groupIds = await groupIdsForSubcategories(refs)
      let tombstoned = 0
      for (const slice of chunk(groupIds, ID_CHUNK)) {
        const { data, error } = await db
          .from(OPTIONS)
          .update({ removed_from_api: true, enabled: false })
          .in('group_ref', slice)
          .eq('removed_from_api', false)
          .lt('last_seen_at', seenSince)
          .select('id')
        if (error) fail('tombstone options', error)
        tombstoned += (data ?? []).length
      }
      return tombstoned
    },

    async createRun(row) {
      const { data, error } = await db.from(RUNS).insert(row).select(RUN_COLUMNS).single()
      if (error) fail('create sync run', error)
      return data as CatalogSyncRunRow
    },

    async getRun(id) {
      const { data, error } = await db.from(RUNS).select(RUN_COLUMNS).eq('id', id).maybeSingle()
      if (error) fail('read sync run', error)
      return (data ?? null) as CatalogSyncRunRow | null
    },

    async findRunningRun(host) {
      const { data, error } = await db
        .from(RUNS)
        .select(RUN_COLUMNS)
        .eq('api_host', host)
        .eq('status', 'running')
        .maybeSingle()
      if (error) fail('find running sync run', error)
      return (data ?? null) as CatalogSyncRunRow | null
    },

    async listRuns(host, limit) {
      const { data, error } = await db
        .from(RUNS)
        .select(RUN_COLUMNS)
        .eq('api_host', host)
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) fail('list sync runs', error)
      return (data ?? []) as CatalogSyncRunRow[]
    },

    async updateRun(id, patch) {
      const { data, error } = await db
        .from(RUNS)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(RUN_COLUMNS)
        .single()
      if (error) fail('update sync run', error)
      return data as CatalogSyncRunRow
    },
  }
}
