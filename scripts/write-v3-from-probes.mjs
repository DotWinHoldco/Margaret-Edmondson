#!/usr/bin/env node
// Authored by DotWin
//
// V3 — the geometry step of the §10 verification protocol, written from a run of the P0
// probe matrix (`scripts/verify-catalog-geometry.mjs`, which records every probe's raw
// provider answer in fixtures/lumaprints/probes.<date>.json and PROBES.md).
//
//   node scripts/verify-catalog-geometry.mjs --snapshot <sandbox snapshot> --no-orders
//   node --import ./scripts/lib/register-ts.mjs scripts/write-v3-from-probes.mjs \
//        --probes fixtures/lumaprints/probes.<date>.json
//
// Why an adapter rather than a rewrite: the probe matrix already asks the V3 questions
// (does checkImageConfig accept the aspect-exact master at every geometry-bearing option,
// does the provider refuse where the engine refuses, does it normalise orientation) with
// the raw responses recorded; V3's job is to re-run it at the current commit and count
// it. A probe's verdict maps to a step assertion:
//   PASS     -> passed   (the provider's answer matched the engine's prediction)
//   FINDING  -> passed   (the provider's answer was recorded and the engine was written
//                         to it; the finding text is kept as a RECORDED note, per rule 3
//                         of audit/catalog-verification/README.md)
//   FAIL     -> failed
//   SKIPPED  -> skipped  (with the probe's own reason)
// Nothing here softens a FAIL; a probe the script could not run stays a counted skip.

import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, gitCommit, writeStepResult } from './lib/verification-report'

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const probesPath = arg('probes')
if (!probesPath) {
  console.error('Usage: --probes fixtures/lumaprints/probes.<date>.json')
  process.exit(1)
}

const run = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, probesPath), 'utf8'))
const probes = Array.isArray(run.probes) ? run.probes : []
if (probes.length === 0) {
  console.error(`No probes in ${probesPath}`)
  process.exit(1)
}

const startedAt = run.startedAt ?? run.summary?.startedAt ?? new Date().toISOString()
const finishedAt = run.finishedAt ?? run.summary?.finishedAt ?? new Date().toISOString()

let passed = 0
let failed = 0
let skipped = 0
const failures = []
const notes = []
const rows = []

for (const probe of probes) {
  const verdict = String(probe.verdict ?? 'SKIPPED')
  const implication = String(probe.implication ?? '').replace(/\s+/g, ' ').trim()
  const short = implication.length > 240 ? `${implication.slice(0, 237)}...` : implication
  if (verdict === 'PASS') {
    passed += 1
  } else if (verdict === 'FINDING') {
    passed += 1
    notes.push(`RECORDED (${probe.id}, provider behaviour the engine is written to): ${short}`)
  } else if (verdict === 'FAIL') {
    failed += 1
    failures.push({ assertion: `${probe.id}: ${probe.question}`, detail: implication, context: { key: probe.key, planRef: probe.planRef } })
  } else {
    skipped += 1
    notes.push(`SKIPPED (${probe.id}): ${short || 'no reason recorded'}`)
  }
  rows.push([probe.id, probe.key ?? '', verdict, Array.isArray(probe.requests) ? probe.requests.length : 0, probe.question ?? ''])
}

const result = writeStepResult({
  step: 'V3',
  title: 'Geometry sweep: checkImageConfig and provider enforcement against the rules engine (P0 probe matrix re-run)',
  startedAt,
  finishedAt,
  commit: gitCommit(),
  host: run.host ?? 'unknown',
  counts: { passed, failed, skipped },
  failures,
  notes,
  table: { title: 'Probes', columns: ['probe', 'key', 'verdict', 'requests', 'question'], rows },
  meta: { probesFile: probesPath, runId: run.runId ?? null, storeId: run.storeId ?? null, snapshot: run.snapshot ?? null },
})

console.log(`V3: ${passed + failed + skipped} probes — passed ${passed}, failed ${failed}, skipped ${skipped} → ${result.green ? 'GREEN' : 'RED'}`)
console.log(`Wrote ${path.relative(REPO_ROOT, result.jsonPath)} and ${path.relative(REPO_ROOT, result.mdPath)}`)
