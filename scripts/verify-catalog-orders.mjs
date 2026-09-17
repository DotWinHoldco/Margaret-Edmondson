#!/usr/bin/env node
// Authored by DotWin
//
// V4 — the sandbox order suite (audit/FULL-CATALOG-BUILD-PLAN.md §10 V4, store 82222).
//
// One order per medium family (eight today), each at the maximal-option configuration
// the plan names, each proved against the rules engine BEFORE the provider is called.
// For every configuration: a real aspect-exact probe image on a signed URL,
// `checkImageConfig` (200), `POST /api/v1/orders` (201 with an orderNumber), then a
// polled `GET /api/v1/orders/{n}` — the submit is a queue acknowledgement and a read
// straight after it 404s (F33) — asserting that the provider echoes the exact option
// ids, the ordered width and height (fractional included) and the subcategory.
//
//   node scripts/verify-catalog-orders.mjs --snapshot fixtures/lumaprints/catalog.<host>.<date>.json \
//        [--env .env.luma] [--no-orders] [--max-orders 8] [--out audit/catalog-verification]
//
// Flags:
//   --snapshot <path>   REQUIRED. The Phase 0 catalog fixture the plan is built from.
//   --env <file>        env file for the sandbox probe client (default .env.luma).
//   --no-orders         build the plan and run checkImageConfig only. Every order and
//                       echo assertion is SKIPPED with its reason and counted.
//   --max-orders <n>    hard ceiling on sandbox orders in one run (default 8).
//   --out <dir>         where V4.json / V4.md are written (default
//                       audit/catalog-verification). A dry run writes elsewhere so it
//                       cannot overwrite a real result.
//
// Two rails, in the order they matter:
//   - SANDBOX ONLY. The host is compared whole against SANDBOX_HOSTNAME before a
//     single request leaves this process, and the shared client refuses to submit an
//     order on any other host.
//   - Never an empty option array on a subcategory that has groups (F30), and never a
//     configuration `evaluateSelection` refuses: the plan builder throws instead, and
//     that is a harness bug rather than a provider finding.
//
// Nothing here is asserted from a source other than the provider's answer or our own
// record: the solid-colour hex is never echoed (P16), so it is asserted against the
// request we sent and noted as unverifiable from the provider's side.
//
// Budget: the shared token bucket holds every call, retries and polls included, to
// <= 25 requests/minute so the live storefront keeps its share of the 40/min key (F29).

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { clientFromEnv, loadEnvFile, parseArgs, SANDBOX_HOSTNAME } from './lib/lumaprints-probe-client.mjs'

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

// The catalog modules are TypeScript and use the project's own module resolution
// (extensionless relative specifiers, the `@/` alias). Registering the loader hook
// here is what lets `node scripts/verify-catalog-orders.mjs` run with no extra flags
// and still import the REAL rules engine rather than a copy of it.
await import('./lib/register-ts.mjs')
const { buildV4Plan, treeFromSnapshot, subcategoryForEntry } = await import('./lib/v4-configs.mjs')
const { AssertionLog, gitCommit, writeStepResult, VERIFICATION_DIR } = await import('./lib/verification-report')

const args = parseArgs(process.argv.slice(2))
const ALLOW_ORDERS = !args['no-orders']
const MAX_ORDERS = Number.isFinite(Number(args['max-orders'])) && Number(args['max-orders']) > 0 ? Math.trunc(Number(args['max-orders'])) : 8
const OUT_DIR = path.resolve(REPO, typeof args.out === 'string' ? args.out : 'audit/catalog-verification')
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const ECHO_POLLS = 12
const ECHO_INTERVAL_MS = 5_000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const nowIso = () => new Date().toISOString()

// The sandbox test recipient the existing harnesses use, so orders from this suite sit
// next to the P0 probes in the dashboard.
const RECIPIENT = {
  firstName: 'Sandbox',
  lastName: 'Test',
  addressLine1: '1 Test St',
  city: 'Austin',
  state: 'TX',
  zipCode: '78701',
  country: 'US',
}

/** A path a person can read: relative inside the repo, absolute outside it. */
function show(target) {
  const relative = path.relative(REPO, target)
  return relative.startsWith('..') ? target : relative
}

function die(message, code = 1) {
  console.error(message)
  process.exit(code)
}

// ---------------------------------------------------------------------------
// The plan, printed before anything is sent
// ---------------------------------------------------------------------------

const snapshotArg = typeof args.snapshot === 'string' ? args.snapshot : null
if (!snapshotArg) {
  die('Usage: --snapshot fixtures/lumaprints/catalog.<host>.<date>.json [--env .env.luma] [--no-orders] [--max-orders 8] [--out <dir>]', 2)
}
const snapshotPath = path.resolve(REPO, snapshotArg)
if (!fs.existsSync(snapshotPath)) die(`Snapshot not found: ${snapshotPath}`, 2)
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))

const catalog = treeFromSnapshot(snapshot)
let plan
try {
  plan = buildV4Plan(catalog)
} catch (error) {
  die(`V4 plan refused: ${error instanceof Error ? error.message : String(error)}`, 1)
}

console.log(`V4 plan from ${path.relative(REPO, snapshotPath)} (${catalog.subcategories.length} subcategories, ${plan.length} medium families)`)
console.log('')
const planColumns = ['medium', 'subcategory', 'name', 'size (in)', 'option ids', 'hex']
const planRows = plan.map((entry) => [
  entry.medium,
  String(entry.subcategoryId),
  entry.subcategoryName,
  `${entry.size.width} x ${entry.size.height}`,
  entry.optionIds.length ? entry.optionIds.join(',') : '(none published)',
  entry.solidColorHexCode ?? '',
])
const widths = planColumns.map((column, i) => Math.max(column.length, ...planRows.map((row) => row[i].length)))
const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ')
console.log(line(planColumns))
console.log(line(widths.map((width) => '-'.repeat(width))))
for (const row of planRows) console.log(line(row))
console.log('')
console.log(`Orders: ${ALLOW_ORDERS ? `enabled (max ${MAX_ORDERS})` : 'disabled (--no-orders)'} · results -> ${show(OUT_DIR)}`)
console.log('')

// ---------------------------------------------------------------------------
// Credentials: everything this run needs is checked before the first request
// ---------------------------------------------------------------------------

let client
let envFile
try {
  ;({ client, envFile } = clientFromEnv({ envFile: typeof args.env === 'string' ? args.env : '.env.luma', rpm: 25 }))
} catch (error) {
  die(`Cannot build the sandbox client: ${error instanceof Error ? error.message : String(error)}`, 1)
}
try {
  client.assertSandbox('the V4 sandbox order suite')
} catch (error) {
  die(`${error instanceof Error ? error.message : String(error)} (expected host ${SANDBOX_HOSTNAME})`, 1)
}
if (ALLOW_ORDERS && !(Number.isFinite(client.storeId) && client.storeId > 0)) {
  die(`LUMAPRINTS_STORE_ID is not set to a positive store id (env file: ${envFile}); orders cannot be submitted.`, 1)
}

loadEnvFile('.env.local')
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB_URL || !SB_KEY) {
  die(
    'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set (.env.local) — probe images cannot be hosted, so nothing was sent.',
    1,
  )
}
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })
console.log(`Ordering against ${client.baseUrl} · store ${client.storeId} · env ${envFile}`)

// ---------------------------------------------------------------------------
// Probe images: aspect-exact for the ordered size, private bucket, 2h signed URL,
// proven reachable as image/png before LumaPrints ever sees the link.
// ---------------------------------------------------------------------------

const PROBE_PREFIX = `v4/${RUN_ID}`
const imageCache = new Map()
const imageManifest = []

async function probeImage(widthIn, heightIn, dpi, label) {
  const w = Math.round(widthIn * dpi)
  const h = Math.round(heightIn * dpi)
  const key = `${w}x${h}`
  if (imageCache.has(key)) return imageCache.get(key)

  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 236, g: 232, b: 224 } } })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="#efe9df"/>` +
            `<rect x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.06)}" width="${Math.round(w * 0.88)}" height="${Math.round(h * 0.88)}" fill="none" stroke="#2f3b34" stroke-width="${Math.max(4, Math.round(w / 200))}"/>` +
            `<text x="${Math.round(w / 2)}" y="${Math.round(h / 2)}" font-family="sans-serif" font-size="${Math.max(24, Math.round(w / 14))}" fill="#2f3b34" text-anchor="middle">V4 ${widthIn}x${heightIn}in</text></svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer()

  const storagePath = `${PROBE_PREFIX}/${label}.png`
  const up = await sb.storage.from('print-masters').upload(storagePath, buf, { contentType: 'image/png', upsert: true })
  if (up.error) throw new Error(`probe image upload failed (${storagePath}): ${up.error.message}`)
  const signed = await sb.storage.from('print-masters').createSignedUrl(storagePath, 7200)
  if (signed.error || !signed.data?.signedUrl) throw new Error(`signed url failed (${storagePath}): ${signed.error?.message}`)
  const url = signed.data.signedUrl

  let head = await fetch(url, { method: 'HEAD' })
  let verifyMethod = 'HEAD'
  if (!head.ok) {
    head = await fetch(url)
    verifyMethod = 'GET'
  }
  const contentType = head.headers.get('content-type')
  if (!head.ok || !String(contentType).startsWith('image/png')) {
    throw new Error(`probe image not reachable as image/png: ${verifyMethod} ${head.status} ${contentType} (${storagePath})`)
  }
  const entry = { label, storagePath, px: { width: w, height: h }, bytes: buf.length, url }
  console.log(`  image ${label} ${w}x${h}px ${(buf.length / 1024).toFixed(0)}KB -> ${verifyMethod} ${head.status} ${contentType}`)
  imageCache.set(key, entry)
  imageManifest.push({ label, storagePath, px: entry.px, bytes: entry.bytes })
  return entry
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const startedAt = nowIso()
const log = new AssertionLog()
const rows = []
const orderRecords = []
let ordersPlaced = 0

/**
 * How many assertions one plan entry makes, so a skip is counted exactly.
 *
 * The full path is: checkImageConfig 200 · order 201 · (hex carried, when the
 * configuration has one) · the order materialises on GET · echoed option ids ·
 * echoed size · echoed subcategory.
 */
function assertionsFor(entry, { fromImageCheck = false } = {}) {
  return (fromImageCheck ? 1 : 0) + 5 + (entry.solidColorHexCode ? 1 : 0)
}

/** Canvas Finish ids for a subcategory: accepted, never echoed (F35), so exempt. */
function finishIdsFor(entry) {
  const sub = subcategoryForEntry(catalog, entry)
  const group = sub?.groups.find((candidate) => candidate.group_key === 'canvas_finish')
  return new Set((group?.options ?? []).map((option) => option.option_id))
}

for (const entry of plan) {
  const sub = subcategoryForEntry(catalog, entry)
  const dpi = Number(sub?.required_dpi) > 0 ? Number(sub.required_dpi) : 300
  const context = { medium: entry.medium, subcategoryId: entry.subcategoryId, size: entry.size, options: entry.optionIds }
  console.log('')
  console.log(`${entry.medium} · ${entry.subcategoryId} ${entry.subcategoryName} · ${entry.size.width}x${entry.size.height}in · options [${entry.optionIds.join(',')}]`)

  const row = {
    medium: entry.medium,
    subcategory: `${entry.subcategoryId} ${entry.subcategoryName}`,
    size: `${entry.size.width} x ${entry.size.height}`,
    options: entry.optionIds.length ? entry.optionIds.join(',') : '(none published)',
    orderNumber: '—',
    echo: 'not attempted',
  }
  rows.push(row)

  // --- image + checkImageConfig -------------------------------------------
  let image = null
  try {
    image = await probeImage(entry.size.width, entry.size.height, dpi, entry.label)
  } catch (error) {
    log.fail(`${entry.medium} probe image is hosted and reachable`, String(error instanceof Error ? error.message : error), context)
    log.skipMany(assertionsFor(entry, { fromImageCheck: true }), `${entry.medium} ${entry.subcategoryId} image-check, order and echo assertions`, 'the probe image could not be hosted, so nothing was sent')
    row.echo = 'no probe image'
    continue
  }

  const ci = await client.checkImageConfig(
    {
      subcategoryId: entry.subcategoryId,
      printWidth: entry.size.width,
      printHeight: entry.size.height,
      imageUrl: image.url,
      orderItemOptions: entry.optionIds,
    },
    `ci:${entry.label}`,
  )
  const ciOk = log.check(
    ci.status === 200,
    `${entry.medium} ${entry.subcategoryId} ${entry.size.width}x${entry.size.height} passes checkImageConfig`,
    `HTTP ${ci.status}${ci.status === 200 ? '' : `: ${String(ci.rawText).slice(0, 300)}`}`,
    context,
  )
  console.log(`  checkImageConfig ${ci.status}`)

  // --- the order -----------------------------------------------------------
  if (!ALLOW_ORDERS) {
    log.skipMany(assertionsFor(entry), `${entry.medium} ${entry.subcategoryId} order and echo assertions`, '--no-orders')
    row.echo = 'skipped (--no-orders)'
    continue
  }
  if (!ciOk) {
    log.skipMany(assertionsFor(entry), `${entry.medium} ${entry.subcategoryId} order and echo assertions`, `checkImageConfig returned ${ci.status}, so the configuration was not ordered`)
    row.echo = `skipped (image check ${ci.status})`
    continue
  }
  if (ordersPlaced >= MAX_ORDERS) {
    log.skipMany(assertionsFor(entry), `${entry.medium} ${entry.subcategoryId} order and echo assertions`, `the ${MAX_ORDERS}-order budget for this run is exhausted`)
    row.echo = 'skipped (order budget)'
    continue
  }

  const externalId = `v4-${RUN_ID}-${entry.label}`
  const item = {
    externalItemId: `${externalId}-1`,
    subcategoryId: entry.subcategoryId,
    quantity: 1,
    width: entry.size.width,
    height: entry.size.height,
    file: { imageUrl: image.url, saveImage: false },
    orderItemOptions: entry.optionIds,
    ...(entry.solidColorHexCode ? { solidColorHexCode: entry.solidColorHexCode } : {}),
  }
  const body = {
    externalId,
    storeId: client.storeId,
    shippingMethod: 'default',
    productionTime: 'regular',
    recipient: RECIPIENT,
    orderItems: [item],
  }
  const submit = await client.submitOrder(body, `order:${entry.label}`)
  ordersPlaced += 1
  const orderNumber = submit.body?.orderNumber ?? null
  row.orderNumber = orderNumber === null ? `(none, HTTP ${submit.status})` : String(orderNumber)
  console.log(`  POST /api/v1/orders ${submit.status} order ${orderNumber ?? 'n/a'}`)

  const submitted = log.check(
    submit.status === 201 && orderNumber !== null,
    `${entry.medium} ${entry.subcategoryId} order is accepted (201 with an orderNumber)`,
    `HTTP ${submit.status}, orderNumber ${String(orderNumber)}${submit.status === 201 ? '' : `: ${String(submit.rawText).slice(0, 300)}`}`,
    context,
  )

  // The hex is asserted from OUR request record: the provider never echoes it (P16),
  // so the order item we sent is the only evidence that exists.
  if (entry.solidColorHexCode) {
    log.check(
      item.solidColorHexCode === entry.solidColorHexCode,
      `${entry.medium} ${entry.subcategoryId} order carries solidColorHexCode ${entry.solidColorHexCode}`,
      `submitted request records solidColorHexCode ${String(item.solidColorHexCode)} — not echoed by the provider (P16)`,
      context,
    )
  }

  if (!submitted) {
    log.skipMany(4, `${entry.medium} ${entry.subcategoryId} echo assertions`, `the order was not accepted (HTTP ${submit.status}), so there is nothing to read back`)
    row.echo = `not accepted (${submit.status})`
    orderRecords.push({ label: entry.label, externalId, orderNumber, submitStatus: submit.status, echoStatus: null })
    continue
  }

  // --- the echo: poll, because a GET straight after the 201 404s (F33) ------
  let echo = null
  for (let attempt = 0; attempt < ECHO_POLLS; attempt += 1) {
    echo = await client.getOrder(orderNumber, `echo:${entry.label}:${attempt}`)
    if (echo.status === 200) break
    if (attempt < ECHO_POLLS - 1) await sleep(ECHO_INTERVAL_MS)
  }
  console.log(`  GET /api/v1/orders/${orderNumber} ${echo.status}`)

  if (echo.status !== 200) {
    log.fail(
      `${entry.medium} ${entry.subcategoryId} order materialises on GET /orders/{n}`,
      `still HTTP ${echo.status} after ${ECHO_POLLS} polls ${ECHO_INTERVAL_MS / 1000}s apart (F33: the 201 is a queue acknowledgement)`,
      context,
    )
    log.skipMany(3, `${entry.medium} ${entry.subcategoryId} echo comparisons`, `GET /orders/${orderNumber} never returned 200 in this run`)
    row.echo = `never materialised (${echo.status})`
    orderRecords.push({ label: entry.label, externalId, orderNumber, submitStatus: submit.status, echoStatus: echo.status })
    continue
  }
  log.check(true, `${entry.medium} ${entry.subcategoryId} order materialises on GET /orders/{n}`, `HTTP 200 within ${ECHO_POLLS} polls`, context)

  const echoedItem = echo.body?.orderItems?.[0] ?? {}
  const echoedIds = (echoedItem.orderItemOptions ?? []).map((option) => Number(option.optionId ?? option))
  const finishIds = finishIdsFor(entry)
  const expected = entry.optionIds.filter((id) => !finishIds.has(id))
  const exemptSent = entry.optionIds.filter((id) => finishIds.has(id))
  const missing = expected.filter((id) => !echoedIds.includes(id))
  log.check(
    missing.length === 0,
    `${entry.medium} ${entry.subcategoryId} echoes every sent option id (Canvas Finish exempt, F35)`,
    missing.length === 0
      ? `echoed [${echoedIds.join(',')}] covers sent [${expected.join(',')}]`
      : `sent [${expected.join(',')}], echoed [${echoedIds.join(',')}], missing [${missing.join(',')}]`,
    context,
  )
  if (exemptSent.length > 0) {
    const notEchoed = exemptSent.filter((id) => !echoedIds.includes(id))
    log.note(
      `FINDING F35: ${entry.subcategoryId} Canvas Finish id(s) [${exemptSent.join(',')}] sent with order ${orderNumber}; ${notEchoed.length === 0 ? 'echoed back' : `not echoed (${notEchoed.join(',')})`}. Exempt from the echo assertion, not a failure.`,
    )
  }

  const dimsOk = Number(echoedItem.width) === Number(entry.size.width) && Number(echoedItem.height) === Number(entry.size.height)
  log.check(
    dimsOk,
    `${entry.medium} ${entry.subcategoryId} echoes the ordered size`,
    `sent ${entry.size.width}x${entry.size.height}, echoed ${String(echoedItem.width)}x${String(echoedItem.height)}`,
    context,
  )
  log.check(
    Number(echoedItem.subcategoryId) === Number(entry.subcategoryId),
    `${entry.medium} ${entry.subcategoryId} echoes the ordered subcategory`,
    `sent ${entry.subcategoryId}, echoed ${String(echoedItem.subcategoryId)}`,
    context,
  )
  if (entry.solidColorHexCode) {
    log.note(
      `RECORDED (P16): order ${orderNumber} carries solidColorHexCode ${entry.solidColorHexCode} in the request; the provider's order item echoes only [${Object.keys(echoedItem).join(', ')}] and never the hex, so our own record is the sole evidence of the colour.`,
    )
  }

  row.echo = missing.length === 0 && dimsOk ? 'exact' : 'MISMATCH'
  orderRecords.push({
    label: entry.label,
    externalId,
    orderNumber,
    submitStatus: submit.status,
    echoStatus: echo.status,
    orderStatus: echo.body?.orderStatus ?? null,
    sentOptionIds: entry.optionIds,
    echoedOptionIds: echoedIds,
    sentSize: entry.size,
    echoedSize: { width: echoedItem.width ?? null, height: echoedItem.height ?? null },
    hexSent: entry.solidColorHexCode ?? null,
  })
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (!ALLOW_ORDERS) {
  log.note('SKIPPED: every order and echo assertion in this run — the suite was invoked with --no-orders, so nothing was submitted. A dry run proves the plan and the image check, never the order path.')
}
log.note(`Every configuration was proved against evaluateSelection before the provider was called; a configuration the engine refuses aborts the run as a harness bug (F30).`)
log.note(`Canvas Finish ids are exempt from the echo assertion (F35: accepted, never echoed) and the solid-colour hex is asserted from the request record (P16: never echoed).`)

const summary = client.printSummary('v4 ')
const finishedAt = nowIso()
const table = {
  title: 'One order per medium family',
  columns: ['medium', 'subcategory', 'size (in)', 'option ids', 'order number', 'echo'],
  rows: rows.map((row) => [row.medium, row.subcategory, row.size, row.options, row.orderNumber, row.echo]),
}

// `writeStepResult` is the harness's only writer (it is what makes `green === failed
// 0` true of every step), and it writes into audit/catalog-verification. When `--out`
// points somewhere else — a dry run must not overwrite a real result — the canonical
// pair is written, copied to `--out`, and whatever was there before is put back.
const canonicalJson = path.join(VERIFICATION_DIR, 'V4.json')
const canonicalMd = path.join(VERIFICATION_DIR, 'V4.md')
const redirecting = path.resolve(OUT_DIR) !== path.resolve(VERIFICATION_DIR)
const priorJson = redirecting && fs.existsSync(canonicalJson) ? fs.readFileSync(canonicalJson) : null
const priorMd = redirecting && fs.existsSync(canonicalMd) ? fs.readFileSync(canonicalMd) : null

const { green, jsonPath, mdPath } = writeStepResult({
  step: 'V4',
  title: 'Sandbox order suite: one maximal-option order per medium, echoed back exactly',
  startedAt,
  finishedAt,
  commit: gitCommit(),
  host: client.host,
  counts: log.counts,
  failures: log.failures,
  notes: log.notes,
  table,
  meta: {
    snapshot: path.relative(REPO, snapshotPath),
    snapshotCapturedAt: snapshot.capturedAt ?? null,
    mode: ALLOW_ORDERS ? 'orders' : 'no-orders',
    ordersPlaced,
    maxOrders: MAX_ORDERS,
    storeId: client.storeId,
    mediums: plan.map((entry) => entry.medium),
    plan: plan.map((entry) => ({
      medium: entry.medium,
      subcategoryId: entry.subcategoryId,
      size: entry.size,
      optionIds: entry.optionIds,
      solidColorHexCode: entry.solidColorHexCode ?? null,
      notes: entry.notes,
    })),
    orders: orderRecords,
    probeImages: imageManifest,
    echoPolls: ECHO_POLLS,
    echoIntervalMs: ECHO_INTERVAL_MS,
    requestsSent: summary.requestCount,
    peakPerRolling60s: summary.peakPerRolling60s,
    wallMs: summary.wallMs,
  },
})

let writtenJson = jsonPath
let writtenMd = mdPath
if (redirecting) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  writtenJson = path.join(OUT_DIR, 'V4.json')
  writtenMd = path.join(OUT_DIR, 'V4.md')
  fs.copyFileSync(jsonPath, writtenJson)
  fs.copyFileSync(mdPath, writtenMd)
  if (priorJson) fs.writeFileSync(canonicalJson, priorJson)
  else fs.rmSync(canonicalJson, { force: true })
  if (priorMd) fs.writeFileSync(canonicalMd, priorMd)
  else fs.rmSync(canonicalMd, { force: true })
}

console.log('')
console.log(log.summaryLine('V4'))
console.log(`orders placed: ${ordersPlaced} of a ${MAX_ORDERS} budget · ${orderRecords.map((record) => `${record.label}:${record.orderNumber ?? record.submitStatus}`).join(' ') || 'none'}`)
console.log(`Wrote ${show(writtenJson)} and ${show(writtenMd)}`)
process.exitCode = green ? 0 : 1
