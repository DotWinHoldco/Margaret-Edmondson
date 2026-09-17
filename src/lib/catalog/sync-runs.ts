// Authored by DotWin
// Run-row helpers: the small, pure bookkeeping around `catalog_sync_runs`.
//
// A run is the only durable memory a chunked sync has. It is written by one
// serverless invocation and read by the next, minutes later, possibly on another
// machine, so the shapes it carries have to be complete and additive: stats
// accumulate across chunks rather than being recomputed, and the cursor is
// advanced only after the writes of the chunk that earned it.

import { randomUUID } from 'node:crypto'
import type {
  CatalogSyncRunRow,
  SyncCursor,
  SyncDiff,
  SyncStats,
} from '@/lib/catalog/types'
import type { SyncRunInsert } from '@/lib/catalog/store'

export function emptyStats(): SyncStats {
  return {
    requests: 0,
    categories: 0,
    subcategories: 0,
    groups: 0,
    options: 0,
    inserted: 0,
    updated: 0,
    tombstoned: 0,
    chunks: 0,
  }
}

export function emptyDiff(): SyncDiff {
  return {
    newSubcategories: [],
    newGroups: [],
    newOptions: [],
    removedSubcategories: [],
    removedGroups: [],
    removedOptions: [],
    changedBounds: [],
  }
}

/** Fold one chunk's counts into the run's running totals. */
export function addStats(base: SyncStats, delta: Partial<SyncStats>): SyncStats {
  const out = { ...base }
  for (const key of Object.keys(out) as Array<keyof SyncStats>) {
    out[key] = out[key] + (delta[key] ?? 0)
  }
  return out
}

/** Merge a chunk's observations into the accumulated dry-run diff. */
export function mergeDiff(base: SyncDiff, delta: Partial<SyncDiff>): SyncDiff {
  const out = emptyDiff()
  for (const key of Object.keys(out) as Array<keyof SyncDiff>) {
    // Every SyncDiff member is an array of plain records; concatenation is the merge.
    out[key] = [...base[key], ...(delta[key] ?? [])] as never
  }
  return out
}

/** The row a brand-new run starts as: cursor at the first stage, nothing counted. */
export function newRunRow(host: string, dryRun: boolean, startedAt: string = new Date().toISOString()): SyncRunInsert {
  return {
    id: randomUUID(),
    api_host: host,
    status: 'running',
    dry_run: dryRun,
    cursor: { stage: 'categories' },
    stats: emptyStats(),
    diff: dryRun ? emptyDiff() : null,
    error: null,
    started_at: startedAt,
    updated_at: startedAt,
    finished_at: null,
  }
}

export function isTerminal(run: CatalogSyncRunRow): boolean {
  return run.status !== 'running'
}

export function isDone(cursor: SyncCursor): boolean {
  return cursor.stage === 'done'
}

/**
 * Human summary for the admin list. Deliberately counts only: a run row is shown
 * to staff, and provider error text is never rendered from it.
 */
export function describeRun(run: CatalogSyncRunRow): string {
  const s = run.stats
  return `${run.status} · ${s.chunks} chunk(s) · ${s.requests} request(s) · ${s.subcategories} subcategories · ${s.inserted} new · ${s.updated} updated · ${s.tombstoned} tombstoned`
}
