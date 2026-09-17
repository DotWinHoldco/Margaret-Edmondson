// Authored by DotWin
// Catalog sync v2 against the committed Phase 0 sandbox snapshot.
//
// The provider client is mocked wholesale and serves that snapshot plus the
// canned empty-options response recorded in PROBES.md (P1 and P15): the three
// framed-canvas depths refuse an empty set, everything else resolves to the
// first member of each group except Canvas Finish, which the provider never
// echoes. This suite is evidence about our merge, never about LumaPrints.
//
// Everything is proved through the CatalogStore interface on real rows. Nothing
// here greps source, and no test asserts a rule by restating it.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

interface FixtureOption {
  optionId: number
  optionName: string
}
interface FixtureGroup {
  optionGroup: string
  optionGroupItems: FixtureOption[]
}
interface FixtureSubcategory {
  subcategoryId: number
  name: string
  minimumWidth: string
  maximumWidth: string
  minimumHeight: string
  maximumHeight: string
  requiredDPI: number
  optionGroups: FixtureGroup[]
}
interface FixtureCategory {
  id: number
  name: string
  subcategories: FixtureSubcategory[]
}
interface Fixture {
  host: string
  categories: FixtureCategory[]
}

// Resolved from the repo root: the fixture is the committed Phase 0 snapshot and
// the same file the coverage report was written against.
const FIXTURE_PATH = path.resolve(
  process.cwd(),
  'fixtures/lumaprints/catalog.us.api-sandbox.lumaprints.com.2026-09-16.json',
)

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture
}

// The mock reads this at call time, so a test can mutate the catalog between runs.
const state = vi.hoisted(() => ({ catalog: null as unknown as Fixture, costCalls: 0, costBatchSizes: [] as number[] }))

function findSubcategory(id: number): { category: FixtureCategory; sub: FixtureSubcategory } | null {
  for (const category of state.catalog.categories) {
    const sub = category.subcategories.find((s) => s.subcategoryId === Number(id))
    if (sub) return { category, sub }
  }
  return null
}

// The provider's typed errors, redeclared inside the factory (a vi.mock factory is
// hoisted, so it cannot close over a top-level class) and re-exported below for the
// tests that throw them.
const errors = vi.hoisted(() => ({
  LumaprintsApiError: class LumaprintsApiError extends Error {
    readonly status: number
    readonly body: string
    constructor(status: number, body: string) {
      super(`Lumaprints API error (${status}): ${body}`)
      this.name = 'LumaprintsApiError'
      this.status = status
      this.body = body
    }
  },
  LumaprintsBudgetError: class LumaprintsBudgetError extends Error {},
  LumaprintsDisabledError: class LumaprintsDisabledError extends Error {},
}))

vi.mock('@/lib/integrations/lumaprints', () => ({
  LumaprintsApiError: errors.LumaprintsApiError,
  LumaprintsBudgetError: errors.LumaprintsBudgetError,
  LumaprintsDisabledError: errors.LumaprintsDisabledError,
  getCategories: async () => state.catalog.categories.map((c) => ({ id: c.id, name: c.name })),
  getSubcategories: async (categoryId: number | string) => {
    const category = state.catalog.categories.find((c) => c.id === Number(categoryId))
    return (category?.subcategories ?? []).map((s) => ({
      subcategoryId: s.subcategoryId,
      name: s.name,
      minimumWidth: s.minimumWidth,
      maximumWidth: s.maximumWidth,
      minimumHeight: s.minimumHeight,
      maximumHeight: s.maximumHeight,
      requiredDPI: s.requiredDPI,
    }))
  },
  getSubcategoryOptions: async (subcategoryId: number | string) =>
    findSubcategory(Number(subcategoryId))?.sub.optionGroups ?? [],
  getProductsCost: async (items: Array<{ subcategoryId: number; size: { width: number; height: number } }>) => {
    state.costCalls += 1
    state.costBatchSizes.push(items.length)
    return items.map((item) => {
      const found = findSubcategory(item.subcategoryId)
      // P1: the three framed-canvas depths are the only rows in the catalog that
      // reject an empty options array.
      if (found?.category.id === 102) {
        return {
          success: false,
          subcategoryId: item.subcategoryId,
          size: item.size,
          error: 'Options are required for framed products (subcategory 102xxx)',
          statusCode: 400,
        }
      }
      // P15: everything else resolves to a default per group, and Canvas Finish
      // is never echoed back.
      const resolved = (found?.sub.optionGroups ?? [])
        .filter((g) => g.optionGroup !== 'Canvas Finish')
        .map((g) => g.optionGroupItems[0])
        .filter(Boolean)
      return {
        success: true,
        subcategoryId: item.subcategoryId,
        size: item.size,
        price: 10,
        options: resolved.map((o) => ({ optionId: o.optionId, optionGroupName: '', optionName: o.optionName, price: 0 })),
      }
    })
  },
}))

import {
  CatalogSyncBusyError,
  CatalogSyncRefusedError,
  DEFAULT_BUDGET_MS,
  DEFAULT_MAX_REQUESTS,
  DEFAULT_MIN_INTERVAL_MS,
  FAILED_RUN_COOLDOWN_MS,
  planCatalogSyncTick,
  reapStaleRuns,
  STALE_RUN_MS,
  WORST_CASE_REQUEST_MS,
  continueCatalogSync,
  liveProviderClient,
  runCatalogSyncToCompletion,
  startCatalogSync,
  type CatalogProviderClient,
} from '@/lib/catalog/sync'
import { createMemoryCatalogStore, type MemoryCatalogStore } from './memory-store'
import type { CatalogOptionRow, CatalogSyncRunRow } from '@/lib/catalog/types'

const HOST = 'us.api-sandbox.lumaprints.com'
// Paced at zero: the pacing itself is not under test here and 59 real gaps would
// be two and a half minutes of sleeping.
const FAST = { minIntervalMs: 0, budgetMs: 600_000 }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  state.catalog = loadFixture()
  state.costCalls = 0
  state.costBatchSizes = []
})

// ---------------------------------------------------------------------------
// Helpers that read the store the way the admin UI eventually will.
// ---------------------------------------------------------------------------

interface Flat {
  subcategory_id: number
  group_key: string
  option: CatalogOptionRow
}

function flatten(store: MemoryCatalogStore): Flat[] {
  const d = store.dump()
  const subById = new Map(d.subcategories.map((s) => [s.id, s]))
  const groupById = new Map(d.groups.map((g) => [g.id, g]))
  return d.options.map((option) => {
    const group = groupById.get(option.group_ref)!
    const sub = subById.get(group.subcategory_ref)!
    return { subcategory_id: sub.subcategory_id, group_key: group.group_key, option }
  })
}

function optionOf(store: MemoryCatalogStore, subcategoryId: number, optionId: number): CatalogOptionRow {
  const hit = flatten(store).find((f) => f.subcategory_id === subcategoryId && f.option.option_id === optionId)
  if (!hit) throw new Error(`no option ${optionId} on subcategory ${subcategoryId}`)
  return hit.option
}

/** Store contents with every surrogate id and timestamp removed, so two independent runs compare. */
function snapshot(store: MemoryCatalogStore) {
  const d = store.dump()
  const subById = new Map(d.subcategories.map((s) => [s.id, s]))
  const groupById = new Map(d.groups.map((g) => [g.id, g]))
  const strip = <T extends Record<string, unknown>>(row: T, keys: string[]) => {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(row).sort()) if (!keys.includes(k)) out[k] = row[k]
    return out
  }
  const volatile = ['id', 'first_seen_at', 'last_seen_at', 'last_synced_at', 'subcategory_ref', 'group_ref']
  const asRecord = (row: unknown) => row as Record<string, unknown>
  const n = (row: Record<string, unknown>, key: string) => Number(row[key])
  const t = (row: Record<string, unknown>, key: string) => String(row[key])

  const subcategories: Record<string, unknown>[] = d.subcategories
    .map((row) => strip(asRecord(row), volatile))
    .sort((a, b) => n(a, 'subcategory_id') - n(b, 'subcategory_id'))

  const groups: Record<string, unknown>[] = d.groups
    .map((g) => ({
      ...strip(asRecord(g), volatile),
      subcategory_id: subById.get(g.subcategory_ref)!.subcategory_id,
    }))
    .sort((a, b) => n(a, 'subcategory_id') - n(b, 'subcategory_id') || t(a, 'group_key').localeCompare(t(b, 'group_key')))

  const options: Record<string, unknown>[] = d.options
    .map((o) => {
      const group = groupById.get(o.group_ref)!
      return {
        ...strip(asRecord(o), volatile),
        subcategory_id: subById.get(group.subcategory_ref)!.subcategory_id,
        group_key: group.group_key,
      }
    })
    .sort(
      (a, b) =>
        n(a, 'subcategory_id') - n(b, 'subcategory_id') ||
        t(a, 'group_key').localeCompare(t(b, 'group_key')) ||
        n(a, 'option_id') - n(b, 'option_id'),
    )

  return { subcategories, groups, options }
}

// ---------------------------------------------------------------------------

describe('catalog sync v2 — full run on the sandbox snapshot', () => {
  let store: MemoryCatalogStore

  beforeEach(async () => {
    store = createMemoryCatalogStore()
    const run = await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
    expect(run.status).toBe('completed')
  })

  it('writes every subcategory, group and option in the snapshot', () => {
    const d = store.dump()
    expect(d.subcategories).toHaveLength(50)
    expect(d.groups).toHaveLength(218)
    expect(d.options).toHaveLength(1223)
    expect(d.subcategories.every((s) => s.api_host === HOST)).toBe(true)
    expect(d.subcategories.every((s) => s.removed_from_api === false)).toBe(true)
  })

  it('files every subcategory under one of the eight families', () => {
    const byMedium = new Map<string, number>()
    for (const s of store.dump().subcategories) byMedium.set(s.medium, (byMedium.get(s.medium) ?? 0) + 1)
    expect(Object.fromEntries([...byMedium].sort())).toEqual({
      canvas: 3,
      foam_mounted_fine_art_paper: 8,
      fine_art_paper: 7,
      framed_canvas: 3,
      framed_fine_art_paper: 25,
      metal: 2,
      peel_and_stick: 1,
      rolled_canvas: 1,
    })
  })

  it('leaves exactly one default per group', () => {
    const d = store.dump()
    for (const group of d.groups) {
      const defaults = d.options.filter((o) => o.group_ref === group.id && o.is_default)
      expect(`${group.group_key}:${defaults.length}`).toBe(`${group.group_key}:1`)
    }
  })

  it('seeds our geometry-neutral defaults, not the provider ones', () => {
    expect(optionOf(store, 101002, 2).is_default).toBe(true) // Mirror Wrap
    expect(optionOf(store, 101002, 1).is_default).toBe(false) // Image Wrap: what [] would resolve to
    expect(optionOf(store, 101002, 1).provider_default).toBe(true)
    expect(optionOf(store, 103001, 39).is_default).toBe(true) // No Bleed
    expect(optionOf(store, 103001, 36).provider_default).toBe(true) // 0.25in bleed
    expect(optionOf(store, 103001, 36).is_default).toBe(false)
    expect(optionOf(store, 105005, 64).is_default).toBe(true) // No Mat
    expect(optionOf(store, 105005, 96).is_default).toBe(true) // Mat Color: White
    expect(optionOf(store, 105005, 146).is_default).toBe(true) // Acrylic Glass
    expect(optionOf(store, 105005, 148).is_default).toBe(true) // Dry Mounted to Foam Core
    expect(optionOf(store, 105005, 94).is_default).toBe(true) // No Backing
    expect(optionOf(store, 105005, 83).is_default).toBe(true) // Wire on frame
    expect(optionOf(store, 106001, 31).is_default).toBe(true) // Inset Frame
    expect(optionOf(store, 101005, 19).is_default).toBe(true) // 2in rolled border
    expect(optionOf(store, 102002, 27).is_default).toBe(true) // 1.25in Black Floating Frame
    expect(optionOf(store, 102001, 12).is_default).toBe(true) // 0.75in Black Floating Frame
    expect(optionOf(store, 102003, 23).is_default).toBe(true) // 1.50in Black Floating Frame
    expect(optionOf(store, 101003, 9).is_default).toBe(true) // No Canvas Underlayer
  })

  it('marks required exactly on the three framed-canvas frame style groups', () => {
    const d = store.dump()
    const subById = new Map(d.subcategories.map((s) => [s.id, s]))
    const required = d.groups
      .filter((g) => g.required)
      .map((g) => `${subById.get(g.subcategory_ref)!.subcategory_id}:${g.group_key}`)
      .sort()
    expect(required).toEqual(['102001:frame_style', '102002:frame_style', '102003:frame_style'])
  })

  it('prices framed fine art paper as a whole configuration and everything else additively', () => {
    const d = store.dump()
    const wholeConfig = d.subcategories.filter((s) => s.pricing_mode === 'whole_config').map((s) => s.subcategory_id)
    expect(wholeConfig).toHaveLength(25)
    expect(wholeConfig.every((id) => String(id).startsWith('105'))).toBe(true)
  })

  it('carries the physical-product caveats the customer has to read first', () => {
    const d = store.dump()
    const metal = d.subcategories.find((s) => s.subcategory_id === 106001)!
    const foam = d.subcategories.find((s) => s.subcategory_id === 108001)!
    const canvas = d.subcategories.find((s) => s.subcategory_id === 101002)!
    expect(metal.customer_note).toMatch(/trimmed during sublimation/i)
    expect(foam.customer_note).toMatch(/best framed to stay flat/i)
    expect(canvas.customer_note).toBeNull()
  })

  it('links Mat Color to Mat Size and hides it on No Mat', () => {
    const d = store.dump()
    const sub = d.subcategories.find((s) => s.subcategory_id === 105005)!
    const matColor = d.groups.find((g) => g.subcategory_ref === sub.id && g.group_key === 'mat_color')!
    expect(matColor.depends_on_group).toBe('mat_size')
    expect(matColor.depends_hidden_when).toEqual([64])
    expect(matColor.display_kind).toBe('swatch')
    const matSize = d.groups.find((g) => g.subcategory_ref === sub.id && g.group_key === 'mat_size')!
    expect(matSize.depends_on_group).toBeNull()
  })

  it('seeds the geometry that the provider does not enforce', () => {
    expect(optionOf(store, 101002, 1).geometry).toEqual({ requires_file_bleed_in: 3.75 }) // Image Wrap
    expect(optionOf(store, 101002, 2).geometry).toBeNull() // Mirror Wrap is neutral
    expect(optionOf(store, 101002, 3).geometry).toEqual({ needs_hex: true }) // Solid Color
    expect(optionOf(store, 103001, 36).geometry).toEqual({ requires_file_bleed_in: 0.25 })
    expect(optionOf(store, 103001, 37).geometry).toEqual({ requires_file_bleed_in: 0.5 })
    expect(optionOf(store, 103001, 38).geometry).toEqual({ requires_file_bleed_in: 1 })
    expect(optionOf(store, 103001, 39).geometry).toBeNull() // No Bleed
    expect(optionOf(store, 105005, 64).geometry).toBeNull() // No Mat
    expect(optionOf(store, 105005, 65).geometry).toEqual({ per_side_in: 1 })
    expect(optionOf(store, 105005, 73).geometry).toEqual({ per_side_in: 5 })
    expect(optionOf(store, 106001, 32).geometry).toEqual({
      size_whitelist: [
        [8, 10],
        [8, 12],
        [11, 14],
        [11, 17],
        [12, 12],
        [12, 16],
        [16, 24],
      ],
    })
    for (const id of [19, 20, 21, 22]) {
      expect(optionOf(store, 101005, id).geometry?.probe_owed).toMatch(/V3 geometry probe/)
    }
    // Rolled Canvas carries two groups whose provider names both canonicalise to
    // `canvas_border` (see the contract-defect test in seed-rules.test.ts), so the
    // second is filed under its slug rather than dropped.
    const rolled = store.dump().subcategories.find((s) => s.subcategory_id === 101005)!
    expect(
      store
        .dump()
        .groups.filter((g) => g.subcategory_ref === rolled.id)
        .map((g) => g.group_key)
        .sort(),
    ).toEqual(['canvas_border', 'canvas_finish', 'rolled_border_size'])
    expect(optionOf(store, 102002, 27).geometry).toEqual({ shipping_class: true })
    expect(optionOf(store, 105005, 146).geometry).toEqual({ shipping_class: true }) // Acrylic Glass
  })

  it('seeds preview swatches on frames and mats', () => {
    expect(optionOf(store, 102002, 27).swatch).toEqual({ color_hex: '#1a1a1a', frame_face_in: 1.25 })
    expect(optionOf(store, 102002, 120).swatch).toEqual({ color_hex: '#5b3a29', frame_face_in: 1.25 }) // Walnut
    expect(optionOf(store, 102001, 215).swatch?.color_hex).toBe('#e8e4dc') // Driftwood White beats plain White
    expect(optionOf(store, 105005, 96).swatch).toEqual({ color_hex: '#ffffff' }) // mat White
    expect(optionOf(store, 105005, 97).swatch).toEqual({ color_hex: '#f8f8f8' }) // White with Black Core
    expect(optionOf(store, 105005, 104).swatch).toEqual({ color_hex: '#f5f2ea' }) // Off White
  })

  it('enables exactly the configuration the live store sells today, and nothing else', () => {
    const d = store.dump()
    const enabledSubs = d.subcategories.filter((s) => s.enabled).map((s) => s.subcategory_id).sort()
    expect(enabledSubs).toEqual([101002, 102002, 103001, 105005, 108001])

    const subById = new Map(d.subcategories.map((s) => [s.id, s]))
    const enabledGroups = d.groups
      .filter((g) => g.enabled)
      .map((g) => `${subById.get(g.subcategory_ref)!.subcategory_id}:${g.group_key}`)
      .sort()
    expect(enabledGroups).toEqual([
      '101002:canvas_border',
      '101002:hanging_hardware',
      '102002:canvas_border',
      '102002:frame_style',
      '102002:hanging_hardware',
      '103001:bleed_size',
      '105005:backing',
      '105005:glazing',
      '105005:hanging_hardware',
      '105005:mat_color',
      '105005:mat_size',
      '105005:paper_type',
      '105005:print_mounting',
      '108001:bleed_size',
    ])

    const enabled = flatten(store)
      .filter((f) => f.option.enabled)
      .map((f) => `${f.subcategory_id}:${f.option.option_id}`)
      .sort()
    expect(enabled).toEqual(
      ['101002:11', '101002:2', '102002:2', '102002:27', '102002:28', '103001:39', '105005:146', '105005:148', '105005:64', '105005:74', '105005:83', '105005:94', '105005:96', '108001:39'].sort(),
    )
  })

  it('arrives with everything else off and unacknowledged', () => {
    const d = store.dump()
    const offSubs = d.subcategories.filter((s) => !s.enabled)
    expect(offSubs).toHaveLength(45)
    expect(d.subcategories.every((s) => s.acknowledged_at === null)).toBe(true)
    expect(d.options.filter((o) => o.enabled)).toHaveLength(14)
  })

  it('spends one provider request per category, per subcategory, plus two', () => {
    const run = store.dump().runs[0]
    // 1 category list + 7 subcategory lists + 50 option lists + 1 defaults probe.
    expect(run.stats.requests).toBe(59)
    expect(run.stats.subcategories).toBe(50)
    expect(run.stats.groups).toBe(218)
    expect(run.stats.options).toBe(1223)
    expect(state.costCalls).toBe(1)
  })
})

describe('catalog sync v2 — merge, never reset', () => {
  let store: MemoryCatalogStore

  beforeEach(async () => {
    store = createMemoryCatalogStore()
    await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
  })

  it('inserts new rows disabled, tombstones vanished ones, updates bounds, and never touches admin fields', async () => {
    // An admin configures the catalog between the two runs.
    const before = store.dump()
    const canvas = before.subcategories.find((s) => s.subcategory_id === 101002)!
    const borderGroup = before.groups.find(
      (g) => g.subcategory_ref === canvas.id && g.group_key === 'canvas_border',
    )!
    const mirror = before.options.find((o) => o.group_ref === borderGroup.id && o.option_id === 2)!
    store.patchSubcategory(canvas.id, { display_label: 'Gallery Canvas', customer_note: 'Ships in 5 days.' })
    store.patchGroup(borderGroup.id, { display_label: 'Edge finish', sort_order: 42 })
    store.patchOption(mirror.id, {
      display_label: 'Mirrored edge',
      sort_order: 7,
      swatch: { color_hex: '#123456' },
      enabled: true,
    })

    // The provider catalog moves under us.
    const cat101 = state.catalog.categories.find((c) => c.id === 101)!
    const sub101002 = cat101.subcategories.find((s) => s.subcategoryId === 101002)!
    sub101002.maximumWidth = '120.00'
    const border = sub101002.optionGroups.find((g) => g.optionGroup === 'Canvas Border')!
    border.optionGroupItems.push({ optionId: 999, optionName: 'Gallery Wrap' })
    const finish = sub101002.optionGroups.find((g) => g.optionGroup === 'Canvas Finish')!
    const removedOptionId = finish.optionGroupItems[0].optionId
    finish.optionGroupItems = []
    const matGroup = state.catalog.categories
      .find((c) => c.id === 105)!
      .subcategories.find((s) => s.subcategoryId === 105005)!
      .optionGroups.find((g) => g.optionGroup === 'Mat Size')!
    matGroup.optionGroup = 'Mat Size (inches)'

    await sleep(5) // a second run has to start strictly after the first one wrote
    const run = await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
    expect(run.status).toBe('completed')

    // New option: present, disabled, unacknowledged.
    const added = optionOf(store, 101002, 999)
    expect(added.enabled).toBe(false)
    expect(added.acknowledged_at).toBeNull()
    expect(added.removed_from_api).toBe(false)

    // Removed option: tombstoned and switched off, still a row.
    const gone = optionOf(store, 101002, removedOptionId)
    expect(gone.removed_from_api).toBe(true)
    expect(gone.enabled).toBe(false)

    // Changed bound: updated.
    const updatedSub = store.dump().subcategories.find((s) => s.subcategory_id === 101002)!
    expect(Number(updatedSub.max_width_in)).toBe(120)

    // Renamed group: same row, new provider name, canonical key unchanged.
    const renamed = store
      .dump()
      .groups.find((g) => g.group_key === 'mat_size' && g.api_group_name === 'Mat Size (inches)')
    expect(renamed).toBeTruthy()
    expect(store.dump().groups.filter((g) => g.group_key === 'mat_size')).toHaveLength(25)

    // Admin fields: untouched.
    expect(updatedSub.display_label).toBe('Gallery Canvas')
    expect(updatedSub.customer_note).toBe('Ships in 5 days.')
    const afterGroup = store.dump().groups.find((g) => g.id === borderGroup.id)!
    expect(afterGroup.display_label).toBe('Edge finish')
    expect(afterGroup.sort_order).toBe(42)
    const afterMirror = store.dump().options.find((o) => o.id === mirror.id)!
    expect(afterMirror.display_label).toBe('Mirrored edge')
    expect(afterMirror.sort_order).toBe(7)
    expect(afterMirror.swatch).toEqual({ color_hex: '#123456' })
    expect(afterMirror.enabled).toBe(true)
    expect(afterMirror.is_default).toBe(true)
  })

  it('does not re-run the live bootstrap once a host is configured', async () => {
    const canvas = store.dump().subcategories.find((s) => s.subcategory_id === 101002)!
    store.patchSubcategory(canvas.id, { enabled: false })
    const framed = store.dump().subcategories.find((s) => s.subcategory_id === 102002)!
    await sleep(5)
    await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
    // 102002 is still enabled, so the host is configured and canvas stays off.
    expect(store.dump().subcategories.find((s) => s.id === framed.id)!.enabled).toBe(true)
    expect(store.dump().subcategories.find((s) => s.id === canvas.id)!.enabled).toBe(false)
  })
})

describe('catalog sync v2 — mass-tombstone guard', () => {
  let store: MemoryCatalogStore

  beforeEach(async () => {
    store = createMemoryCatalogStore()
    await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
  })

  it('fails the run instead of tombstoning the catalog when the provider index comes back empty', async () => {
    const before = store.dump()
    expect(before.subcategories.filter((s) => s.removed_from_api)).toHaveLength(0)

    state.catalog.categories = []
    const run = await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
    expect(run.status).toBe('failed')
    expect(run.error).toBe('refused_tombstone')

    const after = store.dump()
    expect(after.subcategories.filter((s) => s.removed_from_api)).toHaveLength(0)
    expect(after.groups.filter((g) => g.removed_from_api)).toHaveLength(0)
    expect(after.options.filter((o) => o.removed_from_api)).toHaveLength(0)
    // The live bootstrap set is untouched by the failed run.
    expect(after.subcategories.filter((s) => s.enabled).map((s) => s.subcategory_id).sort()).toEqual([101002, 102002, 103001, 105005, 108001])
  })

  it('still tombstones a handful of genuine removals (under the half-catalog floor)', async () => {
    const cat103 = state.catalog.categories.find((c) => c.id === 103)!
    cat103.subcategories = cat103.subcategories.filter((s) => s.subcategoryId !== 103009)
    const run = await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
    expect(run.status).toBe('completed')
    const gone = store.dump().subcategories.find((s) => s.subcategory_id === 103009)!
    expect(gone.removed_from_api).toBe(true)
    expect(gone.enabled).toBe(false)
  })
})

describe('catalog sync v2 — transient provider conditions', () => {
  function throttledClient(failTimes: number): CatalogProviderClient & { calls: number } {
    let failures = 0
    const client = {
      calls: 0,
      getCategories: async () => {
        client.calls += 1
        if (failures < failTimes) {
          failures += 1
          throw new errors.LumaprintsApiError(429, '{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}')
        }
        return liveProviderClient.getCategories()
      },
      getSubcategories: (id: number) => liveProviderClient.getSubcategories(id),
      getSubcategoryOptions: (id: number) => liveProviderClient.getSubcategoryOptions(id),
      getProductsCost: (items: Parameters<CatalogProviderClient['getProductsCost']>[0]) => liveProviderClient.getProductsCost(items),
    }
    return client
  }

  it('pauses on a 429 with the cursor untouched, then finishes on the next chunk', async () => {
    const store = createMemoryCatalogStore()
    const client = throttledClient(1)
    const paused = await startCatalogSync(store, client, { host: HOST, ...FAST })
    expect(paused.status).toBe('running')
    expect(paused.error).toBeNull()
    expect(paused.stats.transientFailures).toBe(1)
    expect(paused.cursor).toEqual({ stage: 'categories' })
    expect((paused as { transient?: boolean }).transient).toBe(true)

    const resumed = await continueCatalogSync(store, client, paused.id, FAST)
    expect(resumed.status).toBe('running')
    expect(resumed.cursor.stage).not.toBe('categories')
    expect(resumed.stats.transientFailures).toBe(0)
  })

  it('keeps the progress a chunk committed before the throttle hit', async () => {
    // Categories and the first subcategory lists succeed, then the provider throttles the
    // options lookups: the saved cursor must point at the options stage, not back at the start.
    const store = createMemoryCatalogStore()
    let optionCalls = 0
    const client: CatalogProviderClient = {
      getCategories: () => liveProviderClient.getCategories(),
      getSubcategories: (id: number) => liveProviderClient.getSubcategories(id),
      getSubcategoryOptions: async (id: number) => {
        optionCalls += 1
        if (optionCalls <= 2) {
          throw new errors.LumaprintsApiError(429, '{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}')
        }
        return liveProviderClient.getSubcategoryOptions(id)
      },
      getProductsCost: (items: Parameters<CatalogProviderClient['getProductsCost']>[0]) => liveProviderClient.getProductsCost(items),
    }
    const paused = await startCatalogSync(store, client, { host: HOST, ...FAST, maxRequests: 12 })
    expect(paused.status).toBe('running')
    expect(paused.stats.transientFailures).toBe(1)
    expect(paused.cursor.stage).toBe('options')
    expect(paused.cursor.subcategoryIndex ?? 0).toBe(0)
    expect(paused.stats.requests).toBe(9)
    expect(store.dump().subcategories).toHaveLength(50)

    // The second options lookup is throttled too: a second consecutive transient, same cursor.
    const resumed = await continueCatalogSync(store, client, paused.id, { ...FAST, maxRequests: 12 })
    expect(resumed.status).toBe('running')
    expect(resumed.stats.transientFailures).toBe(2)
    expect(resumed.cursor.stage).toBe('options')
    expect(resumed.cursor.subcategoryIndex ?? 0).toBe(0)

    const going = await continueCatalogSync(store, client, paused.id, { ...FAST, maxRequests: 12 })
    expect(going.stats.transientFailures).toBe(0)
    expect((going.cursor.subcategoryIndex ?? 0) > 0).toBe(true)
  })

  it('fails the run only after five consecutive transient chunks, never on a 400', async () => {
    const store = createMemoryCatalogStore()
    const client = throttledClient(99)
    let run = await startCatalogSync(store, client, { host: HOST, ...FAST })
    for (let i = 0; i < 3; i++) {
      run = await continueCatalogSync(store, client, run.id, FAST)
      expect(run.status).toBe('running')
    }
    run = await continueCatalogSync(store, client, run.id, FAST)
    expect(run.status).toBe('failed')
    expect(run.error).toBe('provider_error:429')
    expect(run.stats.transientFailures).toBe(4)

    const bad: CatalogProviderClient = {
      getCategories: async () => {
        throw new errors.LumaprintsApiError(400, 'bad request')
      },
      getSubcategories: async () => [],
      getSubcategoryOptions: async () => [],
      getProductsCost: async () => [],
    }
    const immediate = await startCatalogSync(createMemoryCatalogStore(), bad, { host: HOST, ...FAST })
    expect(immediate.status).toBe('failed')
    expect(immediate.error).toBe('provider_error:400')
  })
})

describe('catalog sync v2 — provider batch limits', () => {
  it('splits the defaults probe at the provider maximum of 50 items per pricing call', async () => {
    // Production has 51 subcategories; the sandbox fixture has exactly 50, which is why a
    // single-batch probe passed every test and then 400ed on the first production run.
    const cat107 = state.catalog.categories.find((c) => c.id === 107)!
    cat107.subcategories.push({ ...cat107.subcategories[0], subcategoryId: 107002, name: 'Peel and Stick Art Print (second)' })
    const store = createMemoryCatalogStore()
    const run = await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
    expect(run.status).toBe('completed')
    expect(state.costBatchSizes).toEqual([50, 1])
    // 1 category list + 7 subcategory lists + 51 option lists + 2 defaults batches.
    expect(run.stats.requests).toBe(61)
    expect(run.stats.subcategories).toBe(51)
  })
})

describe('catalog sync v2 — chunked and resumable', () => {
  it('reaches the same catalog whether it runs in one chunk or many', async () => {
    const oneShot = createMemoryCatalogStore()
    const oneShotRun = await runCatalogSyncToCompletion(oneShot, liveProviderClient, {
      host: HOST,
      ...FAST,
      maxRequests: 1000,
    })
    expect(oneShotRun.stats.chunks).toBe(1)

    const chunked = createMemoryCatalogStore()
    const started = await startCatalogSync(chunked, liveProviderClient, { host: HOST, ...FAST, maxRequests: 7 })
    expect(started.status).toBe('running')
    expect(started.cursor.stage).not.toBe('done')

    let run = started
    let chunks = 1
    while (run.status === 'running' && chunks < 50) {
      run = await continueCatalogSync(chunked, liveProviderClient, run.id, { ...FAST, maxRequests: 7 })
      chunks += 1
    }
    expect(run.status).toBe('completed')
    expect(run.stats.chunks).toBeGreaterThan(1)
    expect(snapshot(chunked)).toEqual(snapshot(oneShot))
  })

  it('needs a known number of chunks at the default request ceiling', async () => {
    const store = createMemoryCatalogStore()
    // Only the pace is relaxed; the per-chunk ceiling is the production default.
    const run = await runCatalogSyncToCompletion(store, liveProviderClient, {
      host: HOST,
      minIntervalMs: 0,
      budgetMs: 600_000,
    })
    expect(run.status).toBe('completed')
    expect(run.stats.requests).toBe(59)
    // Pinned, not bounded: the cron window is sized from this number. 59 requests at
    // eight per invocation is eight chunks, the last of which also finalizes. At one
    // tick every five minutes that is forty minutes inside a two hour window.
    expect(run.stats.chunks).toBe(8)
  })
})

describe('catalog sync v2 — dry run', () => {
  it('writes nothing and reports what a real run would change', async () => {
    const empty = createMemoryCatalogStore()
    const run = await runCatalogSyncToCompletion(empty, liveProviderClient, { host: HOST, dryRun: true, ...FAST })
    expect(run.status).toBe('completed')
    expect(empty.dump().subcategories).toHaveLength(0)
    expect(empty.dump().groups).toHaveLength(0)
    expect(empty.dump().options).toHaveLength(0)
    expect(run.diff!.newSubcategories).toHaveLength(50)
    expect(run.diff!.newGroups).toHaveLength(218)
    expect(run.diff!.newOptions).toHaveLength(1223)
    expect(run.diff!.removedSubcategories).toHaveLength(0)
  })

  it('reports exactly the provider changes against a populated catalog', async () => {
    const store = createMemoryCatalogStore()
    await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
    const before = snapshot(store)

    const sub101002 = state.catalog.categories
      .find((c) => c.id === 101)!
      .subcategories.find((s) => s.subcategoryId === 101002)!
    sub101002.maximumHeight = '60.00'
    const border = sub101002.optionGroups.find((g) => g.optionGroup === 'Canvas Border')!
    border.optionGroupItems.push({ optionId: 777, optionName: 'Gallery Wrap' })
    const finish = sub101002.optionGroups.find((g) => g.optionGroup === 'Canvas Finish')!
    const droppedId = finish.optionGroupItems[0].optionId
    finish.optionGroupItems = []
    state.catalog.categories.find((c) => c.id === 107)!.subcategories = []

    await sleep(5)
    const run = await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, dryRun: true, ...FAST })

    expect(snapshot(store)).toEqual(before) // not one row changed
    expect(run.diff!.newOptions.map((o) => o.option_id)).toEqual([777])
    expect(run.diff!.removedOptions).toEqual([
      { subcategory_id: 101002, group_key: 'canvas_finish', option_id: droppedId },
    ])
    expect(run.diff!.removedSubcategories).toEqual([{ subcategory_id: 107001, name: 'Peel and Stick Art Print' }])
    expect(run.diff!.changedBounds).toEqual([
      { subcategory_id: 101002, field: 'max_height_in', from: 52, to: 60 },
    ])
    expect(run.diff!.newSubcategories).toHaveLength(0)
  })
})

describe('catalog sync v2 — one run at a time', () => {
  it('refuses a second start while a run is in flight', async () => {
    const store = createMemoryCatalogStore()
    await startCatalogSync(store, liveProviderClient, { host: HOST, ...FAST, maxRequests: 2 })
    await expect(
      startCatalogSync(store, liveProviderClient, { host: HOST, ...FAST, maxRequests: 2 }),
    ).rejects.toBeInstanceOf(CatalogSyncBusyError)
  })

  it('marks a run failed and refuses to continue it', async () => {
    const store = createMemoryCatalogStore()
    const broken: CatalogProviderClient = {
      getCategories: async () => {
        throw new Error('provider is down')
      },
      getSubcategories: async () => [],
      getSubcategoryOptions: async () => [],
      getProductsCost: async () => [],
    }
    const run = await startCatalogSync(store, broken, { host: HOST, ...FAST })
    expect(run.status).toBe('failed')
    expect(run.error).toBe('internal')
    await expect(continueCatalogSync(store, broken, run.id, FAST)).rejects.toBeInstanceOf(CatalogSyncRefusedError)
    // A failed run is terminal, so the next start is allowed.
    const next = await startCatalogSync(store, liveProviderClient, { host: HOST, ...FAST, maxRequests: 2 })
    expect(next.status).toBe('running')
  })

  it('refuses to continue a run that does not exist', async () => {
    const store = createMemoryCatalogStore()
    await expect(continueCatalogSync(store, liveProviderClient, 'not-a-run', FAST)).rejects.toBeInstanceOf(
      CatalogSyncRefusedError,
    )
  })
})

// ---------------------------------------------------------------------------

describe('catalog sync v2 — provider budget headroom', () => {
  it('paces itself to a third of the key-wide limit and caps a chunk at eight calls', () => {
    // The provider publishes 40 requests/minute for the whole key and the storefront
    // quotes on it. These two numbers are the promise that a night-time walk leaves
    // the customer path most of that budget.
    expect(DEFAULT_MIN_INTERVAL_MS).toBe(5000)
    expect(60_000 / DEFAULT_MIN_INTERVAL_MS).toBe(12)
    expect(DEFAULT_MAX_REQUESTS).toBe(8)
    // Eight calls at a five second pace fit the budget with the worst case to spare.
    expect((DEFAULT_MAX_REQUESTS - 1) * DEFAULT_MIN_INTERVAL_MS + WORST_CASE_REQUEST_MS).toBeLessThanOrEqual(
      DEFAULT_BUDGET_MS,
    )
  })

  it('never makes more than eight provider calls in one chunk', async () => {
    const store = createMemoryCatalogStore()
    const calls: string[] = []
    const counting: CatalogProviderClient = {
      getCategories: async () => {
        calls.push('categories')
        return liveProviderClient.getCategories()
      },
      getSubcategories: async (id) => {
        calls.push(`subcategories:${id}`)
        return liveProviderClient.getSubcategories(id)
      },
      getSubcategoryOptions: async (id) => {
        calls.push(`options:${id}`)
        return liveProviderClient.getSubcategoryOptions(id)
      },
      getProductsCost: async (items) => {
        calls.push('cost')
        return liveProviderClient.getProductsCost(items)
      },
    }
    // Only the pace is relaxed; the request ceiling is the default under test.
    const run = await startCatalogSync(store, counting, { host: HOST, minIntervalMs: 0 })
    expect(calls).toHaveLength(DEFAULT_MAX_REQUESTS)
    expect(run.stats.requests).toBe(DEFAULT_MAX_REQUESTS)
    expect(run.status).toBe('running')
  })

  it('stops before a call that could outlive the invocation', async () => {
    const store = createMemoryCatalogStore()
    // A budget shorter than one worst-case response leaves no safe room to start.
    const run = await startCatalogSync(store, liveProviderClient, {
      host: HOST,
      minIntervalMs: 0,
      budgetMs: WORST_CASE_REQUEST_MS - 1_000,
    })
    expect(run.stats.requests).toBe(0)
    expect(run.status).toBe('running')
    expect(run.cursor.stage).toBe('categories')
  })
})

describe('catalog sync v2 — a tombstone is not a toggle', () => {
  let store: MemoryCatalogStore

  beforeEach(async () => {
    store = createMemoryCatalogStore()
    await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
  })

  const paperBleed = () => {
    const d = store.dump()
    const sub = d.subcategories.find((x) => x.subcategory_id === 103001)!
    const group = d.groups.find((g) => g.subcategory_ref === sub.id && g.group_key === 'bleed_size')!
    return { sub, group, option: d.options.find((o) => o.group_ref === group.id && o.option_id === 39)! }
  }

  it('keeps the admin answer when the provider drops a row, and when it comes back', async () => {
    const { option } = paperBleed()
    store.patchOption(option.id, { enabled: true })
    store.patchGroup(paperBleed().group.id, { enabled: true })

    // The provider drops No Bleed from the paper bleed group.
    const bleedGroup = state.catalog.categories
      .find((c) => c.id === 103)!
      .subcategories.find((x) => x.subcategoryId === 103001)!
      .optionGroups.find((g) => g.optionGroup === 'Bleed Size')!
    const removed = bleedGroup.optionGroupItems.find((o) => o.optionId === 39)!
    bleedGroup.optionGroupItems = bleedGroup.optionGroupItems.filter((o) => o.optionId !== 39)

    await sleep(5)
    expect((await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })).status).toBe(
      'completed',
    )

    const tombstoned = store.dump().options.find((o) => o.id === option.id)!
    expect(tombstoned.removed_from_api).toBe(true)
    expect(tombstoned.enabled).toBe(true) // the admin said yes; a provider hiccup does not answer for them
    expect(tombstoned.is_default).toBe(true)

    // The provider lists it again.
    bleedGroup.optionGroupItems.push(removed)
    await sleep(5)
    expect((await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })).status).toBe(
      'completed',
    )

    const restored = store.dump().options.find((o) => o.id === option.id)!
    expect(restored.removed_from_api).toBe(false)
    expect(restored.enabled).toBe(true)
    expect(restored.is_default).toBe(true)
  })

  it('leaves enabled alone on a group and a subcategory too', async () => {
    const cat103 = state.catalog.categories.find((c) => c.id === 103)!
    const dropped = cat103.subcategories.find((x) => x.subcategoryId === 103009)!
    const row = store.dump().subcategories.find((x) => x.subcategory_id === 103009)!
    store.patchSubcategory(row.id, { enabled: true })
    const group = store.dump().groups.find((g) => g.subcategory_ref === row.id)!
    store.patchGroup(group.id, { enabled: true })
    cat103.subcategories = cat103.subcategories.filter((x) => x.subcategoryId !== dropped.subcategoryId)

    await sleep(5)
    await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })

    const after = store.dump().subcategories.find((x) => x.id === row.id)!
    expect(after.removed_from_api).toBe(true)
    expect(after.enabled).toBe(true)
    expect(store.dump().groups.find((g) => g.id === group.id)!.enabled).toBe(true)
    expect(store.dump().groups.find((g) => g.id === group.id)!.removed_from_api).toBe(true)
  })
})

describe('catalog sync v2 — the live bootstrap is a one shot', () => {
  it('seeds today only on the first completed walk, never again', async () => {
    const store = createMemoryCatalogStore()
    await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
    expect(store.dump().options.filter((o) => o.enabled)).toHaveLength(14)

    // An admin takes the whole catalog off sale.
    for (const row of store.dump().subcategories) store.patchSubcategory(row.id, { enabled: false })
    for (const row of store.dump().options) store.patchOption(row.id, { enabled: false })

    await sleep(5)
    expect((await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })).status).toBe(
      'completed',
    )

    // Nothing is put back on sale behind their back.
    expect(store.dump().subcategories.filter((s) => s.enabled)).toHaveLength(0)
    expect(store.dump().options.filter((o) => o.enabled)).toHaveLength(0)
  })

  it('does not count a dry run as the first walk', async () => {
    const store = createMemoryCatalogStore()
    await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, dryRun: true, ...FAST })
    await sleep(5)
    await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
    expect(store.dump().options.filter((o) => o.enabled)).toHaveLength(14)
  })

  it('never switches on a row the provider no longer lists', async () => {
    const store = createMemoryCatalogStore()
    // The provider drops the framed depth the live store sells today.
    const cat102 = state.catalog.categories.find((c) => c.id === 102)!
    cat102.subcategories = cat102.subcategories.filter((x) => x.subcategoryId !== 102002)
    await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST })
    const enabled = store.dump().subcategories.filter((x) => x.enabled).map((x) => x.subcategory_id).sort()
    expect(enabled).toEqual([101002, 103001, 105005, 108001])
  })
})

describe('catalog sync v2 — stale runs and failure backoff', () => {
  const runRow = (over: Partial<CatalogSyncRunRow>): CatalogSyncRunRow =>
    ({
      id: 'run',
      api_host: HOST,
      status: 'completed',
      dry_run: false,
      cursor: { stage: 'done' },
      stats: { requests: 0, categories: 0, subcategories: 0, groups: 0, options: 0, inserted: 0, updated: 0, tombstoned: 0, chunks: 0 },
      diff: null,
      error: null,
      started_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      finished_at: new Date(0).toISOString(),
      ...over,
    }) as CatalogSyncRunRow

  it('fails a run whose heartbeat stopped, so one killed invocation cannot wedge the host', async () => {
    const store = createMemoryCatalogStore()
    const started = await startCatalogSync(store, liveProviderClient, { host: HOST, ...FAST, maxRequests: 1 })
    expect(started.status).toBe('running')

    const later = Date.parse(started.updated_at) + STALE_RUN_MS + 1_000
    expect(await reapStaleRuns(store, HOST, later)).toBe(1)
    const reaped = (await store.getRun(started.id))!
    expect(reaped.status).toBe('failed')
    expect(reaped.error).toBe('stale: no heartbeat for 15 minutes')

    // Exactly one new run opens afterwards, and the wedged one is not resumed.
    const next = await startCatalogSync(store, liveProviderClient, { host: HOST, ...FAST, maxRequests: 1, now: later })
    expect(next.id).not.toBe(started.id)
    expect(store.dump().runs.filter((r) => r.status === 'running')).toHaveLength(1)
    expect(store.dump().runs).toHaveLength(2)
  })

  it('leaves a run that is still beating alone', async () => {
    const store = createMemoryCatalogStore()
    const started = await startCatalogSync(store, liveProviderClient, { host: HOST, ...FAST, maxRequests: 1 })
    expect(await reapStaleRuns(store, HOST, Date.parse(started.updated_at) + STALE_RUN_MS - 1_000)).toBe(0)
    expect((await store.getRun(started.id))!.status).toBe('running')
  })

  it('waits an hour after a failure instead of retrying the same outage every five minutes', () => {
    const now = Date.UTC(2026, 8, 17, 9, 0, 0)
    const failedAt = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()

    expect(
      planCatalogSyncTick([runRow({ status: 'failed', updated_at: failedAt(10), finished_at: failedAt(10) })], now),
    ).toEqual({ action: 'skip', reason: 'cooldown' })

    expect(
      planCatalogSyncTick([runRow({ status: 'failed', updated_at: failedAt(61), finished_at: failedAt(61) })], now),
    ).toEqual({ action: 'start' })

    expect(FAILED_RUN_COOLDOWN_MS).toBe(60 * 60 * 1000)
  })

  it('continues a live run, skips a fresh catalog, and starts when the walk has aged out', () => {
    const now = Date.UTC(2026, 8, 17, 9, 0, 0)
    const ago = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString()

    expect(planCatalogSyncTick([runRow({ id: 'live', status: 'running' })], now)).toEqual({
      action: 'continue',
      runId: 'live',
    })
    expect(planCatalogSyncTick([runRow({ finished_at: ago(2) })], now)).toEqual({ action: 'skip', reason: 'fresh' })
    expect(planCatalogSyncTick([runRow({ finished_at: ago(7) })], now)).toEqual({ action: 'start' })
    // A dry run is a rehearsal, not a refresh.
    expect(planCatalogSyncTick([runRow({ dry_run: true, finished_at: ago(1) })], now)).toEqual({ action: 'start' })
    expect(planCatalogSyncTick([], now)).toEqual({ action: 'start' })
  })
})

describe('catalog sync v2 — one walker per run', () => {
  it('lets only the invocation that claims the run call the provider', async () => {
    const store = createMemoryCatalogStore()
    const started = await startCatalogSync(store, liveProviderClient, { host: HOST, ...FAST, maxRequests: 2 })

    let calls = 0
    const counting: CatalogProviderClient = {
      getCategories: async () => {
        calls += 1
        return liveProviderClient.getCategories()
      },
      getSubcategories: async (id) => {
        calls += 1
        return liveProviderClient.getSubcategories(id)
      },
      getSubcategoryOptions: async (id) => {
        calls += 1
        return liveProviderClient.getSubcategoryOptions(id)
      },
      getProductsCost: async (items) => {
        calls += 1
        return liveProviderClient.getProductsCost(items)
      },
    }

    // Both invocations read the same row; only one can claim it.
    const first = await continueCatalogSync(store, counting, started.id, { ...FAST, maxRequests: 2 })
    const callsAfterFirst = calls
    expect(first.claimed).toBe(true)
    expect(callsAfterFirst).toBeGreaterThan(0)

    // A second invocation holding the STALE updated_at claims nothing.
    const stale = { ...started }
    const loser = await continueCatalogSync(
      { ...store, getRun: async () => stale } as typeof store,
      counting,
      started.id,
      { ...FAST, maxRequests: 2 },
    )
    expect(loser.claimed).toBe(false)
    expect(calls).toBe(callsAfterFirst)
    expect(loser.cursor).toEqual(started.cursor)
  })

  it('turns a lost insert race into the same refusal as an in-flight run', async () => {
    const store = createMemoryCatalogStore()
    // findRunningRun sees nothing (the other writer has not committed yet) but the
    // unique index does, which is the race the partial index exists to lose safely.
    const racing = {
      ...store,
      findRunningRun: async () => null,
      createRun: async () => {
        const err = new Error('duplicate key value violates unique constraint') as Error & { code: string }
        err.code = '23505'
        throw err
      },
    } as unknown as MemoryCatalogStore

    await expect(startCatalogSync(racing, liveProviderClient, { host: HOST, ...FAST })).rejects.toBeInstanceOf(
      CatalogSyncBusyError,
    )
  })
})

describe('catalog sync v2 — provider text never reaches the database', () => {
  it('stores a class, not the body of a provider error', async () => {
    const store = createMemoryCatalogStore()
    const leaky: CatalogProviderClient = {
      getCategories: async () => {
        throw new errors.LumaprintsApiError(400, 'MARKER-xyz store=82222 key=abc')
      },
      getSubcategories: async () => [],
      getSubcategoryOptions: async () => [],
      getProductsCost: async () => [],
    }
    const run = await startCatalogSync(store, leaky, { host: HOST, ...FAST })
    expect(run.status).toBe('failed')
    expect(run.error).toBe('provider_error:400')
    expect(JSON.stringify(store.dump().runs)).not.toContain('MARKER')
  })

  it('classifies a budget refusal and a kill switch distinctly', async () => {
    const store = createMemoryCatalogStore()
    const overBudget: CatalogProviderClient = {
      getCategories: async () => {
        throw new errors.LumaprintsBudgetError('busy')
      },
      getSubcategories: async () => [],
      getSubcategoryOptions: async () => [],
      getProductsCost: async () => [],
    }
    // A budget refusal is transient: the run pauses on the same cursor instead of failing.
    const paused = await startCatalogSync(store, overBudget, { host: HOST, ...FAST })
    expect(paused.status).toBe('running')
    expect(paused.error).toBeNull()
    expect(paused.stats.transientFailures).toBe(1)
    expect(paused.cursor).toEqual({ stage: 'categories' })

    const off = createMemoryCatalogStore()
    const disabled: CatalogProviderClient = {
      getCategories: async () => {
        throw new errors.LumaprintsDisabledError('off')
      },
      getSubcategories: async () => [],
      getSubcategoryOptions: async () => [],
      getProductsCost: async () => [],
    }
    expect((await startCatalogSync(off, disabled, { host: HOST, ...FAST })).error).toBe('disabled')
  })
})
