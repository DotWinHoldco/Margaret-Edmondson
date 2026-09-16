// Authored by DotWin
// Catalog walker: categories -> subcategories -> options, shaped exactly like the
// committed Phase 0 fixture (`fixtures/lumaprints/catalog.<host>.<date>.json`).
//
// Why this lives in the app and not only in a script: production print-provider
// credentials exist only inside the hosting platform and are not pullable, so the
// production catalog can only be captured through a deployed admin route. The script
// and this module therefore walk the same endpoints and emit the same shape, and the
// snapshot script's `--assemble` mode stitches per-category captures from here into a
// fixture identical to the one it writes itself.
//
// Budget: the provider publishes 40 requests/minute for the whole key, shared with the
// live storefront's quote path, so this walker paces itself to <=25/minute (the plan's
// ADR-7 headroom rule). A single category can therefore outlive one serverless
// invocation; the walk takes a deadline and returns `incomplete` + `nextOffset`
// instead of being killed mid-flight.

import { getCategories, getSubcategories, getSubcategoryOptions } from '@/lib/integrations/lumaprints'

/** One selectable option inside a group, verbatim from the provider. */
export interface CatalogOptionItem {
  optionId: number
  optionName: string
}

/** A provider option group with its items, verbatim. */
export interface CatalogOptionGroup {
  optionGroup: string
  optionGroupItems: CatalogOptionItem[]
}

/** A subcategory with its published bounds/DPI plus its option groups. */
export interface CatalogSubcategory {
  subcategoryId: number
  name: string
  minimumWidth: string | number
  maximumWidth: string | number
  minimumHeight: string | number
  maximumHeight: string | number
  requiredDPI?: number
  optionGroups: CatalogOptionGroup[]
  optionsError?: { status?: number; message: string }
}

/** A category and the subcategories walked for it. */
export interface CatalogCategory {
  id: number
  name: string
  subcategories: CatalogSubcategory[]
}

/** Result of walking one category (or just listing categories). */
export interface CatalogWalkResult {
  host: string
  capturedAt: string
  requestCount: number
  wallMs: number
  incomplete: boolean
  nextOffset: number | null
  subcategoryCount: number
}

export interface WalkOptions {
  /** Minimum gap between provider requests. Default 2400ms = 25 requests/minute. */
  minIntervalMs?: number
  /** Stop before this many ms have elapsed and report `incomplete`. Default 50s. */
  budgetMs?: number
  /** Skip this many subcategories (resume a walk that ran out of budget). */
  offset?: number
  /** Walk at most this many subcategories in this pass. */
  limit?: number
}

const DEFAULT_MIN_INTERVAL_MS = 2400
const DEFAULT_BUDGET_MS = 50_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The provider host this walk ran against. Sandbox and production ids are not
 * guaranteed to match, so every captured snapshot is stamped with its host and
 * reconciled by name (plan §9 F12).
 */
export function catalogHost(): string {
  const base = process.env.LUMAPRINTS_BASE_URL || 'https://us.api.lumaprints.com'
  try {
    return new URL(base).hostname
  } catch {
    return base
  }
}

// Paces calls to the configured interval and counts every request made.
class Pacer {
  readonly startedAt = Date.now()
  count = 0
  private last = 0
  constructor(private readonly minIntervalMs: number) {}

  async next(): Promise<void> {
    const gap = Date.now() - this.last
    if (this.last > 0 && gap < this.minIntervalMs) await sleep(this.minIntervalMs - gap)
    this.last = Date.now()
    this.count += 1
  }

  get elapsed(): number {
    return Date.now() - this.startedAt
  }
}

const asNumber = (v: unknown): number => Number(v)

function normaliseCategory(raw: unknown): { id: number; name: string } {
  const r = (raw ?? {}) as Record<string, unknown>
  // The documented shape is {id,name}; older captures show {categoryId,name}. Accept both.
  return { id: asNumber(r.id ?? r.categoryId), name: String(r.name ?? r.categoryName ?? '') }
}

function normaliseGroups(raw: unknown): CatalogOptionGroup[] {
  if (!Array.isArray(raw)) return []
  return raw.map((g) => {
    const group = (g ?? {}) as Record<string, unknown>
    const items = Array.isArray(group.optionGroupItems) ? group.optionGroupItems : []
    return {
      optionGroup: String(group.optionGroup ?? ''),
      optionGroupItems: items.map((i) => {
        const item = (i ?? {}) as Record<string, unknown>
        return { optionId: asNumber(item.optionId), optionName: String(item.optionName ?? '') }
      }),
    }
  })
}

/**
 * List the provider's categories (one request). This is the cheap call the admin
 * snapshot route answers with when no category is named.
 */
export async function walkCategories(
  options: WalkOptions = {},
): Promise<CatalogWalkResult & { categories: Array<{ id: number; name: string }> }> {
  const pacer = new Pacer(options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS)
  await pacer.next()
  const raw = await getCategories()
  const categories = (Array.isArray(raw) ? raw : []).map(normaliseCategory)
  return {
    host: catalogHost(),
    capturedAt: new Date().toISOString(),
    requestCount: pacer.count,
    wallMs: pacer.elapsed,
    incomplete: false,
    nextOffset: null,
    subcategoryCount: 0,
    categories,
  }
}

/**
 * Walk ONE category: its subcategories (verbatim bounds/DPI) and every
 * subcategory's option groups. Stops early and reports `incomplete` + `nextOffset`
 * when the time budget runs out, so a caller with a hard invocation ceiling resumes
 * rather than losing the walk.
 */
export async function walkCategory(
  categoryId: number,
  options: WalkOptions = {},
): Promise<CatalogWalkResult & { category: CatalogCategory }> {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS
  const offset = Math.max(0, options.offset ?? 0)
  const pacer = new Pacer(minIntervalMs)

  await pacer.next()
  const rawCategories = await getCategories()
  const category = (Array.isArray(rawCategories) ? rawCategories : [])
    .map(normaliseCategory)
    .find((c) => c.id === Number(categoryId))

  await pacer.next()
  const rawSubs = await getSubcategories(categoryId)
  const subsRaw = (Array.isArray(rawSubs) ? rawSubs : []) as Array<Record<string, unknown>>
  const limit = options.limit ?? subsRaw.length
  const slice = subsRaw.slice(offset, offset + limit)

  const subcategories: CatalogSubcategory[] = []
  let walked = 0
  let incomplete = false
  for (const s of slice) {
    // Leave room for one more paced request; otherwise hand the rest to the next pass.
    if (pacer.elapsed + minIntervalMs > budgetMs) {
      incomplete = true
      break
    }
    await pacer.next()
    let optionGroups: CatalogOptionGroup[] = []
    let optionsError: CatalogSubcategory['optionsError']
    try {
      optionGroups = normaliseGroups(await getSubcategoryOptions(asNumber(s.subcategoryId)))
    } catch (err) {
      const e = err as { status?: number; message?: string }
      optionsError = { status: e?.status, message: e?.message ?? 'option lookup failed' }
    }
    subcategories.push({
      subcategoryId: asNumber(s.subcategoryId),
      name: String(s.name ?? ''),
      minimumWidth: (s.minimumWidth ?? '') as string | number,
      maximumWidth: (s.maximumWidth ?? '') as string | number,
      minimumHeight: (s.minimumHeight ?? '') as string | number,
      maximumHeight: (s.maximumHeight ?? '') as string | number,
      ...(s.requiredDPI === undefined ? {} : { requiredDPI: asNumber(s.requiredDPI) }),
      optionGroups,
      ...(optionsError ? { optionsError } : {}),
    })
    walked += 1
  }

  const consumed = offset + walked
  const more = incomplete || consumed < subsRaw.length
  return {
    host: catalogHost(),
    capturedAt: new Date().toISOString(),
    requestCount: pacer.count,
    wallMs: pacer.elapsed,
    incomplete: more,
    nextOffset: more ? consumed : null,
    subcategoryCount: subsRaw.length,
    category: {
      id: Number(categoryId),
      name: category?.name ?? '',
      subcategories,
    },
  }
}
