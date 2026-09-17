// Authored by DotWin
// The P9 report assembler, over fixture step files in a temporary directory.
//
// The launch gate reads one line of this report, so the only thing worth testing is
// where that line comes from: a step's own `green` field, a missing file reported as
// MISSING rather than assumed, and a checklist item that is `owed` blocking the
// verdict while a declared human gate does not.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildReport } from '../../scripts/catalog-verification-report.mjs'

let dir = ''

/** The section for a step, or a failure that says which step was missing. */
function sectionFor(report: { sections: Array<{ step: string }> }, step: string) {
  const section = report.sections.find((candidate) => candidate.step === step) as
    | { step: string; status: string; counts: { assertions: number; passed: number; failed: number; skipped: number } | null }
    | undefined
  if (!section) throw new Error(`the report has no ${step} section`)
  return section
}

function writeStep(step: string, body: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(dir, `${step}.json`),
    JSON.stringify(
      {
        step,
        title: `${step} fixture`,
        startedAt: '2026-09-17T00:00:00.000Z',
        finishedAt: '2026-09-17T00:01:00.000Z',
        commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        host: 'us.api-sandbox.lumaprints.com',
        counts: { assertions: 1, passed: 1, failed: 0, skipped: 0 },
        failures: [],
        notes: [],
        green: true,
        ...body,
      },
      null,
      2,
    ),
  )
}

function writeChecklist(items: Array<{ id: string; title: string; status: string; evidence?: string }>): void {
  fs.writeFileSync(
    path.join(dir, 'V7.checklist.json'),
    JSON.stringify({ authored_by: 'DotWin', items }, null, 2),
  )
}

/** A full green board: every automatable step present and green. */
function writeEveryStepGreen(): void {
  for (const step of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6.1']) writeStep(step, {})
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-verification-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('buildReport', () => {
  it('reports a step with no result file as MISSING and names it as a blocker', () => {
    writeStep('V2', {})
    writeChecklist([{ id: 'V7.1', title: 'sync', status: 'green', evidence: 'run 2026-09-17' }])

    const report = buildReport({ dir })
    expect(report.verdict.startsWith('NO-GO — ')).toBe(true)
    expect(report.blockers).toContain('V4 MISSING')
    expect(report.blockers).not.toContain('V2 MISSING')
    expect(report.markdown).toContain('| V4 | **MISSING** |')
  })

  it('takes a step’s status from its own green field, never from its counts', () => {
    writeEveryStepGreen()
    // A result that says it is not green stays RED even though nothing failed in its
    // counts: the writer owns that field and the report never second-guesses it.
    writeStep('V4', { green: false, counts: { assertions: 3, passed: 3, failed: 0, skipped: 0 } })
    writeChecklist([{ id: 'V7.1', title: 'sync', status: 'green' }])

    const report = buildReport({ dir })
    expect(report.blockers).toContain('V4 RED')
    expect(report.verdict).toBe('NO-GO — V4 RED')
  })

  it('enumerates failures up to the cap and counts the rest', () => {
    writeEveryStepGreen()
    writeStep('V2', {
      green: false,
      counts: { assertions: 60, passed: 0, failed: 60, skipped: 0 },
      failures: Array.from({ length: 60 }, (_value, index) => ({
        assertion: `assertion ${index}`,
        detail: `detail ${index}`,
      })),
    })
    writeChecklist([{ id: 'V7.1', title: 'sync', status: 'green' }])

    const report = buildReport({ dir })
    expect(report.markdown).toContain('**assertion 49**')
    expect(report.markdown).not.toContain('**assertion 50**')
    expect(report.markdown).toContain('and 10 more failure(s) not listed here')
  })

  it('blocks on an owed checklist item and not on a declared human gate', () => {
    writeEveryStepGreen()
    writeChecklist([
      { id: 'V7.1', title: 'sync', status: 'green', evidence: 'run 2026-09-17' },
      { id: 'V7.3', title: 'margins', status: 'owed' },
      { id: 'V7.9', title: 'production QC order', status: 'human' },
    ])

    const report = buildReport({ dir })
    expect(report.blockers).toEqual(['V7.3 owed'])
    expect(report.verdict).toBe('NO-GO — V7.3 owed')
    expect(report.markdown).toContain('| V7.9 | production QC order | **human** |')
  })

  it('says GO only when every step is green and no checklist item is owed', () => {
    writeEveryStepGreen()
    writeChecklist([
      { id: 'V7.1', title: 'sync', status: 'green', evidence: 'run 2026-09-17' },
      { id: 'V7.9', title: 'production QC order', status: 'human', evidence: 'order 10000339584' },
    ])

    const report = buildReport({ dir })
    expect(report.blockers).toEqual([])
    expect(report.verdict).toBe(
      'GO — every automatable step is green and every checklist item is green or a declared human gate.',
    )
    expect(report.markdown.trimEnd().endsWith(report.verdict)).toBe(true)
  })

  it('counts V1 from the vitest reporter output, with pending tests as skips', () => {
    writeEveryStepGreen()
    fs.rmSync(path.join(dir, 'V1.json'))
    writeChecklist([{ id: 'V7.1', title: 'sync', status: 'green' }])
    const vitestJson = path.join(dir, 'vitest.json')
    fs.writeFileSync(
      vitestJson,
      JSON.stringify({ numTotalTests: 10, numPassedTests: 9, numFailedTests: 0, numPendingTests: 1, testResults: [] }),
    )

    const report = buildReport({ dir, vitestJson })
    const v1 = sectionFor(report, 'V1')
    expect(v1.status).toBe('GREEN')
    expect(v1.counts).toEqual({ assertions: 10, passed: 9, failed: 0, skipped: 1 })
    expect(report.markdown).toContain('A skipped guard is no guard')
  })

  it('builds the V5 section from the money-path test files the vitest output lists', () => {
    writeEveryStepGreen()
    fs.rmSync(path.join(dir, 'V1.json'))
    fs.rmSync(path.join(dir, 'V5.json'))
    writeChecklist([{ id: 'V7.1', title: 'sync', status: 'green' }])
    const vitestJson = path.join(dir, 'vitest.json')
    fs.writeFileSync(
      vitestJson,
      JSON.stringify({
        numTotalTests: 3,
        numPassedTests: 2,
        numFailedTests: 1,
        numPendingTests: 0,
        testResults: [
          {
            name: '/repo/test/checkout-holds.test.ts',
            assertionResults: [
              { status: 'passed', fullName: 'holds a line' },
              { status: 'failed', fullName: 're-quotes a dual line', failureMessages: ['expected 1 to be 2'] },
            ],
          },
          {
            name: '/repo/test/cv.test.ts',
            assertionResults: [{ status: 'passed', fullName: 'unrelated' }],
          },
        ],
      }),
    )

    const report = buildReport({ dir, vitestJson })
    const v5 = sectionFor(report, 'V5')
    expect(v5.counts).toEqual({ assertions: 2, passed: 1, failed: 1, skipped: 0 })
    expect(v5.status).toBe('RED')
    expect(report.blockers).toContain('V5 RED')
    expect(report.markdown).toContain('re-quotes a dual line')
  })

  it('warns when the steps were not all run against the same tree', () => {
    writeEveryStepGreen()
    writeStep('V4', { commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })
    writeChecklist([{ id: 'V7.1', title: 'sync', status: 'green' }])

    const report = buildReport({ dir })
    expect(report.markdown).toContain('not all run against the same tree')
    expect(report.markdown).toContain('stale evidence, not a pass')
  })

  it('reports an absent checklist as MISSING rather than as an empty pass', () => {
    writeEveryStepGreen()
    const report = buildReport({ dir })
    expect(report.blockers).toContain('V7 MISSING')
  })
})
