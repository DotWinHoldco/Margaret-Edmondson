// Authored by DotWin
//
// The verification harness's writer: one structured result per V-step of the build
// plan's §10 protocol, written as BOTH `audit/catalog-verification/<step>.json` (what
// the P9 report generator assembles) and `<step>.md` (what a person reads in the PR).
//
// Two rules this file exists to enforce, so no individual script can soften them:
//
//  - A step is green only when `failed === 0`. Not "mostly green", not "green with
//    known issues": the launch gate reads `green` off the JSON and nothing else.
//  - A SKIP is counted and printed, never swallowed. A guard that did not run is not a
//    guard that passed, so `counts.skipped` sits next to `counts.passed` in the JSON,
//    in the Markdown and in the console summary, and every skip carries its reason as
//    a note.
//
// Documented drops (a size outside a subcategory's published bounds, a subcategory the
// run deliberately excluded) are NOT failures and are NOT skips: they are listed in
// `notes` or in a table cell, because the harness chose not to ask the question.
//
// Pure node: no Next, no database, no provider. Relative imports only, so a plain
// `node scripts/<something>.ts` can load it through type stripping.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Repo root, derived from this file's own location (scripts/lib/…). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Where every V-step result lands. The P9 generator reads this directory. */
export const VERIFICATION_DIR = path.join(REPO_ROOT, 'audit', 'catalog-verification')

export interface StepCounts {
  /** passed + failed + skipped. Written by the writer, never by the caller. */
  assertions: number
  passed: number
  failed: number
  skipped: number
}

export interface StepFailure {
  /** What was asserted, in one line ("101002 16x20 default config prices > 0"). */
  assertion: string
  /** The evidence: expected vs actual, ids, raw provider numbers. */
  detail: string
  /** Anything machine-readable a later step may want (subcategory id, size, options). */
  context?: Record<string, unknown>
}

export interface StepTable {
  title?: string
  columns: string[]
  rows: Array<Array<string | number>>
}

export interface StepResultInput {
  /** 'V2', 'V6.1', … — also the file name. */
  step: string
  title: string
  /** ISO timestamps bounding the run. */
  startedAt: string
  finishedAt: string
  /** `git rev-parse HEAD` at run time; a result that cannot name its commit proves nothing. */
  commit: string
  /** The provider or database host the assertions were made against. */
  host: string
  counts: { assertions?: number; passed: number; failed: number; skipped: number }
  failures?: StepFailure[]
  notes?: string[]
  table?: StepTable
  tables?: StepTable[]
  /** Free-form extras the P9 generator may read (request counts, budget, args). */
  meta?: Record<string, unknown>
}

export interface StepResult extends Omit<StepResultInput, 'counts' | 'failures' | 'notes'> {
  counts: StepCounts
  failures: StepFailure[]
  notes: string[]
  /** failed === 0. The only definition of green in this harness. */
  green: boolean
  durationMs: number
  generatedAt: string
}

/** `git rev-parse HEAD`, or 'unknown' outside a checkout (recorded, never guessed). */
export function gitCommit(cwd: string = REPO_ROOT): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function fmtCell(value: string | number): string {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function renderTable(table: StepTable): string {
  const lines: string[] = []
  if (table.title) lines.push('', `### ${table.title}`)
  lines.push('', `| ${table.columns.map(fmtCell).join(' | ')} |`)
  lines.push(`| ${table.columns.map(() => '---').join(' | ')} |`)
  for (const row of table.rows) lines.push(`| ${row.map(fmtCell).join(' | ')} |`)
  return lines.join('\n')
}

function renderMarkdown(result: StepResult): string {
  const { counts } = result
  const lines: string[] = [
    `# ${result.step} — ${result.title}`,
    '',
    `- Status: **${result.green ? 'GREEN' : 'RED'}**`,
    `- Assertions: ${counts.assertions} (passed ${counts.passed}, failed ${counts.failed}, skipped ${counts.skipped})`,
    `- Host: \`${result.host}\``,
    `- Commit: \`${result.commit}\``,
    `- Started: ${result.startedAt}`,
    `- Finished: ${result.finishedAt} (${(result.durationMs / 1000).toFixed(1)}s)`,
  ]

  if (counts.skipped > 0) {
    lines.push('', `> ${counts.skipped} assertion(s) SKIPPED. A skipped guard is no guard: see the notes below.`)
  }

  if (result.notes.length) {
    lines.push('', '## Notes', '')
    for (const note of result.notes) lines.push(`- ${note}`)
  }

  lines.push('', '## Failures', '')
  if (result.failures.length === 0) {
    lines.push('None.')
  } else {
    for (const failure of result.failures) {
      lines.push(`- **${failure.assertion}**`)
      lines.push(`  - ${failure.detail}`)
      if (failure.context) lines.push(`  - context: \`${JSON.stringify(failure.context)}\``)
    }
  }

  const tables = [...(result.table ? [result.table] : []), ...(result.tables ?? [])]
  if (tables.length) {
    lines.push('', '## Results')
    for (const table of tables) lines.push(renderTable(table))
  }

  if (result.meta && Object.keys(result.meta).length) {
    lines.push('', '## Run', '', '```json', JSON.stringify(result.meta, null, 2), '```')
  }

  lines.push('', `Authored by DotWin. Generated by the catalog verification harness.`)
  return lines.join('\n') + '\n'
}

/**
 * Write one step's result. Returns the paths and the green verdict so the caller can
 * set its own exit code from the same number the file records.
 */
export function writeStepResult(input: StepResultInput): {
  green: boolean
  jsonPath: string
  mdPath: string
  result: StepResult
} {
  const passed = Math.max(0, Math.trunc(input.counts.passed))
  const failed = Math.max(0, Math.trunc(input.counts.failed))
  const skipped = Math.max(0, Math.trunc(input.counts.skipped))
  const counts: StepCounts = { assertions: passed + failed + skipped, passed, failed, skipped }

  const startedMs = Date.parse(input.startedAt)
  const finishedMs = Date.parse(input.finishedAt)

  const result: StepResult = {
    ...input,
    counts,
    failures: input.failures ?? [],
    notes: input.notes ?? [],
    green: failed === 0,
    durationMs: Number.isFinite(startedMs) && Number.isFinite(finishedMs) ? Math.max(0, finishedMs - startedMs) : 0,
    generatedAt: new Date().toISOString(),
  }

  fs.mkdirSync(VERIFICATION_DIR, { recursive: true })
  const jsonPath = path.join(VERIFICATION_DIR, `${input.step}.json`)
  const mdPath = path.join(VERIFICATION_DIR, `${input.step}.md`)
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n')
  fs.writeFileSync(mdPath, renderMarkdown(result))

  return { green: result.green, jsonPath, mdPath, result }
}

/**
 * Counter for a run's assertions. Scripts call `pass`/`fail`/`skip` as they go and hand
 * the totals straight to `writeStepResult`, so the printed summary and the written file
 * can never disagree.
 */
export class AssertionLog {
  passed = 0
  failed = 0
  skipped = 0
  readonly failures: StepFailure[] = []
  readonly notes: string[] = []

  /** Record one assertion. Returns `ok` so callers can branch on it. */
  check(ok: boolean, assertion: string, detail: string, context?: Record<string, unknown>): boolean {
    if (ok) this.passed += 1
    else this.fail(assertion, detail, context)
    return ok
  }

  fail(assertion: string, detail: string, context?: Record<string, unknown>): void {
    this.failed += 1
    this.failures.push({ assertion, detail, ...(context ? { context } : {}) })
  }

  /** An assertion the run could not make. Counted, and its reason noted. */
  skip(assertion: string, reason: string): void {
    this.skipped += 1
    this.notes.push(`SKIPPED: ${assertion} — ${reason}`)
  }

  /**
   * Many assertions the run could not make for ONE reason. The count is exact (a
   * skipped guard is still counted as a guard that did not run); the note is written
   * once, because a thousand identical SKIPPED lines hide the reason rather than
   * report it.
   */
  skipMany(count: number, assertion: string, reason: string): void {
    const n = Math.max(0, Math.trunc(count))
    if (n === 0) return
    this.skipped += n
    this.notes.push(`SKIPPED (${n}): ${assertion} — ${reason}`)
  }

  note(text: string): void {
    this.notes.push(text)
  }

  get counts(): { passed: number; failed: number; skipped: number } {
    return { passed: this.passed, failed: this.failed, skipped: this.skipped }
  }

  /** One line for the console, in the same shape the JSON records. */
  summaryLine(step: string): string {
    const total = this.passed + this.failed + this.skipped
    return `${step}: ${total} assertions — passed ${this.passed}, failed ${this.failed}, skipped ${this.skipped} → ${this.failed === 0 ? 'GREEN' : 'RED'}`
  }
}
