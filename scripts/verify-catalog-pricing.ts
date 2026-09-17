#!/usr/bin/env node
// Authored by DotWin
//
// The catalog pricing half of the §10 verification protocol: V2 (full-matrix sandbox
// pricing sweep, including the F26 additivity assertion) and V6.1 (legacy parity).
// Both write a structured result into audit/catalog-verification/ for the P9 report.
//
//   node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --help
//   node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --sweep --env .env.luma \
//        --snapshot fixtures/lumaprints/catalog.us.api-sandbox.lumaprints.com.2026-09-16.json
//   node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --parity [--live-sample 5]
//
// Two sweep flags decide how a per-item sandbox DROP is read (F37):
//
//   --retry-passes N  how many times an unpriced item is asked again, with an idle
//                     period between passes (default 2). Only what is still unpriced
//                     at the end is judged.
//   --strict          count every residual F37 drop as FAILED instead of SKIPPED, so
//                     the run goes red on any drop at all. It only ever TIGHTENS: no
//                     flag in this script can turn a failure into a pass.
//
// F37 is the per-item random drop: a `success:false` row with NO message, in a
// subcategory that priced other items in the same run. The same item prices on its own
// seconds later, so by default its two assertions are SKIPPED and counted, with one
// `FINDING F37` note per subcategory saying how many of its items dropped. F36 remains
// the whole-grid case (a subcategory this host would not price at all).
//
// Why a plain-node script and not a test: the sweep spends real provider budget over
// tens of minutes and the parity run reads the production database. Neither belongs in
// `npm test`, and both must be re-runnable by a person with a printed receipt.
//
// Safety rails, in the order they matter:
//   - The sweep talks to the SANDBOX and nothing else (`assertSandbox`), never places
//     an order, and goes through the shared throttled probe client at <= 25 req/min so
//     the live storefront keeps its share of the 40/min key (F29).
//   - Parity makes NO provider call at all unless `--live-sample N` is passed, and that
//     sample prices against PRODUCTION read-only pricing endpoints. With no production
//     credentials it prints SKIPPED and asks for nothing. It never fakes a number.
//   - Every option set sent to the provider is explicit. An empty array resolves to
//     Image Wrap on canvas and a 0.25in bleed on paper (P15/F30), so a sweep that sent
//     [] would be measuring a product we do not sell.
//
// Run it through the loader hook, which teaches node the project's own module
// resolution (extensionless relative specifiers and the `@/` alias):
//
//   node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts …
//
// That is what lets this script import the REAL pure modules — the rules engine, the
// catalog assembler and the seed rules — instead of replicating them. The one thing
// still replicated here is the margin cascade, and only because margin.ts reaches for
// the Next server client (see resolveEffectiveProductMargin below).

import fs from 'node:fs'
import path from 'node:path'
import { AssertionLog, REPO_ROOT, gitCommit, writeStepResult } from './lib/verification-report'
import type { StepFailure, StepTable } from './lib/verification-report'
import { assembleCatalog } from '../src/lib/catalog/assemble'
import { canonicalGroupKey } from '../src/lib/catalog/keys'
import { defaultOptionIds as engineDefaultOptionIds, evaluateSelection } from '../src/lib/catalog/rules'
import { geometryForOption, pickSeededDefault } from '../src/lib/catalog/seed-rules'
import { MEDIUMS_CATALOG } from '../src/lib/pricing/mediums'
import { customerPriceCents } from '../src/lib/pricing/variant-pricing'
import type { Geometry } from '../src/lib/catalog/types'
import type {
  Catalog,
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategory,
  CatalogSubcategoryRow,
} from '../src/lib/catalog/types'
import { clientFromEnv, loadEnvFile, parseArgs } from './lib/lumaprints-probe-client.mjs'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

interface SnapshotOption {
  optionId: number
  optionName: string
}
interface SnapshotGroup {
  optionGroup: string
  optionGroupItems: SnapshotOption[]
}
interface SnapshotSubcategory {
  subcategoryId: number
  name: string
  minimumWidth: string | number
  maximumWidth: string | number
  minimumHeight: string | number
  maximumHeight: string | number
  requiredDPI: number
  optionGroups?: SnapshotGroup[]
}
interface SnapshotCategory {
  id: number
  name: string
  subcategories: SnapshotSubcategory[]
}
interface Snapshot {
  capturedAt: string
  host: string
  categories: SnapshotCategory[]
}

/** One priced line as the provider echoes it. */
interface PricedOption {
  optionId: number
  optionGroupName?: string
  optionName?: string
  price?: number
}
interface PriceRow {
  success?: boolean
  subcategoryId?: number
  size?: { width: number; height: number }
  price?: number
  options?: PricedOption[]
  message?: string
}

interface PriceRequestItem {
  subcategoryId: number
  size: { width: number; height: number }
  options: number[]
}

interface ProbeRecord {
  status: number
  ok: boolean
  body: unknown
  rawText: string
}

/** The slice of the shared probe client this script uses. */
interface Probe {
  baseUrl: string
  host: string
  rpm: number
  isSandbox: boolean
  requestCount: number
  assertSandbox(what: string): void
  records: Array<{ headers?: Record<string, string | null>; status: number }>
  priceBatch(items: unknown[], label?: string): Promise<ProbeRecord>
  printSummary(prefix?: string): { requestCount: number; peakPerRolling60s: number; wallMs: number }
}

interface Args {
  _: string[]
  help?: boolean
  h?: boolean
  sweep?: boolean
  parity?: boolean
  raw?: string | boolean
  env?: string | boolean
  snapshot?: string | boolean
  subcategories?: string | boolean
  sizes?: string | boolean
  yes?: boolean
  'live-sample'?: string | boolean
  'live-env'?: string | boolean
  strict?: boolean
  'retry-passes'?: string | boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Provider cap on one batch-pricing call. */
const BATCH_MAX = 40
/** Refuse a sweep larger than this without an explicit --yes. */
const REQUEST_BUDGET = 900

/** Retry passes after the first, and how long to idle before each. */
const DEFAULT_RETRY_PASSES = 2
const RETRY_COOLDOWN_MS = 60_000

/**
 * Run configuration for the drop handling, set once from argv before the first batch.
 * `retryPasses` is how many times an unpriced item is asked again; `strict` decides
 * whether the residue is counted as FAILED (strict) or SKIPPED with an F37 note.
 */
let retryPasses = DEFAULT_RETRY_PASSES
let strictDrops = false
/** Host the parity run's catalog rows must come from. */
const PRODUCTION_HOST = 'us.api.lumaprints.com'

/**
 * The standard size grid. Every medium in mediums.ts carries the same STANDARD_ALL
 * list (portrait + square + landscape), so canvas's copy is the grid; each subcategory
 * then clips it to its own published bounds.
 */
const SIZE_GRID: Array<{ size_label: string; width: number; height: number }> = MEDIUMS_CATALOG.canvas.sizes

/** Provider category id -> our medium family (the 8-entry enum of mediums.ts). */
const MEDIUM_BY_CATEGORY: Record<number, string> = {
  101: 'canvas',
  102: 'framed_canvas',
  103: 'fine_art_paper',
  105: 'framed_fine_art_paper',
  106: 'metal',
  107: 'peel_and_stick',
  108: 'foam_mounted_fine_art_paper',
}

/** Categories whose whole-configuration price MUST equal base + the summed deltas. */
const ADDITIVE_CATEGORIES = new Set([101, 102, 106])
/** Framed paper: non-additive by measurement (F26); recorded, never asserted. */
const WHOLE_CONFIG_CATEGORIES = new Set([105])

const USAGE = `verify-catalog-pricing — V2 sandbox pricing sweep + V6.1 legacy parity

Usage:
  node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --sweep --env .env.luma --snapshot <file>
      [--subcategories 101002,105005] [--sizes small,mid,max] [--yes]
  node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --parity [--live-sample N] [--live-env <file>]
  node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts \
      --raw <subcategoryId> <width> <height> --env .env.luma --snapshot <file>
  node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --help

Modes:
  --sweep    V2. For every subcategory in the snapshot: price the standard size grid at
             the geometry-neutral default option set, price every option swapped into
             that default at up to three in-bounds sizes, then price the maximal
             distinct-group configuration at two sizes and assert additivity
             (apiTotal === base + the summed deltas) on categories 101/102/106, record
             it on 105 (F26). Framed paper also gets the glass-ceiling edge: the
             provider prices it (recorded) and the rules engine must reject it
             (asserted). SANDBOX only, <= 25 req/min, no orders, ever.
  --raw      One batch-pricing call for ONE item (the subcategory's seeded default set
             at the given size) with the request, the HTTP status and the FULL raw body
             printed verbatim. This is the "is it the provider or is it us" mode: it
             says whether the response array carries a row for the item at all, and
             whether that row is a failure or an absence. Prices nothing else.
  --parity   V6.1. No provider call by default: every active print variant in the
             production database is re-derived through the catalog (default option set
             and subcategory id) and re-priced through customerPriceCents, and must
             match the stored price to the cent.

Options:
  --env <file>            env file for the sandbox probe client (default .env.luma)
  --snapshot <file>       Phase 0 catalog fixture to sweep
  --subcategories <list>  comma-separated provider subcategory ids to limit the sweep
  --sizes <list>          which representative sizes to swap options at: small,mid,max
  --yes                   proceed when the estimate exceeds ${REQUEST_BUDGET} requests
  --retry-passes <N>      sweep only: retry passes after the first for items that came
                          back unpriced (default ${DEFAULT_RETRY_PASSES})
  --strict                sweep only: count every residual per-item drop (F37) as
                          FAILED rather than SKIPPED. Tightens the run; nothing in this
                          script can soften a failure into a pass.
  --live-sample <N>       parity only: also price N variants live on PRODUCTION pricing
                          endpoints (read-only). Needs production credentials; prints
                          SKIPPED and continues when they are absent.
  --live-env <file>       env file holding those production credentials
                          (default .env.luma.production)

Results are written to audit/catalog-verification/<step>.{json,md}. Exit code is
non-zero when any assertion failed.
`

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const num = (value: unknown): number => Number(value)
const cents = (dollars: number): number => Math.round(dollars * 100)
const categoryOf = (subcategoryId: number): number => Math.floor(subcategoryId / 1000)
const str = (value: string | boolean | undefined, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  const left = [...new Set(a)].sort((x, y) => x - y)
  const right = [...new Set(b)].sort((x, y) => x - y)
  return left.length === right.length && left.every((value, i) => value === right[i])
}

// ---------------------------------------------------------------------------
// Defaults and geometry: the catalog's own seed rules, not a copy of them
//
// src/lib/catalog/seed-rules.ts decides which option is OUR geometry-neutral default
// and what physical effect an option has, keyed on the provider's names. The sweep has
// to price exactly the set the catalog seeds, so it calls those functions rather than
// reimplementing them; a replica that drifted would prove the harness agrees with
// itself.
// ---------------------------------------------------------------------------

/**
 * Our geometry-neutral option for one group. NEVER returns nothing for a group that has
 * options: an omitted group is not neutral, it is the provider's hostile default.
 */
function defaultOptionIdForGroup(
  groupKey: string,
  categoryId: number,
  subcategoryName: string,
  options: readonly SnapshotOption[],
): number | null {
  if (options.length === 0) return null
  return pickSeededDefault(
    groupKey,
    categoryId,
    subcategoryName,
    options.map((option) => ({ option_id: option.optionId, api_option_name: option.optionName })),
  )
}

/** The whole default set for a subcategory, in ascending id order. */
function defaultOptionIdsFor(subcategory: SnapshotSubcategory): number[] {
  const categoryId = categoryOf(subcategory.subcategoryId)
  const ids: number[] = []
  for (const group of subcategory.optionGroups ?? []) {
    const id = defaultOptionIdForGroup(
      canonicalGroupKey(group.optionGroup),
      categoryId,
      subcategory.name,
      group.optionGroupItems,
    )
    if (id !== null) ids.push(id)
  }
  return ids.sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
// Snapshot -> catalog rows -> assembled tree
// ---------------------------------------------------------------------------

const nowIso = (): string => new Date().toISOString()

/**
 * Build the row set assembleCatalog() expects, with every row enabled, so the tree the
 * rules engine sees is the provider's catalog rather than the admin's current config.
 */
function rowSetFromSnapshot(snapshot: Snapshot): Parameters<typeof assembleCatalog>[0] {
  const subcategories: CatalogSubcategoryRow[] = []
  const groups: CatalogOptionGroupRow[] = []
  const options: CatalogOptionRow[] = []
  const mediums = new Set<string>()
  const stamp = nowIso()

  for (const category of snapshot.categories) {
    const medium = MEDIUM_BY_CATEGORY[category.id] ?? 'canvas'
    mediums.add(medium)
    for (const sub of category.subcategories) {
      const subRef = `sub-${sub.subcategoryId}`
      subcategories.push({
        id: subRef,
        medium,
        subcategory_id: sub.subcategoryId,
        api_host: snapshot.host,
        name: sub.name,
        display_label: sub.name,
        description: null,
        min_width_in: num(sub.minimumWidth),
        max_width_in: num(sub.maximumWidth),
        min_height_in: num(sub.minimumHeight),
        max_height_in: num(sub.maximumHeight),
        required_dpi: sub.requiredDPI,
        max_glass_w_in: null,
        max_glass_h_in: null,
        enabled: true,
        sort_order: 0,
        customer_note: null,
        pricing_mode: WHOLE_CONFIG_CATEGORIES.has(categoryOf(sub.subcategoryId)) ? 'whole_config' : 'additive',
        first_seen_at: stamp,
        last_seen_at: stamp,
        acknowledged_at: stamp,
        removed_from_api: false,
        last_synced_at: stamp,
      } as CatalogSubcategoryRow)

      const defaults = new Set(defaultOptionIdsFor(sub))
      for (const group of sub.optionGroups ?? []) {
        const groupKey = canonicalGroupKey(group.optionGroup)
        const groupRef = `${subRef}-${groupKey}`
        groups.push({
          id: groupRef,
          subcategory_ref: subRef,
          group_key: groupKey,
          api_group_name: group.optionGroup,
          display_label: group.optionGroup,
          // The three framed-canvas depths are the only subcategories that reject an
          // empty option array (P1/F13); their Frame Styles group is therefore required.
          required: groupKey === 'frame_style' && categoryOf(sub.subcategoryId) === 102,
          customer_visible: true,
          enabled: true,
          display_kind: 'list',
          depends_on_group: groupKey === 'mat_color' ? 'mat_size' : null,
          depends_hidden_when: groupKey === 'mat_color' ? [64] : null,
          sort_order: 0,
          first_seen_at: stamp,
          last_seen_at: stamp,
          acknowledged_at: stamp,
          removed_from_api: false,
        } as CatalogOptionGroupRow)

        for (const option of group.optionGroupItems) {
          options.push({
            id: `${groupRef}-${option.optionId}`,
            group_ref: groupRef,
            option_id: option.optionId,
            api_option_name: option.optionName,
            display_label: option.optionName,
            enabled: true,
            is_default: defaults.has(option.optionId),
            provider_default: false,
            sort_order: 0,
            swatch: null,
            geometry: geometryForOption(groupKey, option.optionName) as Geometry | null,
            first_seen_at: stamp,
            last_seen_at: stamp,
            acknowledged_at: stamp,
            removed_from_api: false,
          } as unknown as CatalogOptionRow)
        }
      }
    }
  }

  return {
    host: snapshot.host,
    mediums: [...mediums].map((medium) => ({ medium, enabled: true })),
    subcategories,
    groups,
    options,
  }
}

// ---------------------------------------------------------------------------
// Pricing plumbing
// ---------------------------------------------------------------------------

interface PricedBatch {
  rows: PriceRow[]
  /** Items that came back unpriced on the first pass. */
  retried: number
  /** Of those, how many priced on a later pass. */
  recovered: number
  /** One line per retry pass: how many were asked again and how many came back. */
  passes: string[]
}


/**
 * Price every item, in batches of <= 40, then RETRY the ones that came back unpriced.
 *
 * The retries are not politeness, they are measurement. A long run against the sandbox
 * returns `{"success": false}` with no message for scattered items that price perfectly
 * well on their own: profiles this harness classified as unpriceable inside a
 * 158-request sweep priced 40 of 40, with the same option sets and mixed option sets,
 * seconds after that same sweep finished, and the set of "unpriceable" profiles moved
 * between two runs of the identical sweep. That is throughput, not capability. So the
 * unpriced items are asked again in later passes with an idle period between them, and
 * only what is still unpriced at the end is judged. Every pass is recorded: a run that
 * needed thousands of retries has told you something about the environment even when
 * it ends up green.
 */
async function priceChunks(client: Probe, items: PriceRequestItem[], label: string): Promise<PriceRow[]> {
  const rows: PriceRow[] = []
  const batches = chunk(items, BATCH_MAX)
  let index = 0
  for (const batch of batches) {
    index += 1
    process.stderr.write(`  [${label}] batch ${index}/${batches.length} (${batch.length} items)\n`)
    const record = await client.priceBatch(batch, label)
    const body = record.body
    if (!record.ok || !Array.isArray(body) || body.length !== batch.length) {
      const detail = `HTTP ${record.status}: ${String(record.rawText).slice(0, 300)}`
      for (let i = 0; i < batch.length; i += 1) rows.push({ success: false, message: detail })
      continue
    }
    for (const row of body as PriceRow[]) rows.push(row)
  }
  return rows
}

async function priceAll(client: Probe, items: PriceRequestItem[], label: string): Promise<PricedBatch> {
  const rows = await priceChunks(client, items, label)
  const unpriced = (): number[] => {
    const out: number[] = []
    rows.forEach((row, index) => {
      if (row.success !== true) out.push(index)
    })
    return out
  }

  const firstFailures = unpriced()
  const passes: string[] = []
  let recovered = 0

  for (let pass = 1; pass <= retryPasses; pass += 1) {
    const pending = unpriced()
    if (pending.length === 0) break
    process.stderr.write(
      `  [${label}] ${pending.length} item(s) unpriced; idling ${RETRY_COOLDOWN_MS / 1000}s then retry pass ${pass}/${retryPasses}\n`,
    )
    await new Promise((resolve) => setTimeout(resolve, RETRY_COOLDOWN_MS))
    const retryRows = await priceChunks(client, pending.map((index) => items[index]), `${label}-retry${pass}`)
    let passRecovered = 0
    retryRows.forEach((row, position) => {
      if (row.success === true) {
        rows[pending[position]] = row
        passRecovered += 1
      }
    })
    recovered += passRecovered
    passes.push(`${label} retry ${pass}: asked ${pending.length}, priced ${passRecovered}`)
  }

  return { rows, retried: firstFailures.length, recovered, passes }
}

/**
 * F37: a per-item drop rather than a refusal.
 *
 * The sandbox answers a long run with `{"success": false}` and NO message for scattered
 * items that price perfectly well on their own moments later; a genuine refusal carries
 * the provider's words. So a row that is present, unsuccessful and silent is classified
 * as a drop, and a row that says WHY it failed never is.
 */
function isSandboxDrop(row: PriceRow | null | undefined): boolean {
  if (!row || row.success === true) return false
  return !(typeof row.message === 'string' && row.message.length > 0)
}

/** Why an item is not priced, in the provider's own terms. */
function unpricedReason(row: PriceRow | null | undefined): string {
  if (!row) return 'no row in the response array'
  if (typeof row.message === 'string' && row.message.length > 0) return row.message
  return `success:${String(row.success)} with no message (row present, price ${String(row.price)})`
}

/**
 * The whole-configuration total, in cents.
 *
 * `price` on a pricing row is the BASE price for that subcategory and size; each
 * option's own price sits in `options[]` and is NOT folded into it (measured: 105005
 * at 8x8 prices 19.61 with No Mat and 19.61 with a 5in mat, whose option line reads
 * 20.86). A harness that read `price` as the total would score every option delta at
 * zero and pronounce the whole catalog additive, so the total is always
 * price + the echoed option prices. This is how P14 computed it too.
 */
function apiTotalCents(row: PriceRow | undefined): number | null {
  if (!row || row.success !== true || typeof row.price !== 'number') return null
  let total = cents(row.price)
  for (const option of row.options ?? []) {
    if (typeof option.price === 'number') total += cents(option.price)
  }
  return total
}

// ---------------------------------------------------------------------------
// V2 — the sweep
// ---------------------------------------------------------------------------

interface SubcategoryPlan {
  sub: SnapshotSubcategory
  categoryId: number
  defaults: number[]
  /** Sizes from the standard grid that fit the published bounds. */
  grid: Array<{ width: number; height: number; label: string }>
  /** Sizes dropped as out of bounds: documented, never counted as failures. */
  dropped: string[]
  /** small / mid / max, filtered by --sizes. */
  representative: Array<{ width: number; height: number; label: string }>
  /** One swap per non-default option, per representative size. */
  swaps: Array<{ groupKey: string; optionId: number; optionName: string; size: { width: number; height: number; label: string } }>
}

function planSubcategory(
  sub: SnapshotSubcategory,
  wantedSizes: Set<string>,
): SubcategoryPlan {
  const categoryId = categoryOf(sub.subcategoryId)
  const minW = num(sub.minimumWidth)
  const maxW = num(sub.maximumWidth)
  const minH = num(sub.minimumHeight)
  const maxH = num(sub.maximumHeight)

  const grid: SubcategoryPlan['grid'] = []
  const dropped: string[] = []
  for (const size of SIZE_GRID) {
    if (size.width >= minW && size.width <= maxW && size.height >= minH && size.height <= maxH) {
      grid.push({ width: size.width, height: size.height, label: size.size_label })
    } else {
      dropped.push(size.size_label)
    }
  }
  grid.sort((a, b) => a.width * a.height - b.width * b.height)

  const representative: SubcategoryPlan['representative'] = []
  if (grid.length > 0) {
    const picks: Array<[string, number]> = [
      ['small', 0],
      ['mid', Math.floor((grid.length - 1) / 2)],
      ['max', grid.length - 1],
    ]
    const seen = new Set<string>()
    for (const [name, index] of picks) {
      if (!wantedSizes.has(name)) continue
      const size = grid[index]
      if (!size || seen.has(size.label)) continue
      seen.add(size.label)
      representative.push(size)
    }
  }

  const defaults = defaultOptionIdsFor(sub)
  const defaultSet = new Set(defaults)
  const swaps: SubcategoryPlan['swaps'] = []
  for (const group of sub.optionGroups ?? []) {
    const groupKey = canonicalGroupKey(group.optionGroup)
    for (const option of group.optionGroupItems) {
      if (defaultSet.has(option.optionId)) continue
      for (const size of representative) {
        swaps.push({ groupKey, optionId: option.optionId, optionName: option.optionName, size })
      }
    }
  }

  return { sub, categoryId, defaults, grid, dropped, representative, swaps }
}

/** Default set with one option swapped into its own group. */
function swapInto(defaults: readonly number[], groupOptionIds: Set<number>, optionId: number): number[] {
  const kept = defaults.filter((id) => !groupOptionIds.has(id))
  return [...kept, optionId].sort((a, b) => a - b)
}

function groupOptionIdSets(sub: SnapshotSubcategory): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>()
  for (const group of sub.optionGroups ?? []) {
    map.set(canonicalGroupKey(group.optionGroup), new Set(group.optionGroupItems.map((o) => o.optionId)))
  }
  return map
}

async function runSweep(args: Args): Promise<number> {
  const startedAt = nowIso()
  const log = new AssertionLog()

  const snapshotArg = str(args.snapshot, '')
  if (!snapshotArg) {
    console.error('--sweep needs --snapshot <fixture.json>')
    return 2
  }
  const snapshotPath = path.resolve(REPO_ROOT, snapshotArg)
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as Snapshot

  const only = str(args.subcategories, '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
  const wantedSizes = new Set(
    str(args.sizes, 'small,mid,max')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  )

  const allSubs: SnapshotSubcategory[] = []
  for (const category of snapshot.categories) for (const sub of category.subcategories) allSubs.push(sub)
  const subs = only.length ? allSubs.filter((sub) => only.includes(sub.subcategoryId)) : allSubs
  if (subs.length === 0) {
    console.error(`No subcategories matched (snapshot has ${allSubs.length}).`)
    return 2
  }

  const plans = subs.map((sub) => planSubcategory(sub, wantedSizes))

  // Drop handling, decided before the first request so the printed plan says which
  // rules this run is judged under.
  const wantedPasses = Number(str(args['retry-passes'], String(DEFAULT_RETRY_PASSES)))
  retryPasses = Number.isFinite(wantedPasses) && wantedPasses >= 0 ? Math.trunc(wantedPasses) : DEFAULT_RETRY_PASSES
  strictDrops = args.strict === true

  // --- Budget, printed before a single request is sent -----------------------
  const passOneItems = plans.reduce((total, plan) => total + plan.grid.length + plan.swaps.length, 0)
  const passTwoItems = plans.reduce((total, plan) => {
    // A maximal configuration needs at least two groups with a non-default option;
    // a single-group subcategory cannot produce one (additivity is vacuous there, P14).
    const swappableGroups = new Set(plan.swaps.map((swap) => swap.groupKey)).size
    const maximalConfigs = swappableGroups >= 2 ? Math.min(2, plan.representative.length) : 0
    return total + maximalConfigs + (plan.categoryId === 105 ? 1 : 0)
  }, 0)
  const estimate = Math.ceil(passOneItems / BATCH_MAX) + Math.ceil(passTwoItems / BATCH_MAX)
  console.log(`V2 sweep plan: ${plans.length} subcategories`)
  console.log(`  pass 1 items (grid + option swaps): ${passOneItems}`)
  console.log(`  pass 2 items (maximal configs + glass-ceiling edge): ${passTwoItems}`)
  console.log(`  estimated provider requests: ${estimate} (batches of ${BATCH_MAX}, <= 25/min)`)
  console.log(`  retry passes: ${retryPasses} · residual per-item drops (F37): ${strictDrops ? 'FAILED (--strict)' : 'SKIPPED and counted'}`)
  if (estimate > REQUEST_BUDGET && args.yes !== true) {
    console.error(`Refusing: the estimate exceeds the ${REQUEST_BUDGET}-request budget. Re-run with --yes to proceed.`)
    return 2
  }

  const { client, envFile } = clientFromEnv({
    envFile: str(args.env, '.env.luma'),
    rpm: 25,
  }) as unknown as { client: Probe; envFile: string }
  // Hard stop: this sweep exists to measure the sandbox, and nothing else.
  client.assertSandbox('the V2 pricing sweep')
  console.log(`Sweeping ${client.baseUrl} (env ${envFile}) at <= ${client.rpm} req/min`)

  // --- Pass 1: default grid + one-at-a-time option swaps ---------------------
  const passOne: PriceRequestItem[] = []
  const passOneKeys: string[] = []
  for (const plan of plans) {
    const groupSets = groupOptionIdSets(plan.sub)
    for (const size of plan.grid) {
      passOne.push({ subcategoryId: plan.sub.subcategoryId, size: { width: size.width, height: size.height }, options: plan.defaults })
      passOneKeys.push(`base|${plan.sub.subcategoryId}|${size.label}`)
    }
    for (const swap of plan.swaps) {
      const options = swapInto(plan.defaults, groupSets.get(swap.groupKey) ?? new Set(), swap.optionId)
      passOne.push({ subcategoryId: plan.sub.subcategoryId, size: { width: swap.size.width, height: swap.size.height }, options })
      passOneKeys.push(`swap|${plan.sub.subcategoryId}|${swap.size.label}|${swap.optionId}`)
    }
  }
  const passOneBatch = await priceAll(client, passOne, 'pass1')
  const passOneRows = passOneBatch.rows
  const rowByKey = new Map<string, PriceRow>()
  const itemByKey = new Map<string, PriceRequestItem>()
  passOneKeys.forEach((key, i) => {
    rowByKey.set(key, passOneRows[i] ?? { success: false, message: 'no response row' })
    itemByKey.set(key, passOne[i])
  })

  // --- F36: subcategories this environment will not price at all ---------------
  //
  // A subcategory whose ENTIRE default-set grid comes back unpriced — after the retry
  // — is not something the run can assert anything about: every option swap and every
  // configuration below it is measured against a base price that does not exist. It is
  // classified once, its assertions are counted as SKIPPED rather than failed, and the
  // provider's own words are recorded. This is a statement about this host, not about
  // the catalog row: a profile the sandbox will not price may price on production, and
  // must be verified there before it is enabled.
  const unpriceable = new Map<number, string>()
  for (const plan of plans) {
    if (plan.grid.length === 0) continue
    const id = plan.sub.subcategoryId
    const priced = plan.grid.filter((size) => apiTotalCents(rowByKey.get(`base|${id}|${size.label}`)) !== null).length
    if (priced === 0) {
      unpriceable.set(id, unpricedReason(rowByKey.get(`base|${id}|${plan.grid[0].label}`)))
    }
  }

  // --- Pass 2: the maximal distinct-group configuration + the glass edge ------
  interface MaximalPlan {
    plan: SubcategoryPlan
    size: { width: number; height: number; label: string }
    options: number[]
    /** Groups swapped, with the delta each contributed at this size. */
    parts: Array<{ groupKey: string; optionId: number; deltaCents: number }>
    baseCents: number
  }
  const maximal: MaximalPlan[] = []
  const glassEdges: Array<{ plan: SubcategoryPlan; size: { width: number; height: number; label: string }; options: number[]; matOptionId: number; matIn: number }> = []
  const passTwo: PriceRequestItem[] = []
  const passTwoKinds: Array<{ kind: 'maximal'; index: number } | { kind: 'glass'; index: number }> = []

  for (const plan of plans) {
    const groupSets = groupOptionIdSets(plan.sub)
    const sizes = plan.representative.length > 2
      ? [plan.representative[0], plan.representative[plan.representative.length - 1]]
      : plan.representative
    for (const size of sizes) {
      const baseCents = apiTotalCents(rowByKey.get(`base|${plan.sub.subcategoryId}|${size.label}`))
      if (baseCents === null) continue
      const parts: MaximalPlan['parts'] = []
      let options = [...plan.defaults]
      for (const group of plan.sub.optionGroups ?? []) {
        const groupKey = canonicalGroupKey(group.optionGroup)
        let best: { optionId: number; deltaCents: number } | null = null
        for (const option of group.optionGroupItems) {
          if (plan.defaults.includes(option.optionId)) continue
          const swapCents = apiTotalCents(rowByKey.get(`swap|${plan.sub.subcategoryId}|${size.label}|${option.optionId}`))
          if (swapCents === null) continue
          const deltaCents = swapCents - baseCents
          if (!best || deltaCents > best.deltaCents || (deltaCents === best.deltaCents && option.optionId < best.optionId)) {
            best = { optionId: option.optionId, deltaCents }
          }
        }
        if (!best) continue
        options = swapInto(options, groupSets.get(groupKey) ?? new Set(), best.optionId)
        parts.push({ groupKey, optionId: best.optionId, deltaCents: best.deltaCents })
      }
      // Additivity is only a question for a configuration spanning >= 2 groups (P14).
      if (parts.length < 2) continue
      passTwoKinds.push({ kind: 'maximal', index: maximal.length })
      maximal.push({ plan, size, options, parts, baseCents })
      passTwo.push({ subcategoryId: plan.sub.subcategoryId, size: { width: size.width, height: size.height }, options })
    }

    if (plan.categoryId === 105) {
      const matGroup = (plan.sub.optionGroups ?? []).find((group) => canonicalGroupKey(group.optionGroup) === 'mat_size')
      const mat = matGroup?.optionGroupItems.find((option) => /^5(\.0)?\s*inch/i.test(option.optionName))
      const maxW = num(plan.sub.maximumWidth)
      const maxH = num(plan.sub.maximumHeight)
      // The edge case is the LARGEST in-bounds print (the published bounds themselves)
      // plus the widest mat: its glass is print + 2 x 5in per axis, which cannot fit the
      // ceiling in either orientation. The standard grid stops well short of the bounds,
      // and the engine's bounds test is orientation-aware (a 40x50 glass "fits" a 60x40
      // ceiling rotated), so a grid size would not put the rule under any pressure.
      const edgeSize = { width: maxW, height: maxH, label: `${maxW}x${maxH}` }
      const glassW = edgeSize.width + 10
      const glassH = edgeSize.height + 10
      const glassFitsEitherWay = (glassW <= maxW && glassH <= maxH) || (glassH <= maxW && glassW <= maxH)
      if (mat && !glassFitsEitherWay) {
        const options = swapInto(plan.defaults, groupOptionIdSets(plan.sub).get('mat_size') ?? new Set(), mat.optionId)
        passTwoKinds.push({ kind: 'glass', index: glassEdges.length })
        glassEdges.push({ plan, size: edgeSize, options, matOptionId: mat.optionId, matIn: 5 })
        passTwo.push({ subcategoryId: plan.sub.subcategoryId, size: { width: edgeSize.width, height: edgeSize.height }, options })
      } else {
        log.skip(
          `${plan.sub.subcategoryId} glass-ceiling edge`,
          mat
            ? 'the widest mat on the largest in-bounds print still fits the ceiling in some orientation'
            : 'the subcategory has no 5in mat option',
        )
      }
    }
  }

  const passTwoBatch = passTwo.length
    ? await priceAll(client, passTwo, 'pass2')
    : { rows: [] as PriceRow[], retried: 0, recovered: 0, passes: [] as string[] }
  const passTwoRows = passTwoBatch.rows
  const maximalRows = new Map<number, PriceRow>()
  const glassRows = new Map<number, PriceRow>()
  passTwoKinds.forEach((kind, i) => {
    const row = passTwoRows[i] ?? { success: false, message: 'no response row' }
    if (kind.kind === 'maximal') maximalRows.set(kind.index, row)
    else glassRows.set(kind.index, row)
  })

  // --- Assertions ------------------------------------------------------------
  const perSub = new Map<number, { sizes: number; options: number; additiveOk: number; additiveTotal: number; recorded: number; edge: string }>()
  for (const plan of plans) {
    perSub.set(plan.sub.subcategoryId, {
      sizes: plan.grid.length,
      options: new Set(plan.swaps.map((s) => s.optionId)).size,
      additiveOk: 0,
      additiveTotal: 0,
      recorded: 0,
      edge: plan.categoryId === 105 ? 'not measured' : 'n/a',
    })
  }

  /** Ids the provider accepted but never echoed, per subcategory (summarised below). */
  const neverEchoed = new Map<number, Set<number>>()

  /**
   * F37, per subcategory: priced items that came back silent after every retry pass, in
   * a subcategory that DID price other items in the same run. Counted here and reported
   * once per subcategory below, so 273 identical SKIPPED lines cannot hide the reason.
   */
  const f37Drops = new Map<number, number>()

  /**
   * F35: the Canvas Finish group (212 Semi-Glossy / 213 Matte, 259 on the 1.25in
   * depths) is accepted by pricing — no rejection, no "not associated to subcategory"
   * — and never appears in the echoed options. Measured on the sweep and again on a
   * direct defaults probe. It is therefore exempt from the echo assertion and recorded
   * once per subcategory instead: the group is real, but pricing cannot confirm it was
   * applied, so nothing about it can be verified this way.
   */
  const finishOptionIds = new Map<number, Set<number>>()
  for (const plan of plans) {
    const group = (plan.sub.optionGroups ?? []).find(
      (candidate) => canonicalGroupKey(candidate.optionGroup) === 'canvas_finish',
    )
    if (group) finishOptionIds.set(plan.sub.subcategoryId, new Set(group.optionGroupItems.map((o) => o.optionId)))
  }
  const finishNotEchoed = new Map<number, Set<number>>()

  /** Every priced item must succeed, cost money, and echo back what was requested. */
  function assertPriced(key: string, what: string, context: Record<string, unknown>): number | null {
    const row = rowByKey.get(key) ?? null
    const item = itemByKey.get(key)
    if (!row || row.success !== true) {
      const droppedSubcategoryId = Number(context.subcategoryId)
      const dropped = isSandboxDrop(row) && Number.isFinite(droppedSubcategoryId)
      if (dropped) f37Drops.set(droppedSubcategoryId, (f37Drops.get(droppedSubcategoryId) ?? 0) + 1)
      // Default: a silent drop is not a verdict about this configuration, so its two
      // assertions are skipped and counted once per subcategory below. --strict judges
      // it, which can only ever make the run redder.
      if (dropped && !strictDrops) return null
      log.fail(
        `${what} prices`,
        `not priced after ${retryPasses} retry pass(es): ${unpricedReason(row)}${dropped ? ' — classified F37 (per-item sandbox drop), counted as FAILED because --strict was passed' : ''}`,
        context,
      )
      return null
    }
    if (!(typeof row.price === 'number' && row.price > 0)) {
      log.fail(`${what} prices`, `price is ${String(row.price)}, expected > 0`, context)
      return null
    }
    log.check(true, `${what} prices`, 'success true and price > 0')
    const echoed = new Map((row.options ?? []).map((option) => [option.optionId, option.price]))
    const allMissing = (item?.options ?? []).filter((id) => typeof echoed.get(id) !== 'number')
    const subcategoryId = typeof row.subcategoryId === 'number' ? row.subcategoryId : null
    const finishIds = subcategoryId === null ? undefined : finishOptionIds.get(subcategoryId)
    const missingFinish = finishIds ? allMissing.filter((id) => finishIds.has(id)) : []
    const missing = finishIds ? allMissing.filter((id) => !finishIds.has(id)) : allMissing
    if (subcategoryId !== null && missingFinish.length > 0) {
      const bucket = finishNotEchoed.get(subcategoryId) ?? new Set<number>()
      for (const id of missingFinish) bucket.add(id)
      finishNotEchoed.set(subcategoryId, bucket)
    }
    if (subcategoryId !== null && missing.length > 0) {
      const bucket = neverEchoed.get(subcategoryId) ?? new Set<number>()
      for (const id of missing) bucket.add(id)
      neverEchoed.set(subcategoryId, bucket)
    }
    log.check(
      missing.length === 0,
      `${what} echoes every requested option with a price (Canvas Finish exempt, F35)`,
      missing.length === 0 ? 'all requested options echoed' : `not echoed with a numeric price: ${missing.join(',')}`,
      context,
    )
    return cents(row.price)
  }

  for (const plan of plans) {
    const id = plan.sub.subcategoryId
    if (unpriceable.has(id)) {
      // Two assertions per item (it prices, and it echoes what was requested).
      log.skipMany(
        (plan.grid.length + plan.swaps.length) * 2,
        `${id} pricing assertions`,
        `UNPRICEABLE (this environment): the whole default-set grid came back unpriced after a retry — ${unpriceable.get(id)}`,
      )
      continue
    }
    for (const size of plan.grid) {
      assertPriced(`base|${id}|${size.label}`, `${id} ${size.label} default set`, { subcategoryId: id, size: size.label, options: plan.defaults })
    }
    for (const swap of plan.swaps) {
      assertPriced(
        `swap|${id}|${swap.size.label}|${swap.optionId}`,
        `${id} ${swap.size.label} option ${swap.optionId} (${swap.optionName})`,
        { subcategoryId: id, size: swap.size.label, optionId: swap.optionId },
      )
    }
  }

  const additivityRows: Array<Array<string | number>> = []
  maximal.forEach((config, index) => {
    const row = maximalRows.get(index)
    const apiCents = apiTotalCents(row)
    const record = perSub.get(config.plan.sub.subcategoryId)!
    const predicted = config.baseCents + config.parts.reduce((total, part) => total + part.deltaCents, 0)
    const asserted = ADDITIVE_CATEGORIES.has(config.plan.categoryId)
    if (apiCents === null) {
      log.fail(
        `${config.plan.sub.subcategoryId} ${config.size.label} maximal configuration prices`,
        `not priced after a retry: ${unpricedReason(row)}`,
        { options: config.options },
      )
      return
    }
    record.additiveTotal += 1
    const additive = apiCents === predicted
    if (additive) record.additiveOk += 1
    additivityRows.push([
      config.plan.sub.subcategoryId,
      config.size.label,
      config.parts.length,
      (config.baseCents / 100).toFixed(2),
      (predicted / 100).toFixed(2),
      (apiCents / 100).toFixed(2),
      ((apiCents - predicted) / 100).toFixed(2),
      additive ? 'additive' : 'NOT additive',
      asserted ? 'asserted' : 'recorded (F26)',
    ])
    const detail = `base ${config.baseCents} + deltas [${config.parts.map((p) => p.deltaCents).join(', ')}] = ${predicted}; api ${apiCents}`
    if (asserted) {
      log.check(additive, `${config.plan.sub.subcategoryId} ${config.size.label} whole-config additivity`, detail, {
        options: config.options,
      })
    } else {
      record.recorded += 1
      log.note(
        `RECORDED (not asserted, F26): ${config.plan.sub.subcategoryId} ${config.size.label} ${additive ? 'additive' : 'NOT additive'} — ${detail}`,
      )
    }
  })

  // --- Glass ceiling: the provider prices it, the engine must refuse it -------
  // The engine is stricter than the provider on purpose: pricing enforces no geometry
  // at all (P4/F31), so this pair of observations is the whole point of the edge case.
  const tree = assembleCatalog(rowSetFromSnapshot(snapshot), { includeDisabled: true }) as Catalog

  glassEdges.forEach((edge, index) => {
    const record = perSub.get(edge.plan.sub.subcategoryId)!
    const row = glassRows.get(index)
    const apiCents = apiTotalCents(row)
    record.edge = apiCents === null ? `not priced (${unpricedReason(row)})` : `provider priced $${(apiCents / 100).toFixed(2)}`
    log.note(
      `RECORDED: ${edge.plan.sub.subcategoryId} ${edge.size.label} print + ${edge.matIn}in mat (glass ${edge.size.width + 2 * edge.matIn} x ${edge.size.height + 2 * edge.matIn}in, bounds ${num(edge.plan.sub.maximumWidth)} x ${num(edge.plan.sub.maximumHeight)}in) — ${record.edge}. The provider enforces nothing geometric (P4/F31).`,
    )

    const assertion = `${edge.plan.sub.subcategoryId} ${edge.size.label} + ${edge.matIn}in mat is rejected by the rules engine`
    const subcategory = tree.subcategories.find((candidate) => candidate.subcategory_id === edge.plan.sub.subcategoryId)
    if (!subcategory) {
      log.fail(assertion, 'the tree assembled from the snapshot has no row for this subcategory', {
        subcategoryId: edge.plan.sub.subcategoryId,
      })
      return
    }
    const codes = evaluateSelection(
      subcategory,
      { widthIn: edge.size.width, heightIn: edge.size.height },
      edge.options,
    ).violations.map((violation) => violation.code)
    log.check(
      codes.includes('glass_ceiling'),
      assertion,
      `violations: [${codes.join(', ')}] (expected to include glass_ceiling)`,
      { subcategoryId: edge.plan.sub.subcategoryId, size: edge.size.label, options: edge.options },
    )
  })

  // F37, once per subcategory: how much of it this host dropped, and how that was read.
  for (const [subcategoryId, dropped] of [...f37Drops.entries()].sort((a, b) => a[0] - b[0])) {
    const plan = plans.find((candidate) => candidate.sub.subcategoryId === subcategoryId)
    const total = (plan?.grid.length ?? 0) + (plan?.swaps.length ?? 0)
    if (!strictDrops) {
      // Two assertions per dropped item (it prices, and it echoes what was requested).
      log.skipMany(
        dropped * 2,
        `${subcategoryId} pricing assertions`,
        `FINDING F37 (per-item sandbox drop): ${dropped} of ${total} priced item(s) came back success:false with no message after ${retryPasses} retry pass(es)`,
      )
    }
    log.note(
      `FINDING F37: ${subcategoryId} "${plan?.sub.name ?? ''}" dropped ${dropped} of ${total} priced item(s) on ${client.host} — a silent success:false in a subcategory that priced other items in the same run, which is throughput and not capability (the same configuration prices on its own moments later). ${strictDrops ? 'Counted as FAILED in this run (--strict).' : 'Counted as SKIPPED, never as passed; re-run with --strict, or on the production host, to judge them.'}`,
    )
  }

  // F36, once per subcategory: a classification, not a failure.
  for (const [subcategoryId, reason] of unpriceable) {
    const plan = plans.find((candidate) => candidate.sub.subcategoryId === subcategoryId)
    log.note(
      `FINDING F36: ${subcategoryId} "${plan?.sub.name ?? ''}" UNPRICEABLE (this environment) — 0 of ${plan?.grid.length ?? 0} in-bounds default-set sizes priced on ${client.host}, even after a retry. Provider's answer: ${reason}. Its option and configuration assertions were SKIPPED, not failed; verify this profile on the production host before enabling it.`,
    )
  }

  // F35, once per subcategory: recorded, never counted against the step.
  for (const [subcategoryId, ids] of finishNotEchoed) {
    log.note(
      `FINDING F35: ${subcategoryId} Canvas Finish option ids [${[...ids].sort((a, b) => a - b).join(', ')}] are accepted by pricing but never echoed; cannot be verified through pricing. Exempt from the echo assertion, not a failure.`,
    )
  }

  // One line per subcategory for ids the provider accepted (success true) but never
  // echoed: a catalog row we would offer and charge for that pricing does not confirm.
  if (neverEchoed.size > 0) {
    for (const [subcategoryId, ids] of neverEchoed) {
      log.note(
        `FINDING: ${subcategoryId} accepted option ids [${[...ids].sort((a, b) => a - b).join(', ')}] without echoing them in any pricing response. The provider neither rejects nor prices them, so the catalog cannot prove they were applied.`,
      )
    }
  }

  // --- Report ----------------------------------------------------------------
  const summary = client.printSummary('sweep ')
  const finishedAt = nowIso()

  const subcategoryTable: StepTable = {
    title: 'Per subcategory',
    columns: ['subcategory', 'medium', 'sizes priced', 'options priced', 'additive ok/total', 'recorded (105)', 'glass-ceiling edge', 'sizes dropped (out of bounds)'],
    rows: plans.map((plan) => {
      const record = perSub.get(plan.sub.subcategoryId)!
      return [
        plan.sub.subcategoryId,
        MEDIUM_BY_CATEGORY[plan.categoryId] ?? String(plan.categoryId),
        record.sizes,
        record.options,
        `${record.additiveOk}/${record.additiveTotal}`,
        record.recorded,
        record.edge,
        plan.dropped.length ? plan.dropped.join(' ') : 'none',
      ]
    }),
  }
  const unpriceableTable: StepTable = {
    title: 'Not priceable in this environment (F36)',
    columns: ['subcategory', 'medium', 'name', 'in-bounds sizes tried', 'assertions skipped', "provider's answer"],
    rows: [...unpriceable.entries()].map(([subcategoryId, reason]) => {
      const plan = plans.find((candidate) => candidate.sub.subcategoryId === subcategoryId)
      return [
        subcategoryId,
        MEDIUM_BY_CATEGORY[categoryOf(subcategoryId)] ?? '',
        plan?.sub.name ?? '',
        plan?.grid.length ?? 0,
        ((plan?.grid.length ?? 0) + (plan?.swaps.length ?? 0)) * 2,
        reason,
      ]
    }),
  }
  const additivityTable: StepTable = {
    title: 'Whole-configuration additivity',
    columns: ['subcategory', 'size', 'groups', 'base $', 'predicted $', 'api $', 'diff $', 'verdict', 'treatment'],
    rows: additivityRows,
  }

  const f37Total = [...f37Drops.values()].reduce((total, count) => total + count, 0)
  if (strictDrops && log.failed > 0 && log.failed === f37Total) {
    log.note(
      `DIAGNOSIS (cause class: sandbox-drop): all ${log.failed} failure(s) in this run are F37 per-item drops — a silent success:false with no provider message, in subcategories that priced other items in the same run. Nothing here is a statement about a catalog row. Re-run without --strict to see the same run classified, or sweep the production host to judge these profiles.`,
    )
  }

  const retried = passOneBatch.retried + passTwoBatch.retried
  const recovered = passOneBatch.recovered + passTwoBatch.recovered
  if (retried > 0) {
    log.note(
      `RETRY: ${retried} item(s) came back unpriced on the first pass and ${recovered} priced on a later pass. Only the ${retried - recovered} still unpriced at the end were judged. Passes: ${passOneBatch.passes.concat(passTwoBatch.passes).join(' · ')}.`,
    )
  }
  // What the provider said about its own budget while all this was happening: a silent
  // success:false under sustained load is worth correlating with a shrinking remaining.
  const remainings = client.records
    .map((record) => Number(record.headers?.['x-ratelimit-remaining']))
    .filter((value) => Number.isFinite(value))
  if (remainings.length > 0) {
    log.note(
      `Provider budget headers over ${remainings.length} response(s): x-ratelimit-remaining min ${Math.min(...remainings)}, last ${remainings[remainings.length - 1]}.`,
    )
  }
  log.note(
    `Default option sets came from src/lib/catalog/seed-rules.ts (pickSeededDefault), keyed on provider NAMES and never [] (an empty array resolves to Image Wrap / 0.25in bleed — P15).`,
  )
  log.note(`Sizes outside a subcategory's published bounds are documented drops, not failures (see the per-subcategory table).`)

  const { green, jsonPath, mdPath } = writeStepResult({
    step: 'V2',
    title: 'Full-matrix sandbox pricing sweep (additivity + glass-ceiling edge)',
    startedAt,
    finishedAt,
    commit: gitCommit(),
    host: client.host,
    counts: log.counts,
    failures: log.failures as StepFailure[],
    notes: log.notes,
    tables: unpriceable.size > 0
      ? [subcategoryTable, unpriceableTable, additivityTable]
      : [subcategoryTable, additivityTable],
    meta: {
      snapshot: path.relative(REPO_ROOT, snapshotPath),
      snapshotCapturedAt: snapshot.capturedAt,
      subcategories: plans.map((plan) => plan.sub.subcategoryId),
      sizes: [...wantedSizes],
      itemsPriced: passOne.length + passTwo.length,
      itemsRetried: retried,
      itemsRecoveredByRetry: recovered,
      unpriceableSubcategories: [...unpriceable.keys()],
      retryPasses,
      strict: strictDrops,
      itemsDroppedF37: f37Total,
      f37Subcategories: Object.fromEntries([...f37Drops.entries()].map(([id, count]) => [String(id), count])),
      requestsEstimated: estimate,
      requestsSent: summary.requestCount,
      peakPerRolling60s: summary.peakPerRolling60s,
      wallMs: summary.wallMs,
    },
  })

  console.log('')
  console.log(log.summaryLine('V2'))
  if (retried > 0) console.log(`retried ${retried} unpriced item(s); ${recovered} recovered`)
  if (unpriceable.size > 0) {
    console.log(`UNPRICEABLE on ${client.host} (F36): ${[...unpriceable.keys()].join(', ')}`)
  }
  if (f37Total > 0) {
    console.log(
      `per-item drops (F37): ${f37Total} across ${f37Drops.size} subcategory(ies) — ${strictDrops ? 'FAILED (--strict)' : 'SKIPPED and counted'}`,
    )
  }
  console.log(`items priced: ${passOne.length + passTwo.length} · requests sent: ${summary.requestCount} (estimated ${estimate})`)
  console.log(`Wrote ${path.relative(REPO_ROOT, jsonPath)} and ${path.relative(REPO_ROOT, mdPath)}`)
  return green ? 0 : 1
}

// ---------------------------------------------------------------------------
// --raw — one call, printed verbatim
// ---------------------------------------------------------------------------

/**
 * Price ONE item and print everything the provider said about it.
 *
 * When a sweep reports that a subcategory prices nothing, the first question is whether
 * the provider refused it or the harness never asked properly. This mode answers that
 * with evidence rather than reasoning: the exact request body, the HTTP status, the raw
 * response text, and an explicit verdict on whether the response array contains a row
 * for the item (an absence) or a row that says it failed (a refusal).
 */
async function runRaw(args: Args): Promise<number> {
  const subcategoryId = Number(args.raw)
  const width = Number(args._[0])
  const height = Number(args._[1])
  if (!Number.isFinite(subcategoryId) || !Number.isFinite(width) || !Number.isFinite(height)) {
    console.error('--raw needs <subcategoryId> <width> <height>')
    return 2
  }
  const snapshotArg = str(args.snapshot, '')
  if (!snapshotArg) {
    console.error('--raw needs --snapshot <fixture.json> (the default option set comes from it)')
    return 2
  }
  const snapshot = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, snapshotArg), 'utf8')) as Snapshot
  let target: SnapshotSubcategory | null = null
  for (const category of snapshot.categories) {
    for (const sub of category.subcategories) if (sub.subcategoryId === subcategoryId) target = sub
  }
  if (!target) {
    console.error(`The snapshot has no subcategory ${subcategoryId}.`)
    return 2
  }

  const { client, envFile } = clientFromEnv({
    envFile: str(args.env, '.env.luma'),
    rpm: 25,
  }) as unknown as { client: Probe; envFile: string }
  client.assertSandbox('a raw pricing probe')

  const item: PriceRequestItem = {
    subcategoryId,
    size: { width, height },
    options: defaultOptionIdsFor(target),
  }
  console.log(`host: ${client.baseUrl} (env ${envFile})`)
  console.log(`subcategory: ${subcategoryId} "${target.name}" bounds ${num(target.minimumWidth)}-${num(target.maximumWidth)} x ${num(target.minimumHeight)}-${num(target.maximumHeight)} in, ${target.requiredDPI} DPI`)
  console.log(`request body: ${JSON.stringify([item])}`)

  const record = await client.priceBatch([item], 'raw')
  console.log(`HTTP ${record.status}`)
  console.log('raw body:')
  console.log(record.rawText.length > 1500 ? `${record.rawText.slice(0, 1500)}\n… [trimmed, ${record.rawText.length} chars total]` : record.rawText)

  const body = record.body
  if (!Array.isArray(body)) {
    console.log('verdict: the response is not an array, so there is no row for this item.')
  } else if (body.length === 0) {
    console.log('verdict: the response array is EMPTY — the row for this item is ABSENT, not a failure.')
  } else {
    const row = body[0] as PriceRow
    const matches = row.subcategoryId === subcategoryId
    console.log(
      `verdict: the response array holds ${body.length} row(s); the first ${matches ? 'IS' : 'is NOT'} for subcategory ${subcategoryId}. ` +
        `success=${String(row.success)} price=${String(row.price)} message=${row.message === undefined ? '(none)' : JSON.stringify(row.message)}. ` +
        `${row.success === true ? 'Priced.' : 'Present but NOT priced: a refusal, not an absence.'}`,
    )
  }
  return 0
}

// ---------------------------------------------------------------------------
// V6.1 — legacy parity
// ---------------------------------------------------------------------------

interface VariantRow {
  id: string
  product_id: string | null
  name: string | null
  medium: string | null
  size_label: string | null
  width_in: number | null
  height_in: number | null
  price: number | null
  lumaprints_cost_cents: number | null
  shipping_cost_cents: number | null
  margin_override_pct: number | null
  manual_price_override_cents: number | null
  variant_type: string | null
  is_active: boolean | null
  studio_only: boolean | null
}

/**
 * The margin cascade of src/lib/pricing/margin.ts, replicated here — the one replica
 * left in this file — because that module imports the Next-only supabase server client
 * and cannot be loaded by a plain-node script even through the resolve hook.
 *
 * This function mirrors `resolveEffectiveProductMargin` exactly: the same
 * most-granular-wins order (product > category > site > 100), the same treatment of
 * null and non-finite values as "inherit the next level down", and the same
 * SITE_MARGIN_FALLBACK of 100. The variant's own override is applied one level up,
 * inside customerPriceCents, which IS imported from the real module. If margin.ts ever
 * loses its server-client import, delete this and import it.
 */
const SITE_MARGIN_FALLBACK = 100
function resolveEffectiveProductMargin(
  productMargin: number | null | undefined,
  categoryMargin: number | null | undefined,
  siteMargin: number | null | undefined,
): number {
  const clean = (value: unknown): number | null => {
    if (value == null) return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return clean(productMargin) ?? clean(categoryMargin) ?? clean(siteMargin) ?? SITE_MARGIN_FALLBACK
}

async function readAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await client.from(table).select(columns).range(from, from + page - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const batch = (data ?? []) as unknown as T[]
    rows.push(...batch)
    if (batch.length < page) break
  }
  return rows
}

async function runParity(args: Args): Promise<number> {
  const startedAt = nowIso()
  const log = new AssertionLog()

  loadEnvFile('.env.local')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Parity needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).')
    return 2
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const dbHost = new URL(url).host
  console.log(`V6.1 parity against ${dbHost} (read-only) for host ${PRODUCTION_HOST}`)

  // --- Catalog tree for the production host ---------------------------------
  const subcategoryRows = (
    await readAll<CatalogSubcategoryRow>(db, 'lumaprints_subcategories', '*')
  ).filter((row) => row.api_host === PRODUCTION_HOST)
  const allGroups = await readAll<CatalogOptionGroupRow>(db, 'lumaprints_option_groups', '*')
  const allOptions = await readAll<CatalogOptionRow>(db, 'lumaprints_options', '*')
  const mediumRows = await readAll<{ medium: string; enabled: boolean; subcategory_id: number | null; option_ids: number[] | null }>(
    db,
    'lumaprints_mediums',
    'medium, enabled, subcategory_id, option_ids',
  )

  const subRefs = new Set(subcategoryRows.map((row) => row.id))
  const groups = allGroups.filter((row) => subRefs.has(row.subcategory_ref))
  const groupRefs = new Set(groups.map((row) => row.id))
  const options = allOptions.filter((row) => groupRefs.has(row.group_ref))

  let tree: Catalog | null = null
  if (subcategoryRows.length === 0) {
    log.note(`The production catalog has no rows for ${PRODUCTION_HOST}: sync v2 has not run against production yet.`)
  } else {
    tree = assembleCatalog(
      {
        host: PRODUCTION_HOST,
        mediums: mediumRows.map((row) => ({ medium: row.medium, enabled: row.enabled === true })),
        subcategories: subcategoryRows,
        groups,
        options,
      },
      { includeDisabled: true },
    ) as Catalog
  }

  // One diagnosis instead of N identical failures: if no option row carries is_default,
  // the §4.3 backfill that seeds today's live configuration has not run on this host and
  // every default-set comparison below fails for that one reason.
  const seededDefaults = options.filter((row) => row.is_default === true).length
  const enabledSubcategories = subcategoryRows.filter((row) => row.enabled === true).length
  if (subcategoryRows.length > 0 && seededDefaults === 0) {
    log.note(
      `DIAGNOSIS (cause class: catalog-structure-synced-but-not-seeded): 0 of ${options.length} option rows on ${PRODUCTION_HOST} carry is_default and ${enabledSubcategories} of ${subcategoryRows.length} subcategories are enabled. Sync v2 has written the structure, but the backfill that seeds today's live configuration (plan §4.3) has not run against this host, so every "default option set" assertion below fails for that single reason. Seed it, then re-run.`,
    )
  }

  // Default filling comes from the rules engine itself, not a replica: a parity run
  // that re-implemented the cascade would be comparing the legacy config against this
  // script rather than against the engine the storefront will actually use.
  const defaultsFor = (subcategory: CatalogSubcategory): number[] =>
    [...engineDefaultOptionIds(subcategory)].sort((a, b) => a - b)
  log.note('Default option sets were computed by src/lib/catalog/rules.ts (defaultOptionIds).')

  // --- Variants and the margin chain ----------------------------------------
  const variantColumns =
    'id, product_id, name, medium, size_label, width_in, height_in, price, lumaprints_cost_cents, shipping_cost_cents, margin_override_pct, manual_price_override_cents, variant_type, is_active, studio_only'
  const allVariants = await readAll<VariantRow>(db, 'product_variants', variantColumns)
  const variants = allVariants.filter(
    (row) =>
      row.is_active === true &&
      row.medium !== null &&
      row.medium !== undefined &&
      row.variant_type !== 'original' &&
      row.studio_only !== true,
  )

  const products = await readAll<{ id: string; default_margin_pct: number | null; category_id: string | null }>(
    db,
    'products',
    'id, default_margin_pct, category_id',
  )
  const categories = await readAll<{ id: string; default_margin_pct: number | null }>(
    db,
    'categories',
    'id, default_margin_pct',
  )
  const { data: settings } = await db.from('site_settings').select('default_margin_pct').eq('id', true).maybeSingle()
  const siteMargin = (settings as { default_margin_pct: number | null } | null)?.default_margin_pct ?? null
  const productById = new Map(products.map((row) => [row.id, row]))
  const categoryById = new Map(categories.map((row) => [row.id, row]))

  const legacyByMedium = new Map(mediumRows.map((row) => [row.medium, row]))
  const byMedium = new Map<string, { variants: number; priceOk: number; defaultsOk: number; subcategoryOk: number }>()

  for (const variant of variants) {
    const medium = String(variant.medium)
    const tally = byMedium.get(medium) ?? { variants: 0, priceOk: 0, defaultsOk: 0, subcategoryOk: 0 }
    tally.variants += 1
    byMedium.set(medium, tally)

    const legacy = legacyByMedium.get(medium)
    const label = `${medium} ${variant.size_label ?? '?'} (${variant.id.slice(0, 8)})`

    // (1) + (2): the catalog reproduces the legacy configuration exactly.
    if (!legacy || legacy.subcategory_id === null) {
      log.skip(`${label} catalog configuration`, `lumaprints_mediums has no subcategory_id for "${medium}"`)
    } else if (!tree) {
      log.skip(`${label} catalog configuration`, `no ${PRODUCTION_HOST} catalog rows to compare against`)
    } else {
      const subcategory = tree.subcategories.find((row) => row.subcategory_id === legacy.subcategory_id)
      if (!subcategory) {
        log.fail(
          `${label} subcategory id matches the legacy config`,
          `no ${PRODUCTION_HOST} catalog row with subcategory_id ${legacy.subcategory_id}`,
          { medium, subcategoryId: legacy.subcategory_id },
        )
        log.skip(`${label} default option set matches the legacy config`, 'the subcategory row is missing')
      } else {
        if (log.check(
          subcategory.subcategory_id === legacy.subcategory_id,
          `${label} subcategory id matches the legacy config`,
          `catalog ${subcategory.subcategory_id} vs legacy ${legacy.subcategory_id}`,
          { medium },
        )) tally.subcategoryOk += 1
        const derived = defaultsFor(subcategory)
        const legacyOptions = [...(legacy.option_ids ?? [])].sort((a, b) => a - b)
        if (log.check(
          sameIds(derived, legacyOptions),
          `${label} default option set matches the legacy config`,
          `catalog [${derived.join(',')}] vs legacy [${legacyOptions.join(',')}]`,
          { medium, subcategoryId: legacy.subcategory_id },
        )) tally.defaultsOk += 1
      }
    }

    // (3) cents-exact price parity through the shared math.
    const product = variant.product_id ? productById.get(variant.product_id) : undefined
    const category = product?.category_id ? categoryById.get(product.category_id) : undefined
    const effectiveMargin = resolveEffectiveProductMargin(
      product?.default_margin_pct,
      category?.default_margin_pct,
      siteMargin,
    )
    const recomputed = customerPriceCents(
      {
        lumaprints_cost_cents: Number(variant.lumaprints_cost_cents ?? 0),
        shipping_cost_cents: Number(variant.shipping_cost_cents ?? 0),
        margin_override_pct: variant.margin_override_pct === null || variant.margin_override_pct === undefined
          ? null
          : Number(variant.margin_override_pct),
        manual_price_override_cents:
          variant.manual_price_override_cents === null || variant.manual_price_override_cents === undefined
            ? null
            : Number(variant.manual_price_override_cents),
      },
      effectiveMargin,
    )
    const stored = cents(Number(variant.price ?? 0))
    if (log.check(
      recomputed === stored,
      `${label} re-prices to the stored price`,
      `recomputed ${recomputed} vs stored ${stored} (cost ${variant.lumaprints_cost_cents}, shipping ${variant.shipping_cost_cents}, margin ${effectiveMargin})`,
      { variantId: variant.id, medium },
    )) tally.priceOk += 1
  }

  // --- Optional live sample against PRODUCTION pricing endpoints -------------
  const sampleArg = args['live-sample']
  const sampleSize = typeof sampleArg === 'string' ? Number(sampleArg) : sampleArg === true ? 1 : 0
  let liveNote = 'live sample: not requested'
  if (Number.isFinite(sampleSize) && sampleSize > 0) {
    let live: Probe | null = null
    try {
      const envFile = str(args['live-env'], '.env.luma.production')
      const built = clientFromEnv({ envFile, rpm: 25 }) as unknown as { client: Probe }
      live = built.client.isSandbox ? null : built.client
      if (!live) liveNote = 'SKIPPED: live sample (configured host is the sandbox, not production)'
    } catch {
      live = null
      liveNote = 'SKIPPED: live sample (no production credentials)'
    }
    if (!live) {
      console.log(liveNote.startsWith('SKIPPED') ? liveNote : `SKIPPED: live sample (no production credentials)`)
      log.skip('live cost parity sample', liveNote.replace(/^SKIPPED: /, ''))
    } else {
      const sample = variants
        .filter((variant) => Number(variant.width_in) > 0 && Number(variant.height_in) > 0)
        .slice(0, Math.trunc(sampleSize))
      for (const variant of sample) {
        const legacy = legacyByMedium.get(String(variant.medium))
        const subcategory = tree?.subcategories.find((row) => row.subcategory_id === legacy?.subcategory_id)
        if (!legacy?.subcategory_id || !subcategory) {
          log.skip(`${variant.id.slice(0, 8)} live cost parity`, 'no catalog subcategory for this medium')
          continue
        }
        const legacyOptions = [...(legacy.option_ids ?? [])].sort((a, b) => a - b)
        const catalogOptions = defaultsFor(subcategory)
        const size = { width: Number(variant.width_in), height: Number(variant.height_in) }
        const record = await live.priceBatch(
          [
            { subcategoryId: legacy.subcategory_id, size, options: legacyOptions },
            { subcategoryId: legacy.subcategory_id, size, options: catalogOptions },
          ],
          'parity-live',
        )
        const body = Array.isArray(record.body) ? (record.body as PriceRow[]) : []
        const legacyCents = apiTotalCents(body[0])
        const catalogCents = apiTotalCents(body[1])
        if (legacyCents === null || catalogCents === null) {
          log.fail(
            `${variant.id.slice(0, 8)} live cost parity`,
            `production pricing did not answer both configurations (HTTP ${record.status})`,
            { variantId: variant.id },
          )
          continue
        }
        log.check(
          legacyCents === catalogCents,
          `${variant.id.slice(0, 8)} live cost parity (legacy set vs catalog defaults)`,
          `legacy ${legacyCents} vs catalog ${catalogCents}`,
          { variantId: variant.id, size },
        )
        const sumOf = (row: PriceRow | undefined): number =>
          cents((row?.options ?? []).reduce((total, option) => total + (typeof option.price === 'number' ? option.price : 0), 0))
        log.check(
          sumOf(body[0]) === sumOf(body[1]),
          `${variant.id.slice(0, 8)} live option-price sums agree`,
          `legacy ${sumOf(body[0])} vs catalog ${sumOf(body[1])}`,
          { variantId: variant.id },
        )
        log.note(
          `INFO drift: ${variant.id.slice(0, 8)} stored cost ${variant.lumaprints_cost_cents} vs live ${legacyCents} (${legacyCents - Number(variant.lumaprints_cost_cents ?? 0)} cents).`,
        )
      }
      liveNote = `live sample: ${sample.length} variant(s) priced on ${live.host}`
      live.printSummary('parity-live ')
    }
  }
  log.note(liveNote)

  const finishedAt = nowIso()
  const mediumTable: StepTable = {
    title: 'Per medium',
    columns: ['medium', 'active print variants', 'price parity ok', 'default set ok', 'subcategory ok'],
    rows: [...byMedium.entries()].map(([medium, tally]) => [
      medium,
      tally.variants,
      tally.priceOk,
      tally.defaultsOk,
      tally.subcategoryOk,
    ]),
  }

  const { green, jsonPath, mdPath } = writeStepResult({
    step: 'V6.1',
    title: 'Legacy parity: every live print variant re-derives and re-prices identically',
    startedAt,
    finishedAt,
    commit: gitCommit(),
    host: dbHost,
    counts: log.counts,
    failures: log.failures as StepFailure[],
    notes: log.notes,
    table: mediumTable,
    meta: {
      catalogHost: PRODUCTION_HOST,
      catalogSubcategoryRows: subcategoryRows.length,
      variantsConsidered: allVariants.length,
      variantsInScope: variants.length,
      catalogOptionRows: options.length,
      catalogOptionRowsWithDefault: seededDefaults,
      catalogSubcategoriesEnabled: enabledSubcategories,
      siteMarginPct: siteMargin,
      liveSample: Number.isFinite(sampleSize) ? sampleSize : 0,
    },
  })

  console.log('')
  console.log(log.summaryLine('V6.1'))
  console.log(`variants in scope: ${variants.length} of ${allVariants.length} · catalog rows for ${PRODUCTION_HOST}: ${subcategoryRows.length}`)
  console.log(`Wrote ${path.relative(REPO_ROOT, jsonPath)} and ${path.relative(REPO_ROOT, mdPath)}`)
  return green ? 0 : 1
}

// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2)) as unknown as Args
  if (args.raw !== undefined && args.raw !== false) return runRaw(args)
  if (args.help === true || args.h === true || (!args.sweep && !args.parity)) {
    console.log(USAGE)
    return args.help === true || args.h === true ? 0 : 2
  }
  if (args.sweep === true && args.parity === true) {
    console.error('Choose one mode: --sweep or --parity.')
    return 2
  }
  return args.sweep === true ? runSweep(args) : runParity(args)
}

process.exitCode = await main()
