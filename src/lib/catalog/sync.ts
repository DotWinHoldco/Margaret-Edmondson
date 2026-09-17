// Authored by DotWin
// Catalog sync v2: a chunked, cursor-resumable structure walk that MERGES.
//
// Two facts shape this whole module.
//
// 1. A full walk is 59 provider requests paced at 25/minute (the shared key has
//    40/minute and the live storefront's quote path needs the rest), so a run is
//    minutes of wall time and the house invocation ceiling is 60 seconds. The
//    walk is therefore a row in `catalog_sync_runs` that successive invocations
//    advance one stage at a time, and every chunk is idempotent: re-running the
//    same cursor position produces the same rows, so a timeout costs one repeat,
//    never a half-merged catalog.
//
// 2. The catalog is half provider data and half the admin's configuration, in the
//    same rows. Sync owns the provider's half (names, bounds, DPI, which options
//    exist) and must not touch the other half (enabled, is_default, labels,
//    notes, swatches, geometry, sort order, pricing mode). A row that disappears
//    from the provider is tombstoned and switched off, never deleted: paid orders
//    reference these rows by id forever.
//
// The one deliberate provider call with an EMPTY options array lives in the
// `defaults` stage. Everywhere else an empty set is forbidden, because the
// provider resolves it to Image Wrap on canvas and a 0.25in bleed on paper, both
// of which reject an aspect-exact master at image check. That single call is how
// we learn what the provider would have chosen, precisely so that we can record
// it and then not use it.

import {
  getCategories,
  getProductsCost,
  getSubcategories,
  getSubcategoryOptions,
  type ProductCostRequestItem,
  type ProductCostResult,
} from '@/lib/integrations/lumaprints'
import { invalidateCatalogCache } from '@/lib/catalog/cache-tag'
import { canonicalGroupKey, slugKey } from '@/lib/catalog/keys'
import {
  categoryIdForMedium,
  displayKindForGroup,
  groupSeed,
  mediumForSubcategory,
  optionSeed,
  pickSeededDefault,
  resolveDependsHiddenWhen,
  subcategorySeed,
  type NamedOption,
} from '@/lib/catalog/seed-rules'
import type { CatalogStore } from '@/lib/catalog/store'
import { addStats, emptyDiff, emptyStats, mergeDiff, newRunRow } from '@/lib/catalog/sync-runs'
import type {
  CatalogOptionGroupRow,
  CatalogSubcategoryRow,
  CatalogSyncRunRow,
  SyncCursor,
  SyncDiff,
  SyncStats,
} from '@/lib/catalog/types'

// ---------------------------------------------------------------------------
// Provider surface
// ---------------------------------------------------------------------------

/** Exactly the four provider calls a catalog walk makes. */
export interface CatalogProviderClient {
  getCategories(): Promise<unknown>
  getSubcategories(categoryId: number | string): Promise<unknown>
  getSubcategoryOptions(subcategoryId: number | string): Promise<unknown>
  getProductsCost(items: ProductCostRequestItem[]): Promise<ProductCostResult[]>
}

/** The live client. Tests mock the module, never the network. */
export const liveProviderClient: CatalogProviderClient = {
  getCategories,
  getSubcategories,
  getSubcategoryOptions,
  getProductsCost,
}

export class CatalogSyncBusyError extends Error {
  constructor(public readonly runId: string) {
    super('A catalog sync is already running for this host')
    this.name = 'CatalogSyncBusyError'
  }
}

export class CatalogSyncRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogSyncRefusedError'
  }
}

export interface StartSyncOptions {
  host: string
  dryRun?: boolean
}

export interface ChunkOptions {
  /** Stop starting new work after this much wall time. Default 45s of a 60s ceiling. */
  budgetMs?: number
  /** Hard ceiling on provider requests in one invocation. Default 20. */
  maxRequests?: number
  /** Minimum gap between provider requests. Default 2400ms = 25/minute. */
  minIntervalMs?: number
}

const DEFAULT_BUDGET_MS = 45_000
const DEFAULT_MAX_REQUESTS = 20
const DEFAULT_MIN_INTERVAL_MS = 2400
/** The probe size every subcategory is priced at, clamped into its own bounds. */
const PROBE_WIDTH_IN = 12
const PROBE_HEIGHT_IN = 16

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Provider payload normalisation (the shapes are the committed fixture's)
// ---------------------------------------------------------------------------

interface RawCategory {
  id: number
  name: string
}

interface RawSubcategory {
  subcategoryId: number
  name: string
  minimumWidth: number
  maximumWidth: number
  minimumHeight: number
  maximumHeight: number
  requiredDPI: number
}

interface RawGroup {
  optionGroup: string
  optionGroupItems: NamedOption[]
}

const num = (v: unknown): number => Number(v)

function normaliseCategories(raw: unknown): RawCategory[] {
  if (!Array.isArray(raw)) return []
  return raw.map((c) => {
    const r = (c ?? {}) as Record<string, unknown>
    return { id: num(r.id ?? r.categoryId), name: String(r.name ?? r.categoryName ?? '') }
  })
}

function normaliseSubcategories(raw: unknown): RawSubcategory[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s) => {
    const r = (s ?? {}) as Record<string, unknown>
    return {
      subcategoryId: num(r.subcategoryId),
      name: String(r.name ?? ''),
      minimumWidth: num(r.minimumWidth),
      maximumWidth: num(r.maximumWidth),
      minimumHeight: num(r.minimumHeight),
      maximumHeight: num(r.maximumHeight),
      // The provider publishes DPI per subcategory; a missing value would silently
      // become NaN and then a not-null violation, so it is surfaced as 0 instead.
      requiredDPI: Number.isFinite(num(r.requiredDPI)) ? num(r.requiredDPI) : 0,
    }
  })
}

function normaliseGroups(raw: unknown): RawGroup[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map((g) => {
    const r = (g ?? {}) as Record<string, unknown>
    const items = Array.isArray(r.optionGroupItems) ? r.optionGroupItems : []
    return {
      optionGroup: String(r.optionGroup ?? ''),
      optionGroupItems: items.map((i) => {
        const item = (i ?? {}) as Record<string, unknown>
        return { option_id: num(item.optionId), api_option_name: String(item.optionName ?? '') }
      }),
    }
  })
}

// ---------------------------------------------------------------------------
// Chunk budget
// ---------------------------------------------------------------------------

class ChunkBudget {
  requests = 0
  private readonly startedAt = Date.now()
  private lastRequestAt = 0

  constructor(
    private readonly budgetMs: number,
    private readonly maxRequests: number,
    private readonly minIntervalMs: number,
  ) {}

  get elapsed(): number {
    return Date.now() - this.startedAt
  }

  outOfTime(): boolean {
    return this.elapsed >= this.budgetMs
  }

  /** Room for one more paced provider call inside both ceilings. */
  canRequest(): boolean {
    if (this.requests >= this.maxRequests) return false
    const pacing = this.lastRequestAt > 0 ? this.minIntervalMs : 0
    return this.elapsed + pacing < this.budgetMs
  }

  async request<T>(call: () => Promise<T>): Promise<T> {
    const gap = Date.now() - this.lastRequestAt
    if (this.lastRequestAt > 0 && gap < this.minIntervalMs) await sleep(this.minIntervalMs - gap)
    this.lastRequestAt = Date.now()
    this.requests += 1
    return call()
  }
}

// ---------------------------------------------------------------------------
// Chunk context
// ---------------------------------------------------------------------------

interface ChunkContext {
  store: CatalogStore
  client: CatalogProviderClient
  run: CatalogSyncRunRow
  host: string
  dryRun: boolean
  budget: ChunkBudget
  seenAt: string
  stats: SyncStats
  diff: SyncDiff
  /** Subcategory rows for this host, by provider id. Read once per chunk. */
  subcategories: Map<number, CatalogSubcategoryRow>
}

async function loadSubcategories(ctx: ChunkContext): Promise<void> {
  const rows = await ctx.store.listSubcategories(ctx.host)
  ctx.subcategories = new Map(rows.map((r) => [r.subcategory_id, r]))
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

// ---------------------------------------------------------------------------
// Stage: categories
// ---------------------------------------------------------------------------

async function stepCategories(ctx: ChunkContext): Promise<SyncCursor> {
  const categories = normaliseCategories(await ctx.budget.request(() => ctx.client.getCategories()))
  const ids = categories.map((c) => c.id).filter((id) => Number.isFinite(id))
  ctx.stats.categories += ids.length
  return { stage: 'subcategories', categoryIds: ids, categoryIndex: 0, subcategoryIds: [] }
}

// ---------------------------------------------------------------------------
// Stage: subcategories (one provider request per category)
// ---------------------------------------------------------------------------

async function stepSubcategories(ctx: ChunkContext, cursor: SyncCursor): Promise<SyncCursor> {
  const categoryIds = cursor.categoryIds ?? []
  const index = cursor.categoryIndex ?? 0
  const seen = cursor.subcategoryIds ?? []

  if (index >= categoryIds.length) {
    return { stage: 'options', categoryIds, subcategoryIds: seen, subcategoryIndex: 0 }
  }

  const categoryId = categoryIds[index]
  const subs = normaliseSubcategories(await ctx.budget.request(() => ctx.client.getSubcategories(categoryId)))

  const collected: number[] = []
  for (let i = 0; i < subs.length; i++) {
    await mergeSubcategory(ctx, categoryId, subs[i], i)
    collected.push(subs[i].subcategoryId)
  }
  ctx.stats.subcategories += subs.length

  return {
    stage: 'subcategories',
    categoryIds,
    categoryIndex: index + 1,
    subcategoryIds: [...seen, ...collected],
  }
}

async function mergeSubcategory(
  ctx: ChunkContext,
  categoryId: number,
  sub: RawSubcategory,
  index: number,
): Promise<void> {
  const existing = ctx.subcategories.get(sub.subcategoryId)

  if (existing) {
    // Bounds and DPI are the provider's to change; everything else on this row
    // belongs to the admin and is not in the patch shape at all.
    if (ctx.dryRun) {
      const fields: Array<[string, number, number]> = [
        ['min_width_in', Number(existing.min_width_in), sub.minimumWidth],
        ['max_width_in', Number(existing.max_width_in), sub.maximumWidth],
        ['min_height_in', Number(existing.min_height_in), sub.minimumHeight],
        ['max_height_in', Number(existing.max_height_in), sub.maximumHeight],
        ['required_dpi', Number(existing.required_dpi), sub.requiredDPI],
      ]
      for (const [field, from, to] of fields) {
        if (from !== to) ctx.diff.changedBounds.push({ subcategory_id: sub.subcategoryId, field, from, to })
      }
      if (existing.name !== sub.name) {
        ctx.diff.changedBounds.push({ subcategory_id: sub.subcategoryId, field: 'name', from: existing.name, to: sub.name })
      }
      return
    }
    const merged = await ctx.store.updateSubcategory(existing.id, {
      name: sub.name,
      min_width_in: sub.minimumWidth,
      max_width_in: sub.maximumWidth,
      min_height_in: sub.minimumHeight,
      max_height_in: sub.maximumHeight,
      required_dpi: sub.requiredDPI,
      last_seen_at: ctx.seenAt,
      last_synced_at: ctx.seenAt,
      removed_from_api: false,
    })
    ctx.subcategories.set(sub.subcategoryId, merged)
    ctx.stats.updated += 1
    return
  }

  if (ctx.dryRun) {
    ctx.diff.newSubcategories.push({ subcategory_id: sub.subcategoryId, name: sub.name })
    return
  }

  const seed = subcategorySeed(categoryId, sub.name)
  const { row, created } = await ctx.store.insertSubcategory({
    medium: mediumForSubcategory(categoryId, sub.name),
    subcategory_id: sub.subcategoryId,
    api_host: ctx.host,
    name: sub.name,
    display_label: seed.display_label,
    description: seed.description,
    min_width_in: sub.minimumWidth,
    max_width_in: sub.maximumWidth,
    min_height_in: sub.minimumHeight,
    max_height_in: sub.maximumHeight,
    required_dpi: sub.requiredDPI,
    max_glass_w_in: seed.max_glass_w_in,
    max_glass_h_in: seed.max_glass_h_in,
    // Everything new arrives OFF. The admin turns a medium on once its copy,
    // its margin and its geometry have been checked, never a sync.
    enabled: false,
    sort_order: index,
    customer_note: seed.customer_note,
    pricing_mode: seed.pricing_mode,
    first_seen_at: ctx.seenAt,
    last_seen_at: ctx.seenAt,
    acknowledged_at: null,
    removed_from_api: false,
    last_synced_at: ctx.seenAt,
  })
  ctx.subcategories.set(sub.subcategoryId, row)
  if (created) ctx.stats.inserted += 1
  else ctx.stats.updated += 1
}

// ---------------------------------------------------------------------------
// Stage: options (one provider request per subcategory)
// ---------------------------------------------------------------------------

async function stepOptions(ctx: ChunkContext, cursor: SyncCursor): Promise<SyncCursor> {
  const subcategoryIds = cursor.subcategoryIds ?? []
  const index = cursor.subcategoryIndex ?? 0

  if (index >= subcategoryIds.length) {
    return { stage: 'defaults', categoryIds: cursor.categoryIds, subcategoryIds, subcategoryIndex: 0 }
  }

  const subcategoryId = subcategoryIds[index]
  const groups = normaliseGroups(await ctx.budget.request(() => ctx.client.getSubcategoryOptions(subcategoryId)))
  await mergeSubcategoryOptions(ctx, subcategoryId, groups)

  return { stage: 'options', categoryIds: cursor.categoryIds, subcategoryIds, subcategoryIndex: index + 1 }
}

async function mergeSubcategoryOptions(
  ctx: ChunkContext,
  subcategoryId: number,
  groups: RawGroup[],
): Promise<void> {
  const subRow = ctx.subcategories.get(subcategoryId) ?? null
  // A dry run never wrote the new subcategory, so everything under it is new.
  const existingGroups = subRow ? await ctx.store.listGroups(subRow.id) : []
  const existingByKey = new Map<string, CatalogOptionGroupRow>(existingGroups.map((g) => [g.group_key, g]))

  const subcategoryName = subRow?.name ?? ''

  // Two provider names can canonicalise to ONE key, which would collide on the
  // (subcategory_ref, group_key) unique key. Rolled Canvas sits on that fault
  // today: "Rolled Canvas Border Size" contains "Canvas Border", so both of that
  // subcategory's groups resolve to `canvas_border`. Dropping the loser would
  // lose four sellable options, so the loser is filed under its own slug instead.
  // Rules that must not miss those rows are written against the option name.
  const keyed: Array<{ raw: RawGroup; key: string }> = []
  const takenKeys = new Set<string>()
  for (const raw of groups) {
    const canonical = canonicalGroupKey(raw.optionGroup)
    const key = takenKeys.has(canonical) ? slugKey(raw.optionGroup) : canonical
    if (takenKeys.has(key)) continue // the same provider group twice: nothing to add
    takenKeys.add(key)
    keyed.push({ raw, key })
  }

  // Dependency links point at sibling OPTION ids, so the whole subcategory's
  // option tree has to be in hand before any group row can be written.
  const walkedByKey = new Map<string, NamedOption[]>()
  for (const { raw, key } of keyed) walkedByKey.set(key, raw.optionGroupItems)

  const handledKeys = new Set<string>()
  for (let i = 0; i < keyed.length; i++) {
    const { raw, key } = keyed[i]
    const seed = { ...groupSeed(raw.optionGroup), group_key: key, display_kind: displayKindForGroup(key) }
    handledKeys.add(seed.group_key)

    const dependsHiddenWhen = resolveDependsHiddenWhen(seed.group_key, walkedByKey)
    const existing = existingByKey.get(seed.group_key)
    ctx.stats.groups += 1

    let groupRow: CatalogOptionGroupRow | null = null
    if (existing) {
      if (!ctx.dryRun) {
        groupRow = await ctx.store.updateGroup(existing.id, {
          api_group_name: raw.optionGroup,
          depends_on_group: seed.depends_on_group,
          depends_hidden_when: dependsHiddenWhen,
          last_seen_at: ctx.seenAt,
          removed_from_api: false,
        })
        ctx.stats.updated += 1
      } else {
        groupRow = existing
      }
    } else if (ctx.dryRun) {
      ctx.diff.newGroups.push({ subcategory_id: subcategoryId, api_group_name: raw.optionGroup })
    } else if (subRow) {
      const { row, created } = await ctx.store.insertGroup({
        subcategory_ref: subRow.id,
        group_key: seed.group_key,
        api_group_name: raw.optionGroup,
        display_label: seed.display_label,
        required: seed.required,
        customer_visible: seed.customer_visible,
        enabled: false,
        display_kind: seed.display_kind,
        depends_on_group: seed.depends_on_group,
        depends_hidden_when: dependsHiddenWhen,
        sort_order: i,
        first_seen_at: ctx.seenAt,
        last_seen_at: ctx.seenAt,
        acknowledged_at: null,
        removed_from_api: false,
      })
      groupRow = row
      if (created) ctx.stats.inserted += 1
      else ctx.stats.updated += 1
    }

    await mergeGroupOptions(ctx, subcategoryId, subcategoryName, seed.group_key, groupRow, raw.optionGroupItems, raw.optionGroup)
  }

  if (ctx.dryRun) {
    for (const g of existingGroups) {
      if (handledKeys.has(g.group_key) || g.removed_from_api) continue
      ctx.diff.removedGroups.push({ subcategory_id: subcategoryId, group_key: g.group_key })
    }
  }
}

async function mergeGroupOptions(
  ctx: ChunkContext,
  subcategoryId: number,
  subcategoryName: string,
  groupKey: string,
  groupRow: CatalogOptionGroupRow | null,
  options: NamedOption[],
  apiGroupName: string,
): Promise<void> {
  const existing = groupRow ? await ctx.store.listOptions(groupRow.id) : []
  const existingById = new Map(existing.map((o) => [o.option_id, o]))
  const walked = new Set<number>()

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]
    walked.add(opt.option_id)
    ctx.stats.options += 1
    const found = existingById.get(opt.option_id)

    if (found) {
      if (ctx.dryRun) continue
      await ctx.store.updateOption(found.id, {
        api_option_name: opt.api_option_name,
        last_seen_at: ctx.seenAt,
        removed_from_api: false,
      })
      ctx.stats.updated += 1
      continue
    }

    if (ctx.dryRun) {
      ctx.diff.newOptions.push({
        subcategory_id: subcategoryId,
        api_group_name: apiGroupName,
        option_id: opt.option_id,
        api_option_name: opt.api_option_name,
      })
      continue
    }
    if (!groupRow) continue

    const seed = optionSeed(groupKey, opt.api_option_name, subcategoryName)
    const { created } = await ctx.store.insertOption({
      group_ref: groupRow.id,
      option_id: opt.option_id,
      api_option_name: opt.api_option_name,
      display_label: seed.display_label,
      enabled: false,
      // The default is decided once the whole group exists, in the defaults
      // stage, so the one-default-per-group index can never trip mid-insert.
      is_default: false,
      provider_default: false,
      sort_order: i,
      swatch: seed.swatch as Record<string, unknown> | null,
      geometry: seed.geometry as Record<string, unknown> | null,
      first_seen_at: ctx.seenAt,
      last_seen_at: ctx.seenAt,
      acknowledged_at: null,
      removed_from_api: false,
    })
    if (created) ctx.stats.inserted += 1
    else ctx.stats.updated += 1
  }

  if (ctx.dryRun) {
    for (const o of existing) {
      if (walked.has(o.option_id) || o.removed_from_api) continue
      ctx.diff.removedOptions.push({ subcategory_id: subcategoryId, group_key: groupKey, option_id: o.option_id })
    }
  }
}

// ---------------------------------------------------------------------------
// Stage: defaults (ONE batch request, then per-subcategory bookkeeping)
// ---------------------------------------------------------------------------

interface ProviderDefaults {
  /** Option ids the provider resolved for an empty set, per subcategory. */
  resolved: Map<number, Set<number>>
  /** Subcategories that refused an empty set: their frame styles are required. */
  requiresOptions: Set<number>
}

const REQUIRES_OPTIONS = /options are required/i

async function probeProviderDefaults(ctx: ChunkContext, rows: CatalogSubcategoryRow[]): Promise<ProviderDefaults> {
  const items: ProductCostRequestItem[] = rows.map((r) => ({
    subcategoryId: r.subcategory_id,
    size: {
      width: clamp(PROBE_WIDTH_IN, Number(r.min_width_in), Number(r.max_width_in)),
      height: clamp(PROBE_HEIGHT_IN, Number(r.min_height_in), Number(r.max_height_in)),
    },
    // The ONE deliberate empty set in the whole codebase: its only purpose is to
    // record what the provider would pick so we never have to accept it.
    options: [],
  }))

  const results = items.length ? await ctx.budget.request(() => ctx.client.getProductsCost(items)) : []
  const resolved = new Map<number, Set<number>>()
  const requiresOptions = new Set<number>()

  for (const r of results ?? []) {
    if (r.success) {
      resolved.set(r.subcategoryId, new Set((r.options ?? []).map((o) => o.optionId)))
    } else if (REQUIRES_OPTIONS.test(r.error ?? '')) {
      requiresOptions.add(r.subcategoryId)
    }
  }
  return { resolved, requiresOptions }
}

async function stepDefaults(ctx: ChunkContext, cursor: SyncCursor): Promise<SyncCursor> {
  const subcategoryIds = cursor.subcategoryIds ?? []
  const rows = subcategoryIds
    .map((id) => ctx.subcategories.get(id))
    .filter((r): r is CatalogSubcategoryRow => Boolean(r))

  const defaults = await probeProviderDefaults(ctx, rows)

  // A dry run rehearses the same call and applies none of it.
  if (ctx.dryRun) {
    return { stage: 'finalize', categoryIds: cursor.categoryIds, subcategoryIds }
  }

  let index = cursor.subcategoryIndex ?? 0
  while (index < rows.length) {
    if (index > (cursor.subcategoryIndex ?? 0) && ctx.budget.outOfTime()) {
      return { stage: 'defaults', categoryIds: cursor.categoryIds, subcategoryIds, subcategoryIndex: index }
    }
    await applyDefaultsToSubcategory(ctx, rows[index], defaults)
    index += 1
  }

  return { stage: 'finalize', categoryIds: cursor.categoryIds, subcategoryIds }
}

async function applyDefaultsToSubcategory(
  ctx: ChunkContext,
  row: CatalogSubcategoryRow,
  defaults: ProviderDefaults,
): Promise<void> {
  const categoryId = categoryIdForMedium(row.medium)
  const providerIds = defaults.resolved.get(row.subcategory_id) ?? new Set<number>()
  const refusesEmpty = defaults.requiresOptions.has(row.subcategory_id)
  const groups = await ctx.store.listGroups(row.id)

  for (const group of groups) {
    const options = (await ctx.store.listOptions(group.id)).filter((o) => !o.removed_from_api)

    // `required` is learned from the provider's own refusal, never from an id
    // range: that id arithmetic is exactly what let framed PAPER escape the
    // frame-required check while framed canvas was caught.
    const required = refusesEmpty && group.group_key === 'frame_style'
    if (group.required !== required) await ctx.store.setGroupFlags(group.id, { required })

    for (const option of options) {
      const isProviderDefault = providerIds.has(option.option_id)
      if (option.provider_default !== isProviderDefault) {
        await ctx.store.setOptionFlags(option.id, { provider_default: isProviderDefault })
      }
    }

    // Our default is seeded once. A later sync leaves it alone unless the group
    // has none, or the option carrying it has left the provider catalog: an
    // admin who moved the default keeps it.
    const current = options.find((o) => o.is_default)
    if (current) continue
    const pick = pickSeededDefault(
      group.group_key,
      categoryId,
      row.name,
      options.map((o) => ({ option_id: o.option_id, api_option_name: o.api_option_name })),
      [...providerIds],
    )
    if (pick !== null) await ctx.store.setGroupDefault(group.id, pick)
  }
}

// ---------------------------------------------------------------------------
// Stage: finalize (tombstones, live bootstrap, cache eviction)
// ---------------------------------------------------------------------------

/**
 * The exact configuration the live store sells today, expressed by NAME.
 *
 * It is applied only when this host has no enabled subcategory at all, which is
 * true exactly once: the first run after the tables are created. The result is
 * that flipping the storefront onto the new catalog is behaviour-neutral by
 * construction rather than by inspection. Canvas Finish is deliberately left OFF
 * so the provider keeps resolving the finish exactly as it does today.
 */
const LIVE_BOOTSTRAP: Array<{ subcategory: RegExp; groups: string[]; options: RegExp[] }> = [
  {
    subcategory: /^1\.25in Stretched Canvas$/i,
    groups: ['canvas_border', 'hanging_hardware'],
    options: [/^Mirror Wrap$/i, /^Sawtooth Hanger installed$/i],
  },
  {
    subcategory: /^1\.25in Framed Canvas$/i,
    groups: ['canvas_border', 'hanging_hardware', 'frame_style'],
    options: [/^Mirror Wrap$/i, /^Hanging Wire installed$/i, /^1\.25in Black Floating Frame$/i],
  },
]

async function applyLiveBootstrap(ctx: ChunkContext): Promise<void> {
  const rows = await ctx.store.listSubcategories(ctx.host)
  for (const spec of LIVE_BOOTSTRAP) {
    const row = rows.find((r) => spec.subcategory.test(r.name))
    if (!row) continue
    await ctx.store.setSubcategoryEnabled(row.id, true)
    const groups = await ctx.store.listGroups(row.id)
    for (const group of groups) {
      if (!spec.groups.includes(group.group_key)) continue
      await ctx.store.setGroupFlags(group.id, { enabled: true })
      const options = await ctx.store.listOptions(group.id)
      for (const option of options) {
        if (spec.options.some((re) => re.test(option.api_option_name))) {
          await ctx.store.setOptionFlags(option.id, { enabled: true })
        }
      }
    }
  }
}

async function stepFinalize(ctx: ChunkContext, cursor: SyncCursor): Promise<SyncCursor> {
  if (ctx.dryRun) {
    const walked = new Set(cursor.subcategoryIds ?? [])
    for (const row of ctx.subcategories.values()) {
      if (walked.has(row.subcategory_id) || row.removed_from_api) continue
      ctx.diff.removedSubcategories.push({ subcategory_id: row.subcategory_id, name: row.name })
    }
    return { stage: 'done' }
  }

  // Mass-tombstone guard: a truncated or empty walk (a provider outage answering
  // with an empty index, a category dropped from the listing) must never switch the
  // whole catalog off. Refuse to finalize when this run saw fewer than half the
  // subcategories the host already knows; the run fails loudly and the next run
  // starts over. Half is a floor for a walk that partially failed, not a tolerance
  // for real removals: a genuine catalog change moves a few rows, not dozens.
  const known = (await ctx.store.listSubcategories(ctx.host)).filter((r) => !r.removed_from_api).length
  const walked = new Set(cursor.subcategoryIds ?? []).size
  if (known > 0 && walked * 2 < known) {
    throw new Error(
      `Refusing to tombstone: this run saw ${walked} of ${known} known subcategories on ${ctx.host}`,
    )
  }

  // "Seen in this run" is `last_seen_at >= the run's start`, which is the one
  // predicate that survives a run split across invocations.
  const since = ctx.run.started_at
  const tombstoned =
    (await ctx.store.tombstoneOptionsNotSeen(ctx.host, since)) +
    (await ctx.store.tombstoneGroupsNotSeen(ctx.host, since)) +
    (await ctx.store.tombstoneSubcategoriesNotSeen(ctx.host, since))
  ctx.stats.tombstoned += tombstoned

  if ((await ctx.store.countEnabledSubcategories(ctx.host)) === 0) await applyLiveBootstrap(ctx)

  invalidateCatalogCache()
  return { stage: 'done' }
}

// ---------------------------------------------------------------------------
// The chunk loop
// ---------------------------------------------------------------------------

/** Stages that spend the shared provider rate limit. */
const REQUEST_STAGES = new Set<SyncCursor['stage']>(['categories', 'subcategories', 'options', 'defaults'])

async function runChunk(
  store: CatalogStore,
  client: CatalogProviderClient,
  run: CatalogSyncRunRow,
  options: ChunkOptions,
): Promise<CatalogSyncRunRow> {
  const budget = new ChunkBudget(
    options.budgetMs ?? DEFAULT_BUDGET_MS,
    options.maxRequests ?? DEFAULT_MAX_REQUESTS,
    options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
  )

  const ctx: ChunkContext = {
    store,
    client,
    run,
    host: run.api_host,
    dryRun: run.dry_run,
    budget,
    seenAt: new Date().toISOString(),
    stats: emptyStats(),
    diff: emptyDiff(),
    subcategories: new Map(),
  }

  let cursor: SyncCursor = run.cursor
  try {
    await loadSubcategories(ctx)

    while (cursor.stage !== 'done') {
      if (REQUEST_STAGES.has(cursor.stage) && !budget.canRequest()) break
      if (budget.outOfTime()) break
      switch (cursor.stage) {
        case 'categories':
          cursor = await stepCategories(ctx)
          break
        case 'subcategories':
          cursor = await stepSubcategories(ctx, cursor)
          break
        case 'options':
          cursor = await stepOptions(ctx, cursor)
          break
        case 'defaults':
          cursor = await stepDefaults(ctx, cursor)
          break
        case 'finalize':
          cursor = await stepFinalize(ctx, cursor)
          break
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'catalog sync failed'
    return store.updateRun(run.id, {
      status: 'failed',
      error: message,
      finished_at: new Date().toISOString(),
    })
  }

  ctx.stats.requests += budget.requests
  ctx.stats.chunks += 1

  const done = cursor.stage === 'done'
  return store.updateRun(run.id, {
    cursor,
    stats: addStats(run.stats, ctx.stats),
    ...(run.dry_run ? { diff: mergeDiff(run.diff ?? emptyDiff(), ctx.diff) } : {}),
    ...(done ? { status: 'completed' as const, finished_at: new Date().toISOString() } : {}),
  })
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Open a run and walk the first chunk. Refuses when a run is already in flight
 * for this host: two walks would double-spend the shared rate limit and race
 * each other's merges (the database enforces the same thing with a partial
 * unique index, so the refusal holds across invocations).
 */
export async function startCatalogSync(
  store: CatalogStore,
  client: CatalogProviderClient,
  options: StartSyncOptions & ChunkOptions,
): Promise<CatalogSyncRunRow> {
  const inFlight = await store.findRunningRun(options.host)
  if (inFlight) throw new CatalogSyncBusyError(inFlight.id)
  const run = await store.createRun(newRunRow(options.host, options.dryRun === true))
  return runChunk(store, client, run, options)
}

/** Walk one more chunk of an in-flight run. */
export async function continueCatalogSync(
  store: CatalogStore,
  client: CatalogProviderClient,
  runId: string,
  options: ChunkOptions = {},
): Promise<CatalogSyncRunRow> {
  const run = await store.getRun(runId)
  if (!run) throw new CatalogSyncRefusedError('That sync run does not exist')
  if (run.status !== 'running') {
    // A failed run is a fact to look at, not a thing to resume: its cursor points
    // at a chunk that did not finish, and re-entering it would bury the reason.
    throw new CatalogSyncRefusedError(`This sync run is ${run.status} and cannot be continued`)
  }
  return runChunk(store, client, run, options)
}

/**
 * Start a run and drive it to completion in-process. This is the test and script
 * path; the serverless path is one chunk per invocation, by design.
 */
export async function runCatalogSyncToCompletion(
  store: CatalogStore,
  client: CatalogProviderClient,
  options: StartSyncOptions & ChunkOptions & { maxChunks?: number },
): Promise<CatalogSyncRunRow> {
  const maxChunks = options.maxChunks ?? 200
  let run = await startCatalogSync(store, client, options)
  for (let i = 1; i < maxChunks; i++) {
    if (run.status !== 'running') return run
    run = await continueCatalogSync(store, client, run.id, options)
  }
  return run
}
