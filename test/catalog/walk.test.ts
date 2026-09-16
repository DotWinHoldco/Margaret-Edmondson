import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The provider client is mocked wholesale: this suite proves the walker's shape and
// its request pacing, and it must never reach the network. Live provider behaviour is
// proved separately by the sandbox probe harness (fixtures/lumaprints/PROBES.md) —
// a mocked test is evidence about our code, never about LumaPrints.
const getCategories = vi.hoisted(() => vi.fn())
const getSubcategories = vi.hoisted(() => vi.fn())
const getSubcategoryOptions = vi.hoisted(() => vi.fn())
const calls = vi.hoisted(() => [] as Array<{ fn: string; at: number }>)

vi.mock('@/lib/integrations/lumaprints', () => ({
  LumaprintsDisabledError: class LumaprintsDisabledError extends Error {},
  getCategories: (...args: unknown[]) => {
    calls.push({ fn: 'getCategories', at: Date.now() })
    return getCategories(...args)
  },
  getSubcategories: (...args: unknown[]) => {
    calls.push({ fn: 'getSubcategories', at: Date.now() })
    return getSubcategories(...args)
  },
  getSubcategoryOptions: (...args: unknown[]) => {
    calls.push({ fn: 'getSubcategoryOptions', at: Date.now() })
    return getSubcategoryOptions(...args)
  },
}))

import { catalogHost, walkCategories, walkCategory } from '@/lib/catalog/walk'
import { LumaprintsDisabledError } from '@/lib/integrations/lumaprints'

const CATEGORIES = [
  { id: 101, name: 'Canvas' },
  { id: 103, name: 'Fine Art Paper' },
]

const SUBCATEGORIES = [
  {
    subcategoryId: 103001,
    name: 'Archival Matte Fine Art Paper',
    minimumWidth: '4.00',
    maximumWidth: '110.00',
    minimumHeight: '4.00',
    maximumHeight: '43.00',
    requiredDPI: 300,
  },
  {
    subcategoryId: 103002,
    name: 'Hot Press Fine Art Paper',
    minimumWidth: '4.00',
    maximumWidth: '110.00',
    minimumHeight: '4.00',
    maximumHeight: '59.00',
    requiredDPI: 300,
  },
  {
    subcategoryId: 103003,
    name: 'Cold Press Fine Art Paper',
    minimumWidth: '4.00',
    maximumWidth: '110.00',
    minimumHeight: '4.00',
    maximumHeight: '59.00',
    requiredDPI: 300,
  },
]

const OPTION_GROUPS = [
  {
    optionGroup: 'Bleed Size',
    optionGroupItems: [
      { optionId: 36, optionName: '0.25in Bleed (0.25in on each side)' },
      { optionId: 39, optionName: 'No Bleed (Image goes to edge of paper)' },
    ],
  },
]

beforeEach(() => {
  calls.length = 0
  getCategories.mockReset().mockResolvedValue(CATEGORIES)
  getSubcategories.mockReset().mockResolvedValue(SUBCATEGORIES)
  getSubcategoryOptions.mockReset().mockResolvedValue(OPTION_GROUPS)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => vi.unstubAllGlobals())

describe('catalog walk — shape', () => {
  it('lists categories with one request and no network access', async () => {
    const result = await walkCategories({ minIntervalMs: 0 })
    expect(result.categories).toEqual([
      { id: 101, name: 'Canvas' },
      { id: 103, name: 'Fine Art Paper' },
    ])
    expect(result.requestCount).toBe(1)
    expect(result.host).toBe(catalogHost())
    expect(typeof result.capturedAt).toBe('string')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('walks one category into the fixture shape, verbatim bounds and option groups', async () => {
    const result = await walkCategory(103, { minIntervalMs: 0 })
    expect(result.category.id).toBe(103)
    expect(result.category.name).toBe('Fine Art Paper')
    expect(result.category.subcategories).toHaveLength(3)
    expect(result.subcategoryCount).toBe(3)
    expect(result.incomplete).toBe(false)
    expect(result.nextOffset).toBeNull()
    // Bounds are carried through exactly as the provider published them (strings).
    expect(result.category.subcategories[0]).toMatchObject({
      subcategoryId: 103001,
      name: 'Archival Matte Fine Art Paper',
      minimumWidth: '4.00',
      maximumWidth: '110.00',
      minimumHeight: '4.00',
      maximumHeight: '43.00',
      requiredDPI: 300,
    })
    expect(result.category.subcategories[0].optionGroups).toEqual(OPTION_GROUPS)
    // categories + subcategories + one option call per subcategory.
    expect(result.requestCount).toBe(2 + SUBCATEGORIES.length)
    expect(getSubcategoryOptions.mock.calls.map((c) => c[0])).toEqual([103001, 103002, 103003])
  })

  it('accepts the documented {id,name} category shape and the legacy {categoryId,name} one', async () => {
    getCategories.mockResolvedValue([{ categoryId: 103, name: 'Fine Art Paper (legacy shape)' }])
    const result = await walkCategory(103, { minIntervalMs: 0 })
    expect(result.category.name).toBe('Fine Art Paper (legacy shape)')
  })

  it('records an option lookup failure on the subcategory instead of failing the walk', async () => {
    getSubcategoryOptions.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 502 }))
    const result = await walkCategory(103, { minIntervalMs: 0 })
    expect(result.category.subcategories).toHaveLength(3)
    expect(result.category.subcategories[0].optionGroups).toEqual([])
    expect(result.category.subcategories[0].optionsError).toEqual({ status: 502, code: 'OPTIONS_LOOKUP_FAILED' })
    expect(result.category.subcategories[1].optionGroups).toEqual(OPTION_GROUPS)
    // Provider error text never reaches the payload (it is assembled into a committed fixture).
    expect(JSON.stringify(result)).not.toContain('boom')
  })

  it('answers an unknown category from the category list with a single request', async () => {
    const result = await walkCategory(999, { minIntervalMs: 0 })
    expect(result.requestCount).toBe(1)
    expect(getSubcategories).not.toHaveBeenCalled()
    expect(result.category).toEqual({ id: 999, name: '', subcategories: [] })
    expect(result.subcategoryCount).toBe(0)
  })

  it('stops the walk when the provider kill switch trips instead of recording rows', async () => {
    getSubcategoryOptions.mockRejectedValueOnce(new LumaprintsDisabledError())
    await expect(walkCategory(103, { minIntervalMs: 0 })).rejects.toBeInstanceOf(LumaprintsDisabledError)
  })

  it('never echoes a malformed base URL (which could carry userinfo) as the host', () => {
    vi.stubEnv('LUMAPRINTS_BASE_URL', 'https://key:secret@host:notaport')
    expect(catalogHost()).toBe('unknown-host')
    expect(catalogHost()).not.toContain('secret')
    vi.unstubAllEnvs()
    vi.stubEnv('LUMAPRINTS_BASE_URL', 'https://us.api-sandbox.lumaprints.com/api')
    expect(catalogHost()).toBe('us.api-sandbox.lumaprints.com')
    vi.unstubAllEnvs()
  })

  it('reports incomplete with a resume offset when the time budget runs out', async () => {
    const result = await walkCategory(103, { minIntervalMs: 20, budgetMs: 60 })
    expect(result.incomplete).toBe(true)
    expect(result.nextOffset).toBeGreaterThan(0)
    expect(result.nextOffset).toBeLessThan(3)
    expect(result.category.subcategories.length).toBe(result.nextOffset)
  })

  it('resumes from an offset and limits a pass', async () => {
    const result = await walkCategory(103, { minIntervalMs: 0, offset: 2 })
    expect(result.category.subcategories.map((s) => s.subcategoryId)).toEqual([103003])
    expect(result.incomplete).toBe(false)

    const limited = await walkCategory(103, { minIntervalMs: 0, limit: 1 })
    expect(limited.category.subcategories.map((s) => s.subcategoryId)).toEqual([103001])
    expect(limited.incomplete).toBe(true)
    expect(limited.nextOffset).toBe(1)
  })
})

describe('catalog walk — pacing', () => {
  it('spaces provider requests by at least the configured interval', async () => {
    const minIntervalMs = 30
    await walkCategory(103, { minIntervalMs })
    // categories + subcategories + 3 option calls = 5 paced requests.
    expect(calls).toHaveLength(5)
    const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at)
    for (const gap of gaps) {
      // Timer granularity: allow 5ms of slack, still proving the sleep happened.
      expect(gap).toBeGreaterThanOrEqual(minIntervalMs - 5)
    }
  })

  it('defaults to a <=25 requests/minute pace', async () => {
    // 2400ms between requests is the 25/minute budget the plan reserves (ADR-7).
    const started = Date.now()
    const result = await walkCategory(103, { budgetMs: 1 })
    // The budget stops the walk before any subcategory options are fetched, but the
    // two list calls still went out one default interval apart.
    expect(result.incomplete).toBe(true)
    expect(result.category.subcategories).toHaveLength(0)
    expect(Date.now() - started).toBeGreaterThanOrEqual(2400)
  }, 20_000)
})
