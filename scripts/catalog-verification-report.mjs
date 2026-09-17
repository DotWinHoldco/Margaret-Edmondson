#!/usr/bin/env node
// Authored by DotWin
//
// P9 report assembler: audit/CATALOG-VERIFICATION-REPORT.md, generated from the step
// results and nothing else (audit/FULL-CATALOG-BUILD-PLAN.md §10).
//
//   node scripts/catalog-verification-report.mjs [--dir audit/catalog-verification] \
//        [--vitest-json <path>] [--out audit/CATALOG-VERIFICATION-REPORT.md]
//
// What it reads:
//   - every `V*.json` in `--dir`, written by the harness's own `writeStepResult`;
//   - the optional vitest JSON reporter output, which is where V1's counts come from
//     (`npx vitest run --reporter=json --outputFile=<path>`), and from whose per-file
//     results the V5 money-path section is filtered;
//   - `V7.checklist.json`, the one hand-maintained file in the directory: the launch
//     gate's items, each `green`, `owed` or `human`.
//
// What it never does: type a status. A step's status is its own `green` field, a step
// with no file is MISSING rather than assumed, and the GO/NO-GO line is derived from
// those statuses plus the checklist. Because every result carries its own commit and
// host, the header shows whether the steps were run against the same tree: a result
// from an older commit is stale evidence, not a pass.
//
// Pure node: no provider, no database, no network.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The plan's step order. Anything else found in the directory is listed after V6.1. */
const PLAN_ORDER = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6.1', 'V7']

const STEP_TITLES = {
  V1: 'Contract and fixture tests (CI, every PR)',
  V2: 'Full-matrix sandbox pricing sweep',
  V3: 'Geometry sweep (checkImageConfig against the rules engine)',
  V4: 'Sandbox order suite (one maximal-option order per medium)',
  V5: 'Money-path integration tests',
  'V6.1': 'Legacy parity: today’s variants re-derive and re-price identically',
  V7: 'Production launch gate (checklist)',
}

/** Which test files the V5 money-path section is made of. */
const V5_FILE_PATTERN = /checkout|cart|snapshot|router|fulfillment/i

/** At most this many failures are enumerated per step; the rest are counted. */
const MAX_LISTED_FAILURES = 50

const STATUS = { green: 'GREEN', red: 'RED', missing: 'MISSING' }

/** A path a person can read: relative inside the repo, absolute outside it. */
function show(target) {
  const relative = path.relative(REPO_ROOT, target)
  return relative.startsWith('..') ? target : relative
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Every step result file in the directory, keyed by its step name. */
export function readStepResults(dir) {
  const out = new Map()
  let entries = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (!/^V.*\.json$/.test(name) || name === 'V7.checklist.json') continue
    const parsed = readJson(path.join(dir, name))
    if (!parsed || typeof parsed !== 'object') continue
    const step = typeof parsed.step === 'string' && parsed.step.length > 0 ? parsed.step : name.replace(/\.json$/, '')
    out.set(step, { ...parsed, file: name })
  }
  return out
}

/**
 * The vitest JSON reporter's summary, plus its per-file results when it emitted them.
 * V1 counts come from here; `numPendingTests` is the skip count, because a test that
 * did not run is not a test that passed.
 */
export function readVitest(file) {
  if (!file) return null
  const parsed = readJson(file)
  if (!parsed || typeof parsed !== 'object') return null
  const results = Array.isArray(parsed.testResults) ? parsed.testResults : []
  return {
    file,
    total: Number(parsed.numTotalTests ?? 0),
    passed: Number(parsed.numPassedTests ?? 0),
    failed: Number(parsed.numFailedTests ?? 0),
    pending: Number(parsed.numPendingTests ?? 0),
    startedAt: parsed.startTime ? new Date(Number(parsed.startTime)).toISOString() : null,
    files: results.map((result) => ({
      name: String(result.name ?? result.testFilePath ?? ''),
      assertions: Array.isArray(result.assertionResults) ? result.assertionResults : [],
    })),
  }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function sectionFromStepResult(step, result) {
  if (!result) {
    return {
      step,
      status: STATUS.missing,
      counts: null,
      notes: [],
      failures: [],
      source: 'no result file in the directory',
    }
  }
  const counts = result.counts ?? { assertions: 0, passed: 0, failed: 0, skipped: 0 }
  return {
    step,
    status: result.green === true ? STATUS.green : STATUS.red,
    counts,
    notes: Array.isArray(result.notes) ? result.notes : [],
    failures: Array.isArray(result.failures) ? result.failures : [],
    commit: result.commit ?? null,
    host: result.host ?? null,
    finishedAt: result.finishedAt ?? null,
    meta: result.meta ?? null,
    tables: [...(result.table ? [result.table] : []), ...(Array.isArray(result.tables) ? result.tables : [])],
    source: result.file ?? `${step}.json`,
  }
}

function sectionFromVitest(step, vitest, filter) {
  if (!vitest) {
    return {
      step,
      status: STATUS.missing,
      counts: null,
      notes: [],
      failures: [],
      source: 'no vitest JSON reporter output was supplied (--vitest-json)',
    }
  }
  if (!filter) {
    return {
      step,
      status: vitest.failed === 0 ? STATUS.green : STATUS.red,
      counts: { assertions: vitest.total, passed: vitest.passed, failed: vitest.failed, skipped: vitest.pending },
      notes: [
        `Counts are the vitest run's own: ${vitest.total} tests, ${vitest.pending} pending (a pending test is counted as a skip).`,
      ],
      failures: [],
      source: show(vitest.file),
    }
  }

  const matched = vitest.files.filter((entry) => filter.test(entry.name))
  if (matched.length === 0) {
    return {
      step,
      status: STATUS.missing,
      counts: null,
      notes: ['The vitest output lists no per-file results matching the money-path suites; see V1 for the whole run.'],
      failures: [],
      source: show(vitest.file),
    }
  }
  let passed = 0
  let failed = 0
  let skipped = 0
  const failures = []
  for (const entry of matched) {
    for (const assertion of entry.assertions) {
      const status = String(assertion.status ?? '')
      if (status === 'passed') passed += 1
      else if (status === 'failed') {
        failed += 1
        failures.push({
          assertion: `${path.basename(entry.name)} › ${assertion.fullName ?? assertion.title ?? ''}`,
          detail: String((assertion.failureMessages ?? []).join(' | ')).slice(0, 400) || 'no failure message reported',
        })
      } else skipped += 1
    }
  }
  return {
    step,
    status: failed === 0 ? STATUS.green : STATUS.red,
    counts: { assertions: passed + failed + skipped, passed, failed, skipped },
    notes: [`${matched.length} test file(s) matched the money-path filter ${String(filter)}.`],
    failures,
    source: show(vitest.file),
  }
}

function sectionFromChecklist(checklist) {
  if (!checklist || !Array.isArray(checklist.items)) {
    return {
      step: 'V7',
      status: STATUS.missing,
      counts: null,
      notes: [],
      failures: [],
      items: [],
      source: 'V7.checklist.json is absent or has no items',
    }
  }
  const items = checklist.items.map((item) => ({
    id: String(item.id ?? ''),
    title: String(item.title ?? ''),
    status: String(item.status ?? 'owed'),
    evidence: String(item.evidence ?? ''),
  }))
  const owed = items.filter((item) => item.status === 'owed')
  const human = items.filter((item) => item.status === 'human')
  return {
    step: 'V7',
    status: owed.length === 0 ? STATUS.green : STATUS.red,
    counts: {
      assertions: items.length,
      passed: items.filter((item) => item.status === 'green').length,
      failed: owed.length,
      skipped: human.length,
    },
    notes: [
      `${items.length} checklist item(s): ${items.length - owed.length - human.length} green, ${owed.length} owed, ${human.length} declared human gate(s).`,
      'A human gate is a step a person performs and records; it is never auto-checked and never counted as green.',
    ],
    failures: owed.map((item) => ({ assertion: `${item.id} ${item.title}`, detail: 'status: owed' })),
    items,
    source: 'V7.checklist.json',
  }
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function renderTable(table) {
  const lines = []
  if (table.title) lines.push('', `#### ${table.title}`)
  const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  lines.push('', `| ${table.columns.map(cell).join(' | ')} |`)
  lines.push(`| ${table.columns.map(() => '---').join(' | ')} |`)
  for (const row of table.rows ?? []) lines.push(`| ${row.map(cell).join(' | ')} |`)
  return lines
}

/**
 * Build the report. Returns the markdown, the verdict line and the blockers, so the
 * CLI and the test read exactly the same derivation.
 *
 * @param {{ dir: string, vitestJson?: string | null, now?: Date }} options
 */
export function buildReport({ dir, vitestJson = null, now = new Date() }) {
  const results = readStepResults(dir)
  const vitest = readVitest(vitestJson)
  const checklist = readJson(path.join(dir, 'V7.checklist.json'))

  const extras = [...results.keys()].filter((step) => !PLAN_ORDER.includes(step)).sort()
  const order = [...PLAN_ORDER.slice(0, PLAN_ORDER.indexOf('V7')), ...extras, 'V7']

  const sections = order.map((step) => {
    if (step === 'V7') return sectionFromChecklist(checklist)
    if (step === 'V1' && !results.has('V1')) return sectionFromVitest('V1', vitest, null)
    if (step === 'V5' && !results.has('V5')) return sectionFromVitest('V5', vitest, V5_FILE_PATTERN)
    return sectionFromStepResult(step, results.get(step) ?? null)
  })

  const blockers = []
  for (const section of sections) {
    if (section.step === 'V7') {
      // An absent checklist is not an empty pass: the launch gate's own list has to
      // exist before the gate can be green.
      if (section.status === STATUS.missing) blockers.push('V7 MISSING')
      for (const item of section.items ?? []) {
        if (item.status === 'owed') blockers.push(`${item.id} owed`)
      }
      continue
    }
    if (section.status === STATUS.red) blockers.push(`${section.step} RED`)
    else if (section.status === STATUS.missing) blockers.push(`${section.step} MISSING`)
  }

  const verdict =
    blockers.length === 0
      ? 'GO — every automatable step is green and every checklist item is green or a declared human gate.'
      : `NO-GO — ${blockers.join(', ')}`

  const commits = [...new Set(sections.map((section) => section.commit).filter(Boolean))]
  const hosts = [...new Set(sections.map((section) => section.host).filter(Boolean))]

  const lines = [
    '# Catalog verification report',
    '',
    'Authored by DotWin. **Generated** by `scripts/catalog-verification-report.mjs` from the step',
    'results in `audit/catalog-verification/`. Nothing in this file is typed by hand: every status is',
    'a step result’s own `green` field, every count is that result’s own count, and the verdict is',
    'derived from them. A step with no result file is MISSING, never assumed.',
    '',
    `- Generated at: ${now.toISOString()}`,
    `- Results directory: \`${show(path.resolve(dir))}\``,
    `- Commits represented: ${commits.length ? commits.map((commit) => `\`${commit}\``).join(', ') : 'none (no step result carries a commit)'}`,
    `- Hosts represented: ${hosts.length ? hosts.map((host) => `\`${host}\``).join(', ') : 'none'}`,
    `- Vitest reporter output: ${vitest ? `\`${show(vitest.file)}\`` : 'not supplied'}`,
  ]
  if (commits.length > 1) {
    lines.push(
      '',
      `> The steps below were not all run against the same tree (${commits.length} commits). A result from an older commit is stale evidence, not a pass.`,
    )
  }

  lines.push('', '## Steps', '')
  lines.push('| Step | Status | Assertions | Passed | Failed | Skipped | Source |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const section of sections) {
    const counts = section.counts
    lines.push(
      `| ${section.step} | **${section.status}** | ${counts ? counts.assertions : '—'} | ${counts ? counts.passed : '—'} | ${counts ? counts.failed : '—'} | ${counts ? counts.skipped : '—'} | ${section.source} |`,
    )
  }

  for (const section of sections) {
    lines.push('', `## ${section.step} — ${STEP_TITLES[section.step] ?? 'step result'}`, '')
    lines.push(`- Status: **${section.status}**`)
    if (section.counts) {
      lines.push(
        `- Assertions: ${section.counts.assertions} (passed ${section.counts.passed}, failed ${section.counts.failed}, skipped ${section.counts.skipped})`,
      )
    }
    if (section.commit) lines.push(`- Commit: \`${section.commit}\``)
    if (section.host) lines.push(`- Host: \`${section.host}\``)
    if (section.finishedAt) lines.push(`- Finished: ${section.finishedAt}`)
    lines.push(`- Source: ${section.source}`)

    if (section.counts && section.counts.skipped > 0) {
      lines.push('', `> ${section.counts.skipped} assertion(s) did not run. A skipped guard is no guard: the reasons are in the notes.`)
    }

    if (section.step === 'V7') {
      lines.push('', '| Item | Title | Status | Evidence |', '| --- | --- | --- | --- |')
      for (const item of section.items ?? []) {
        lines.push(`| ${item.id} | ${item.title} | **${item.status}** | ${item.evidence || '—'} |`)
      }
    }

    if (section.notes.length) {
      lines.push('', '### Notes', '')
      for (const note of section.notes) lines.push(`- ${note}`)
    }

    lines.push('', '### Failures', '')
    if (section.failures.length === 0) {
      lines.push('None.')
    } else {
      for (const failure of section.failures.slice(0, MAX_LISTED_FAILURES)) {
        lines.push(`- **${failure.assertion}**`)
        lines.push(`  - ${failure.detail}`)
      }
      if (section.failures.length > MAX_LISTED_FAILURES) {
        lines.push(`- … and ${section.failures.length - MAX_LISTED_FAILURES} more failure(s) not listed here; the full list is in ${section.source}.`)
      }
    }

    for (const table of section.tables ?? []) lines.push(...renderTable(table))
  }

  lines.push('', '## Verdict', '', verdict, '')

  return { markdown: lines.join('\n'), verdict, blockers, sections }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else {
      out[key] = next
      i += 1
    }
  }
  return out
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  const dir = path.resolve(REPO_ROOT, typeof args.dir === 'string' ? args.dir : 'audit/catalog-verification')
  const vitestJson = typeof args['vitest-json'] === 'string' ? path.resolve(REPO_ROOT, args['vitest-json']) : null
  const out = path.resolve(REPO_ROOT, typeof args.out === 'string' ? args.out : 'audit/CATALOG-VERIFICATION-REPORT.md')

  const { markdown, verdict, blockers } = buildReport({ dir, vitestJson })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, markdown.endsWith('\n') ? markdown : `${markdown}\n`)
  console.log(`Wrote ${show(out)}`)
  console.log(verdict)
  process.exitCode = blockers.length === 0 ? 0 : 1
}
