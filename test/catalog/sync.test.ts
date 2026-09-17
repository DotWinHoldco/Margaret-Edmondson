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
const state = vi.hoisted(() => ({ catalog: null as unknown as Fixture, costCalls: 0 }))

function findSubcategory(id: number): { category: FixtureCategory; sub: FixtureSubcategory } | null {
  for (const category of state.catalog.categories) {
    const sub = category.subcategories.find((s) => s.subcategoryId === Number(id))
    if (sub) return { category, sub }
  }
  return null
}

vi.mock('@/lib/integrations/lumaprints', () => ({
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
  continueCatalogSync,
  liveProviderClient,
  runCatalogSyncToCompletion,
  startCatalogSync,
  type CatalogProviderClient,
} from '@/lib/catalog/sync'
import { createMemoryCatalogStore, type MemoryCatalogStore } from './memory-store'
import type { CatalogOptionRow } from '@/lib/catalog/types'

const HOST = 'us.api-sandbox.lumaprints.com'
// Paced at zero: the pacing itself is not under test here and 59 real gaps would
// be two and a half minutes of sleeping.
const FAST = { minIntervalMs: 0, budgetMs: 600_000 }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  state.catalog = loadFixture()
  state.costCalls = 0
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
    expect(enabledSubs).toEqual([101002, 102002])

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
    ])

    const enabled = flatten(store)
      .filter((f) => f.option.enabled)
      .map((f) => `${f.subcategory_id}:${f.option.option_id}`)
      .sort()
    expect(enabled).toEqual(['101002:11', '101002:2', '102002:2', '102002:27', '102002:28'])
  })

  it('arrives with everything else off and unacknowledged', () => {
    const d = store.dump()
    const offSubs = d.subcategories.filter((s) => !s.enabled)
    expect(offSubs).toHaveLength(48)
    expect(d.subcategories.every((s) => s.acknowledged_at === null)).toBe(true)
    expect(d.options.filter((o) => o.enabled)).toHaveLength(5)
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

  it('needs a handful of chunks at the house request ceiling', async () => {
    const store = createMemoryCatalogStore()
    const run = await runCatalogSyncToCompletion(store, liveProviderClient, { host: HOST, ...FAST, maxRequests: 20 })
    expect(run.status).toBe('completed')
    expect(run.stats.requests).toBe(59)
    // Pinned, not bounded: the cron window is sized from this number. 59 requests
    // at 20 per invocation is three chunks, the last of which also finalizes.
    expect(run.stats.chunks).toBe(3)
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
    expect(run.error).toBe('provider is down')
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
