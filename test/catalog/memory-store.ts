// Authored by DotWin
// An in-memory CatalogStore for the sync suite.
//
// It is not a stub: it enforces the same invariants the migration does, because
// those invariants are what the tests are actually about. The natural keys
// (api_host, subcategory_id) / (subcategory_ref, group_key) / (group_ref,
// option_id) reject duplicates with a 23505-shaped error, only one option per
// group may carry is_default, and only one run per host may be `running`. A
// merge bug that would raise a constraint violation in Postgres raises one here.
//
// Rows are cloned on the way in and on the way out, so a test that mutates a
// returned row cannot accidentally rewrite the store and prove nothing.

import { randomUUID } from 'node:crypto'
import type {
  CatalogStore,
  OptionApiPatch,
  OptionGroupApiPatch,
  OptionGroupInsert,
  OptionInsert,
  SubcategoryApiPatch,
  SubcategoryInsert,
  SyncRunInsert,
  SyncRunPatch,
  WriteResult,
} from '@/lib/catalog/store'
import type {
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategoryRow,
  CatalogSyncRunRow,
} from '@/lib/catalog/types'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

class UniqueViolation extends Error {
  code = '23505'
  constructor(key: string) {
    super(`duplicate key value violates unique constraint "${key}"`)
  }
}

export interface MemoryCatalogStore extends CatalogStore {
  /** Everything the store holds, cloned. Tests assert against this. */
  dump(): {
    subcategories: CatalogSubcategoryRow[]
    groups: CatalogOptionGroupRow[]
    options: CatalogOptionRow[]
    runs: CatalogSyncRunRow[]
  }
  /** Direct row access for arranging an admin edit between two sync runs. */
  patchSubcategory(id: string, patch: Partial<CatalogSubcategoryRow>): void
  patchGroup(id: string, patch: Partial<CatalogOptionGroupRow>): void
  patchOption(id: string, patch: Partial<CatalogOptionRow>): void
}

export function createMemoryCatalogStore(): MemoryCatalogStore {
  const subcategories = new Map<string, CatalogSubcategoryRow>()
  const groups = new Map<string, CatalogOptionGroupRow>()
  const options = new Map<string, CatalogOptionRow>()
  const runs = new Map<string, CatalogSyncRunRow>()

  const allSubcategories = () => [...subcategories.values()]
  const allGroups = () => [...groups.values()]
  const allOptions = () => [...options.values()]

  function requireSubcategory(id: string): CatalogSubcategoryRow {
    const row = subcategories.get(id)
    if (!row) throw new Error(`no subcategory ${id}`)
    return row
  }
  function requireGroup(id: string): CatalogOptionGroupRow {
    const row = groups.get(id)
    if (!row) throw new Error(`no option group ${id}`)
    return row
  }
  function requireOption(id: string): CatalogOptionRow {
    const row = options.get(id)
    if (!row) throw new Error(`no option ${id}`)
    return row
  }

  /** Host of an option row, resolved through its group and subcategory. */
  function hostOfOption(option: CatalogOptionRow): string {
    return requireSubcategory(requireGroup(option.group_ref).subcategory_ref).api_host
  }

  const store: MemoryCatalogStore = {
    async listSubcategories(host) {
      return allSubcategories()
        .filter((r) => r.api_host === host)
        .sort((a, b) => a.subcategory_id - b.subcategory_id)
        .map(clone)
    },

    async insertSubcategory(row: SubcategoryInsert): Promise<WriteResult<CatalogSubcategoryRow>> {
      const clash = allSubcategories().find(
        (r) => r.api_host === row.api_host && r.subcategory_id === row.subcategory_id,
      )
      if (clash) throw new UniqueViolation('lumaprints_subcategories_api_host_subcategory_id_key')
      const created: CatalogSubcategoryRow = { id: randomUUID(), ...clone(row) } as CatalogSubcategoryRow
      subcategories.set(created.id, created)
      return { row: clone(created), created: true }
    },

    async updateSubcategory(id: string, patch: SubcategoryApiPatch) {
      const row = requireSubcategory(id)
      Object.assign(row, clone(patch))
      return clone(row)
    },

    async setSubcategoryEnabled(id, enabled) {
      requireSubcategory(id).enabled = enabled
    },

    async countEnabledSubcategories(host) {
      return allSubcategories().filter((r) => r.api_host === host && r.enabled).length
    },

    async tombstoneSubcategoriesNotSeen(host, seenSince) {
      let n = 0
      for (const row of allSubcategories()) {
        if (row.api_host !== host || row.removed_from_api) continue
        if (row.last_seen_at >= seenSince) continue
        row.removed_from_api = true
        row.enabled = false
        n += 1
      }
      return n
    },

    async listGroups(subcategoryRef) {
      return allGroups()
        .filter((g) => g.subcategory_ref === subcategoryRef)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(clone)
    },

    async insertGroup(row: OptionGroupInsert): Promise<WriteResult<CatalogOptionGroupRow>> {
      const clash = allGroups().find(
        (g) => g.subcategory_ref === row.subcategory_ref && g.group_key === row.group_key,
      )
      if (clash) throw new UniqueViolation('lumaprints_option_groups_subcategory_ref_group_key_key')
      const created = { id: randomUUID(), ...clone(row) } as CatalogOptionGroupRow
      groups.set(created.id, created)
      return { row: clone(created), created: true }
    },

    async updateGroup(id: string, patch: OptionGroupApiPatch) {
      const row = requireGroup(id)
      Object.assign(row, clone(patch))
      return clone(row)
    },

    async setGroupFlags(id, flags) {
      const row = requireGroup(id)
      if (flags.required !== undefined) row.required = flags.required
      if (flags.enabled !== undefined) row.enabled = flags.enabled
    },

    async tombstoneGroupsNotSeen(host, seenSince) {
      let n = 0
      for (const row of allGroups()) {
        if (requireSubcategory(row.subcategory_ref).api_host !== host || row.removed_from_api) continue
        if (row.last_seen_at >= seenSince) continue
        row.removed_from_api = true
        row.enabled = false
        n += 1
      }
      return n
    },

    async listOptions(groupRef) {
      return allOptions()
        .filter((o) => o.group_ref === groupRef)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(clone)
    },

    async insertOption(row: OptionInsert): Promise<WriteResult<CatalogOptionRow>> {
      const clash = allOptions().find((o) => o.group_ref === row.group_ref && o.option_id === row.option_id)
      if (clash) throw new UniqueViolation('lumaprints_options_group_ref_option_id_key')
      if (row.is_default && allOptions().some((o) => o.group_ref === row.group_ref && o.is_default)) {
        throw new UniqueViolation('lumaprints_options_one_default_per_group')
      }
      const created = { id: randomUUID(), ...clone(row) } as CatalogOptionRow
      options.set(created.id, created)
      return { row: clone(created), created: true }
    },

    async updateOption(id: string, patch: OptionApiPatch) {
      const row = requireOption(id)
      Object.assign(row, clone(patch))
      return clone(row)
    },

    async setOptionFlags(id, flags) {
      const row = requireOption(id)
      if (flags.enabled !== undefined) row.enabled = flags.enabled
      if (flags.provider_default !== undefined) row.provider_default = flags.provider_default
    },

    async setGroupDefault(groupRef, optionId) {
      for (const row of allOptions()) if (row.group_ref === groupRef) row.is_default = false
      if (optionId === null) return
      const target = allOptions().find((o) => o.group_ref === groupRef && o.option_id === optionId)
      if (!target) throw new Error(`no option ${optionId} in group ${groupRef}`)
      target.is_default = true
    },

    async tombstoneOptionsNotSeen(host, seenSince) {
      let n = 0
      for (const row of allOptions()) {
        if (hostOfOption(row) !== host || row.removed_from_api) continue
        if (row.last_seen_at >= seenSince) continue
        row.removed_from_api = true
        row.enabled = false
        n += 1
      }
      return n
    },

    async createRun(row: SyncRunInsert) {
      if (row.status === 'running' && [...runs.values()].some((r) => r.api_host === row.api_host && r.status === 'running')) {
        throw new UniqueViolation('catalog_sync_runs_one_running_per_host')
      }
      const created = clone(row) as CatalogSyncRunRow
      runs.set(created.id, created)
      return clone(created)
    },

    async getRun(id) {
      const row = runs.get(id)
      return row ? clone(row) : null
    },

    async findRunningRun(host) {
      const row = [...runs.values()].find((r) => r.api_host === host && r.status === 'running')
      return row ? clone(row) : null
    },

    async listRuns(host, limit) {
      return [...runs.values()]
        .filter((r) => r.api_host === host)
        .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
        .slice(0, limit)
        .map(clone)
    },

    async updateRun(id: string, patch: SyncRunPatch) {
      const row = runs.get(id)
      if (!row) throw new Error(`no run ${id}`)
      Object.assign(row, clone(patch), { updated_at: new Date().toISOString() })
      return clone(row)
    },

    dump() {
      return {
        subcategories: allSubcategories().map(clone),
        groups: allGroups().map(clone),
        options: allOptions().map(clone),
        runs: [...runs.values()].map(clone),
      }
    },

    patchSubcategory(id, patch) {
      Object.assign(requireSubcategory(id), clone(patch))
    },
    patchGroup(id, patch) {
      Object.assign(requireGroup(id), clone(patch))
    },
    patchOption(id, patch) {
      Object.assign(requireOption(id), clone(patch))
    },
  }

  return store
}
