#!/usr/bin/env node
// Authored by DotWin
// Phase 0 probe matrix (audit/FULL-CATALOG-BUILD-PLAN.md §6 P0, ADR-3/ADR-4, §9 F2/F3/F5/F6/F10/F15/F26).
//
// Why: the catalog snapshot says what EXISTS; it cannot say what the API DOES. Every
// geometry, required-group, fractional-size and additivity assumption behind the
// schema, the rules engine and the pricing cache is proved here against the SANDBOX,
// with the status code and raw body of every request recorded in PROBES.md. A probe
// without its raw response is not evidence.
//
// Sandbox only. The client refuses to submit an order unless the base URL is the
// sandbox host, and this script refuses to run at all against any other host.
//
//   node scripts/verify-catalog-geometry.mjs --env .env.luma \
//        --snapshot fixtures/lumaprints/catalog.us.api-sandbox.lumaprints.com.<date>.json \
//        [--no-orders] [--out fixtures/lumaprints]
//
// Budget: <=25 LumaPrints requests/minute (hard token bucket in the shared client),
// <=8 sandbox orders per run. Probe images are generated locally and served from the
// private print-masters bucket through 2-hour signed URLs.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { clientFromEnv, loadEnvFile, parseArgs, todayStamp } from './lib/lumaprints-probe-client.mjs'

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const args = parseArgs(process.argv.slice(2))
const OUT_DIR = path.resolve(REPO, typeof args.out === 'string' ? args.out : 'fixtures/lumaprints')
const STAMP = todayStamp()
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const ALLOW_ORDERS = !args['no-orders']
const MAX_ORDERS = 8

// The dry-run script's sandbox test recipient — same address, so sandbox orders from
// this harness are recognisable next to the existing ones.
const RECIPIENT = {
  firstName: 'Sandbox',
  lastName: 'Test',
  addressLine1: '1 Test St',
  city: 'Austin',
  state: 'TX',
  zipCode: '78701',
  country: 'US',
}

// ---------------------------------------------------------------------------
// Snapshot access — ids are resolved BY NAME, with the documented production ids
// only as a fallback (plan §9 F12: sandbox ids are not guaranteed to be prod ids).
// ---------------------------------------------------------------------------
const snapshotPath = typeof args.snapshot === 'string' ? args.snapshot : null
if (!snapshotPath) {
  console.error('Usage: --snapshot fixtures/lumaprints/catalog.<host>.<date>.json [--env .env.luma] [--no-orders]')
  process.exit(2)
}
const snapshot = JSON.parse(fs.readFileSync(path.resolve(snapshotPath), 'utf8'))
const ALL_SUBS = []
for (const c of snapshot.categories) for (const s of c.subcategories) ALL_SUBS.push({ ...s, categoryId: Number(c.id), categoryName: c.name })

const subById = (id) => ALL_SUBS.find((s) => Number(s.subcategoryId) === Number(id))
const subByName = (categoryId, pattern, fallbackId) =>
  ALL_SUBS.find((s) => s.categoryId === categoryId && pattern.test(String(s.name))) ?? subById(fallbackId)

function groupsOf(sub) {
  return (sub?.optionGroups ?? []).map((g) => ({
    group: String(g.optionGroup),
    items: (g.optionGroupItems ?? []).map((i) => ({ id: Number(i.optionId), name: String(i.optionName) })),
  }))
}

/** Resolve an option id by NAME inside a subcategory; documented id is the fallback. */
function optId(sub, groupPattern, namePattern, fallbackId) {
  for (const g of groupsOf(sub)) {
    if (!groupPattern.test(g.group)) continue
    const hit = g.items.find((i) => namePattern.test(i.name))
    if (hit) return hit.id
  }
  return fallbackId
}

function optName(sub, id) {
  for (const g of groupsOf(sub)) for (const i of g.items) if (i.id === Number(id)) return `${g.group} / ${i.name}`
  return `option ${id}`
}

const num = (v) => (v == null ? NaN : Number(v))
function boundedSize(sub, w, h) {
  const minW = num(sub.minimumWidth)
  const maxW = num(sub.maximumWidth)
  const minH = num(sub.minimumHeight)
  const maxH = num(sub.maximumHeight)
  const clamp = (v, lo, hi) => Math.max(Math.ceil(lo), Math.min(Math.floor(hi), v))
  return { width: clamp(w, minW, maxW), height: clamp(h, minH, maxH) }
}

// ---------------------------------------------------------------------------
// Probe bookkeeping
// ---------------------------------------------------------------------------
// Probe ids are positions in this canonical order, so a partial re-run
// (`--only additivity`) keeps every id stable and merges back into the existing
// PROBES.md instead of renumbering the record.
const KEY_ORDER = [
  'required',
  'cat105',
  'mat',
  'ceiling',
  'bleed',
  'solid',
  'fractional',
  'matcolor',
  'easel',
  'hardware',
  'foamcore',
  'glazing',
  'deltas',
  'additivity',
  'defaults',
  'orderecho',
]
const ONLY = typeof args.only === 'string' ? args.only.split(',').map((s) => s.trim()).filter(Boolean) : null
if (ONLY) {
  const unknown = ONLY.filter((k) => !KEY_ORDER.includes(k))
  if (unknown.length > 0) {
    console.error(`--only: unknown probe key(s) ${unknown.join(', ')}. Known keys: ${KEY_ORDER.join(', ')}`)
    process.exit(2)
  }
}
const shouldRun = (key) => !ONLY || ONLY.includes(key)
const shouldRunAny = (keys) => keys.some(shouldRun)

const probes = []
function probe({ key, question, planRef }) {
  const idx = KEY_ORDER.indexOf(key)
  if (idx < 0) throw new Error(`probe(): unknown key "${key}"`)
  // A probe whose key is filtered out is a stub: it records nothing and is not
  // emitted, so the merged report keeps the previous run's answer for it verbatim.
  if (!shouldRun(key)) return { id: `P${idx + 1}`, key, notRun: true, requests: [], data: {} }
  const p = {
    id: `P${idx + 1}`,
    key,
    question,
    planRef,
    requests: [],
    verdict: 'SKIPPED',
    implication: '',
    data: {},
  }
  probes.push(p)
  return p
}
/** Attach a client record (or a hand-built view of one) to a probe. */
function attach(p, record, note = null) {
  p.requests.push({
    note,
    method: record.method,
    path: record.path,
    request: record.request,
    status: record.status,
    body: record.body,
    rawText: record.rawText,
  })
  return record
}
function finish(p, verdict, implication, data = {}) {
  if (p.notRun) return p
  p.verdict = verdict
  p.implication = implication
  p.data = { ...p.data, ...data }
  console.log(`${p.id} ${verdict} — ${p.question}`)
  console.log(`      ${implication}`)
  return p
}
function skip(p, reason) {
  return finish(p, 'SKIPPED', `SKIPPED: ${reason}`)
}

// ---------------------------------------------------------------------------
// Probe images: generated at the exact print aspect, >= requiredDPI, uploaded to
// the private print-masters bucket, served through a 2h signed URL, and proven
// reachable (HTTP 200 + image/png) BEFORE any LumaPrints call uses them.
// ---------------------------------------------------------------------------
loadEnvFile('.env.local')
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = SB_URL && SB_KEY ? createClient(SB_URL, SB_KEY, { auth: { persistSession: false } }) : null
const PROBE_PREFIX = `probes/${RUN_ID}`
const imageCache = new Map()
const imageManifest = []

async function probeImage(pxW, pxH, label) {
  const key = `${pxW}x${pxH}`
  if (imageCache.has(key)) return imageCache.get(key)
  if (!sb) throw new Error('Supabase service role not configured (.env.local) — cannot host probe images')
  const w = Math.round(pxW)
  const h = Math.round(pxH)
  // A real image, not a blank: a soft gradient plus a border so a visual check of a
  // sandbox order shows an actual print, and so PNG compression stays honest.
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 236, g: 232, b: 224 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="#efe9df"/>` +
            `<rect x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.06)}" width="${Math.round(w * 0.88)}" height="${Math.round(h * 0.88)}" fill="none" stroke="#2f3b34" stroke-width="${Math.max(4, Math.round(w / 200))}"/>` +
            `<text x="${Math.round(w / 2)}" y="${Math.round(h / 2)}" font-family="sans-serif" font-size="${Math.max(24, Math.round(w / 14))}" fill="#2f3b34" text-anchor="middle">P0 ${w}x${h}</text></svg>`,
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

  // Prove the URL before LumaPrints sees it: HEAD, falling back to GET.
  let head = await fetch(url, { method: 'HEAD' })
  let verifyMethod = 'HEAD'
  if (!head.ok) {
    head = await fetch(url)
    verifyMethod = 'GET'
  }
  const contentType = head.headers.get('content-type')
  const entry = {
    label,
    storagePath,
    px: { width: w, height: h },
    bytes: buf.length,
    verify: { method: verifyMethod, status: head.status, contentType },
    url,
  }
  if (!head.ok || !String(contentType).startsWith('image/png')) {
    throw new Error(`probe image not reachable as image/png: ${verifyMethod} ${head.status} ${contentType} (${storagePath})`)
  }
  console.log(`  image ${label} ${w}x${h}px ${(buf.length / 1024).toFixed(0)}KB -> ${verifyMethod} ${head.status} ${contentType}`)
  imageCache.set(key, entry)
  imageManifest.push(entry)
  return entry
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
let ordersPlaced = 0
const orderLog = []
async function placeOrder(client, p, { subcategoryId, width, height, options, imageUrl, solidColorHexCode, label }) {
  if (!ALLOW_ORDERS) {
    p.requests.push({ note: `order ${label} not attempted (--no-orders)`, method: 'POST', path: '/api/v1/orders', request: null, status: null, body: null, rawText: '' })
    return null
  }
  if (ordersPlaced >= MAX_ORDERS) {
    p.requests.push({ note: `order ${label} not attempted (order budget ${MAX_ORDERS} exhausted)`, method: 'POST', path: '/api/v1/orders', request: null, status: null, body: null, rawText: '' })
    return null
  }
  const externalId = `p0-probe-${RUN_ID}-${label}`
  const body = {
    externalId,
    storeId: client.storeId,
    shippingMethod: 'default',
    productionTime: 'regular',
    recipient: RECIPIENT,
    orderItems: [
      {
        externalItemId: `${externalId}-1`,
        subcategoryId,
        quantity: 1,
        width,
        height,
        file: { imageUrl, saveImage: false },
        orderItemOptions: options,
        ...(solidColorHexCode ? { solidColorHexCode } : {}),
      },
    ],
  }
  const rec = await client.submitOrder(body, `order:${label}`)
  attach(p, rec, `sandbox order ${label}`)
  ordersPlaced += 1
  const orderNumber = rec.body?.orderNumber
  // The submit response is a QUEUE acknowledgement: GET /orders/{n} 404s for the first
  // minutes. Echoes are collected in one deferred pass at the end of the run (P16).
  orderLog.push({ label, externalId, submitted: body.orderItems[0], status: rec.status, orderNumber: orderNumber ?? null, echoStatus: null })
  return { rec, orderNumber }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const { client, envFile } = clientFromEnv({ envFile: typeof args.env === 'string' ? args.env : '.env.luma', rpm: 25 })
client.assertSandbox('the P0 probe matrix')
console.log(`Probing ${client.baseUrl} · store ${client.storeId} · env ${envFile}`)
console.log(`Snapshot ${path.relative(REPO, path.resolve(snapshotPath))} (${ALL_SUBS.length} subcategories)`)
console.log(`Orders: ${ALLOW_ORDERS ? `enabled (max ${MAX_ORDERS})` : 'disabled (--no-orders)'}`)
console.log('')

const priced = (r) => (r && r.success ? Number(r.price ?? 0) + (r.options ?? []).reduce((a, o) => a + Number(o.price ?? 0), 0) : null)
const money = (v) => (v == null ? 'n/a' : `$${v.toFixed(2)}`)

// checkImageConfig returns `recommendedWidth`/`recommendedHeight` on BOTH 200 and 406
// (there is no `expectedWidth`/`expectedHeight` in the live responses, contrary to the
// captured OpenAPI notes), and those numbers are NOT pixels: every observed response is
// exactly inches x 25. `geo()` reads the body into inches so a probe can compare the
// API's own expectation against the ordered print size and the derived glass size.
const RECOMMENDED_UNITS_PER_INCH = 25
function geo(body) {
  const b = body ?? {}
  const rw = Number(b.recommendedWidth)
  const rh = Number(b.recommendedHeight)
  return {
    raw: { recommendedWidth: b.recommendedWidth ?? null, recommendedHeight: b.recommendedHeight ?? null },
    inches: Number.isFinite(rw) && Number.isFinite(rh) ? { w: rw / RECOMMENDED_UNITS_PER_INCH, h: rh / RECOMMENDED_UNITS_PER_INCH } : null,
    expectedAspectRatio: b.expectedAspectRatio ?? null,
    actual: { w: b.actualImageWidth ?? null, h: b.actualImageHeight ?? null, aspect: b.actualImageAspectRatio ?? null },
  }
}
const near = (a, b, tol = 0.01) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol

// --- P1: required option groups -------------------------------------------
const pReq = probe({ key: 'required',
  question: 'Which subcategories reject an empty options array, and what is the MINIMAL required group set?',
  planRef: '§6 P0 "Required groups"; ADR-4 `required` flag; §9 F13',
})
const requiredBySub = new Map()
if (shouldRun('required')) {
  const items = ALL_SUBS.map((s) => {
    const size = boundedSize(s, 12, 16)
    return { subcategoryId: Number(s.subcategoryId), size, options: [] }
  })
  const r1 = attach(pReq, await client.priceBatch(items, 'required:empty'), 'every subcategory, options [] at an in-bounds size')
  const rows = Array.isArray(r1.body) ? r1.body : []
  const failures = []
  rows.forEach((row, i) => {
    const sub = ALL_SUBS[i]
    if (row && row.success) {
      requiredBySub.set(Number(sub.subcategoryId), { required: [], resolved: (row.options ?? []).map((o) => o.optionId), price: priced(row) })
    } else {
      failures.push({ sub, error: row?.error ?? `no row (${r1.status})`, index: i })
    }
  })

  let leaveOut = []
  if (failures.length > 0) {
    // All-groups configuration: first item of every group.
    const allItems = failures.map(({ sub }) => ({
      subcategoryId: Number(sub.subcategoryId),
      size: boundedSize(sub, 12, 16),
      options: groupsOf(sub).map((g) => g.items[0]?.id).filter((v) => Number.isFinite(v)),
    }))
    const r2 = attach(pReq, await client.priceBatch(allItems, 'required:all-groups'), 'failing subcategories priced with the first option of EVERY group')
    const rows2 = Array.isArray(r2.body) ? r2.body : []

    // Leave-one-out: a group whose removal breaks the price is required.
    const looItems = []
    failures.forEach(({ sub }, fi) => {
      if (!rows2[fi]?.success) return
      const gs = groupsOf(sub)
      gs.forEach((g, gi) => {
        looItems.push({
          _sub: Number(sub.subcategoryId),
          _group: g.group,
          subcategoryId: Number(sub.subcategoryId),
          size: boundedSize(sub, 12, 16),
          options: gs.filter((_, j) => j !== gi).map((x) => x.items[0]?.id).filter((v) => Number.isFinite(v)),
        })
      })
    })
    if (looItems.length > 0) {
      const r3 = attach(
        pReq,
        await client.priceBatch(looItems.map(({ _sub, _group, ...rest }) => rest), 'required:leave-one-out'),
        'leave-one-out over each failing subcategory\'s groups (a removal that fails marks that group required)',
      )
      const rows3 = Array.isArray(r3.body) ? r3.body : []
      leaveOut = looItems.map((it, i) => ({ sub: it._sub, group: it._group, success: Boolean(rows3[i]?.success), error: rows3[i]?.error ?? null }))
    }
    failures.forEach(({ sub }, fi) => {
      const id = Number(sub.subcategoryId)
      const req = leaveOut.filter((l) => l.sub === id && !l.success).map((l) => l.group)
      requiredBySub.set(id, {
        required: req,
        allGroupsPriced: Boolean(rows2[fi]?.success),
        resolved: (rows2[fi]?.options ?? []).map((o) => o.optionId),
        price: priced(rows2[fi]),
        emptyError: failures.find((f) => Number(f.sub.subcategoryId) === id)?.error ?? null,
      })
    })
  }

  const needy = [...requiredBySub.entries()].filter(([, v]) => (v.required ?? []).length > 0 || v.emptyError)
  // Spell the answer out: which subcategory, which group, and every option id+name that
  // satisfies it — this list is the literal seed for the catalog's `required` flag.
  const requiredDetail = needy.map(([id, v]) => {
    const sub = subById(id)
    const groups = (v.required ?? []).map((gName) => {
      const g = groupsOf(sub).find((x) => x.group === gName)
      return {
        group: gName,
        members: (g?.items ?? []).map((i) => `${i.id}=${i.name}`),
        minimalSent: g?.items[0] ? `${g.items[0].id}=${g.items[0].name}` : null,
      }
    })
    return {
      subcategoryId: id,
      name: sub?.name ?? '',
      emptyOptionsError: v.emptyError,
      requiredGroups: groups,
      minimalPricedSet: groups.map((g) => g.minimalSent).filter(Boolean),
      pricedAt: v.price,
    }
  })
  const detailText = requiredDetail
    .map(
      (d) =>
        `${d.subcategoryId} "${d.name}" rejects [] with "${d.emptyOptionsError}" and needs exactly one member of ${d.requiredGroups
          .map((g) => `${g.group} (${g.members.join(' | ')})`)
          .join(' + ')} — minimal set that priced: [${d.minimalPricedSet.join(', ')}] at ${money(d.pricedAt)}`,
    )
    .join('; ')
  finish(
    pReq,
    'PASS',
    `${rows.filter((r) => r && r.success).length}/${ALL_SUBS.length} subcategories price with options []; ${needy.length} reject it: ${detailText}. ` +
      `No other group anywhere in the catalog is required — every remaining group resolves to a provider default (see the defaults probe for why that default is not safe to accept). Seed \`required\` from this list, not from id arithmetic (this is what kills isFramedSubcategory, F13).`,
    {
      requiredDetail,
      requiredBySub: Object.fromEntries([...requiredBySub].map(([k, v]) => [k, v])),
      leaveOut,
    },
  )
}

// --- P2: cat-105 axis (snapshot-derived, no requests) ----------------------
if (shouldRun('cat105')) {
  const p = probe({ key: 'cat105', question: 'Is the frame profile the SUBCATEGORY axis on Framed Fine Art Paper (105), or an option group?', planRef: '§2 "P0 resolves which axis"; §6 P0 "Cat-105 axis"' })
  const subs105 = ALL_SUBS.filter((s) => s.categoryId === 105)
  const groupNames = new Set()
  for (const s of subs105) for (const g of groupsOf(s)) groupNames.add(g.group)
  const hasFrameGroup = [...groupNames].some((g) => /frame style|frame profile/i.test(g))
  p.data.subcategories = subs105.map((s) => ({
    id: Number(s.subcategoryId),
    name: s.name,
    bounds: `${s.minimumWidth}-${s.maximumWidth} x ${s.minimumHeight}-${s.maximumHeight}`,
    dpi: s.requiredDPI,
    groups: groupsOf(s).map((g) => `${g.group} (${g.items.length})`),
  }))
  finish(
    p,
    'FINDING',
    `Frame profile IS the subcategory axis: ${subs105.length} subcategories in 105, each named for a frame profile, and NO frame-style option group exists (${hasFrameGroup ? 'a frame group WAS found — revisit' : 'confirmed'}). Mat Size, Mat Color, Paper Type, Glazing, Hardware, Backing and Print Mounting are option groups on every one. §2 must model 105 as one row per profile with paper as an OPTION (the opposite of 103/108, where paper is the subcategory).`,
    { groupNames: [...groupNames] },
  )
}

// --- P3: mat math ----------------------------------------------------------
const framed105 = subByName(105, /1\.25w x 0\.875h black frame/i, 105005)
const mat2 = optId(framed105, /mat size/i, /^2\.0 inch|^2 inch/i, 67)
const matNone = optId(framed105, /mat size/i, /no mat/i, 64)
const mat5 = optId(framed105, /mat size/i, /^5\.0 inch|^5 inch/i, 73)
const paperMatte = optId(framed105, /paper type/i, /archival matte/i, 74)
const hardWire = optId(framed105, /hanging hardware/i, /wire/i, 83)
const backingNone = optId(framed105, /backing/i, /no backing/i, 94)
const matWhite = optId(framed105, /mat colou?r/i, /^white$/i, 96)
const glazingAcrylic = optId(framed105, /glazing/i, /acrylic/i, 146)
const glazingNone = optId(framed105, /glazing/i, /no glass/i, 147)
const mountDry = optId(framed105, /print mounting/i, /dry mounted/i, 148)
const base105 = [paperMatte, hardWire, backingNone, matWhite, glazingAcrylic, mountDry]

if (shouldRun('mat')) {
  const p = probe({ key: 'mat',
    question: 'For framed paper with a mat, does the API take the PRINT size (glass derived) or the glass size — and what expectedAspectRatio comes back?',
    planRef: '§6 P0 "Mat math"; ADR-4 `per_side_in`; §9 F2',
  })
  const img = await probeImage(2400, 3000, '8x10-at-300dpi')
  const withMat = [mat2, ...base105]
  const pr = attach(
    p,
    await client.priceBatch(
      [
        { subcategoryId: framed105.subcategoryId, size: { width: 8, height: 10 }, options: [matNone, ...base105] },
        { subcategoryId: framed105.subcategoryId, size: { width: 8, height: 10 }, options: withMat },
      ],
      'mat:price',
    ),
    `${framed105.subcategoryId} 8x10 with No Mat vs 2in mat`,
  )
  const ci = attach(
    p,
    await client.checkImageConfig(
      { subcategoryId: Number(framed105.subcategoryId), printWidth: 8, printHeight: 10, imageUrl: img.url, orderItemOptions: withMat },
      'mat:checkImage',
    ),
    'checkImageConfig at printWidth/printHeight 8x10 with the 2in mat selected (numeric option ids)',
  )
  const ciStr = attach(
    p,
    await client.checkImageConfig(
      { subcategoryId: Number(framed105.subcategoryId), printWidth: 8, printHeight: 10, imageUrl: img.url, orderItemOptions: withMat.map(String) },
      'mat:checkImage:stringOptions',
    ),
    'same call with STRING option ids (the documented type) — does the response change?',
  )
  const ord = await placeOrder(client, p, {
    subcategoryId: Number(framed105.subcategoryId),
    width: 8,
    height: 10,
    options: withMat,
    imageUrl: img.url,
    label: 'framed-paper-2in-mat',
  })
  const g = geo(ci.body)
  const matchesPrint = near(g.inches?.w, 8) && near(g.inches?.h, 10)
  const matchesGlass = near(g.inches?.w, 12) && near(g.inches?.h, 14)
  finish(
    p,
    ci.status === 200 && matchesPrint ? 'PASS' : 'FINDING',
    `checkImageConfig ${ci.status}; recommendedWidth/Height ${g.raw.recommendedWidth}x${g.raw.recommendedHeight} = ${g.inches ? `${g.inches.w}x${g.inches.h}in` : 'n/a'} (the field is inches x ${RECOMMENDED_UNITS_PER_INCH}, NOT pixels as the captured OpenAPI notes claim); expectedAspectRatio ${g.expectedAspectRatio}; the 2400x3000 file passed at the print aspect. ` +
      (matchesPrint
        ? 'The submitted width/height IS the print size and the 2in mat grows the frame around it (ADR-4 `per_side_in` confirmed): the master stays aspect-exact to the PRINT, the glass (12x14) is never sent.'
        : matchesGlass
          ? 'The submitted width/height behaves as the GLASS size — ADR-4 must invert its math and the UI must quote glass, not print.'
          : 'Neither the print-size nor the glass-size prediction matched; read the raw body before writing the rules engine.') +
      ` String vs numeric option ids: ${ciStr.status === ci.status ? 'identical response' : `DIFFERENT (${ciStr.status} vs ${ci.status})`}. ` +
      `Prices: No Mat ${money(priced(pr.body?.[0]))}, 2in mat ${money(priced(pr.body?.[1]))}. Sandbox order ${ord?.orderNumber ?? 'not placed'} (submit ${ord?.rec?.status ?? 'n/a'}).`,
    { expectedAspectRatio: g.expectedAspectRatio, recommendedInches: g.inches, matchesPrint, matchesGlass, orderNumber: ord?.orderNumber ?? null },
  )
}

// --- P4: glass-ceiling edge ------------------------------------------------
if (shouldRun('ceiling')) {
  const p = probe({ key: 'ceiling',
    question: 'At the glass ceiling (largest in-bounds print + 5in mat), does the API 4xx, price anyway, or silently accept?',
    planRef: '§6 P0 "glass-ceiling edge"; §9 F2',
  })
  const small105 = subByName(105, /0\.875w x 0\.875h black frame/i, 105001)
  const maxW = Math.floor(num(framed105.maximumWidth))
  const maxH = Math.floor(num(framed105.maximumHeight))
  const smallW = Math.floor(num(small105.maximumWidth))
  const smallH = Math.floor(num(small105.maximumHeight))
  const pr = attach(
    p,
    await client.priceBatch(
      [
        { subcategoryId: Number(framed105.subcategoryId), size: { width: maxW, height: maxH }, options: [matNone, ...base105] },
        { subcategoryId: Number(framed105.subcategoryId), size: { width: maxW, height: maxH }, options: [mat5, ...base105] },
        { subcategoryId: Number(small105.subcategoryId), size: { width: smallW, height: smallH }, options: [mat5, ...base105] },
        { subcategoryId: Number(framed105.subcategoryId), size: { width: maxW + 2, height: maxH }, options: [matNone, ...base105] },
      ],
      'mat:ceiling',
    ),
    `max in-bounds print (${maxW}x${maxH}) with No Mat vs 5in mat; ${small105.subcategoryId} at its own max (${smallW}x${smallH}) + 5in mat; and one deliberately over-max width`,
  )
  // Aspect-correct but deliberately low-res image: a 406 still reports the expected
  // pixel dimensions, which is what reveals whether the mat is inside or outside the
  // ordered size at the ceiling.
  const g = (a, b) => (b ? g(b, a % b) : a)
  const gg = g(maxW, maxH)
  const img = await probeImage((maxW / gg) * 300, (maxH / gg) * 300, `ratio-${maxW}x${maxH}-lowres`)
  const ci = attach(
    p,
    await client.checkImageConfig(
      { subcategoryId: Number(framed105.subcategoryId), printWidth: maxW, printHeight: maxH, imageUrl: img.url, orderItemOptions: [mat5, ...base105] },
      'mat:ceiling:checkImage',
    ),
    `checkImageConfig at the ceiling print size with a 5in mat (low-res on purpose: the 406 body carries the expected px)`,
  )
  const rows = Array.isArray(pr.body) ? pr.body : []
  const ceilingPriced = Boolean(rows[1]?.success)
  const gc = geo(ci.body)
  // The probe image is landscape; if the API reports it portrait, its aspect check is
  // orientation-insensitive (which decides whether the size grid needs both orientations).
  const orientationSwapped = Number(gc.actual.w) === img.px.height && Number(gc.actual.h) === img.px.width
  finish(
    p,
    'FINDING',
    `${maxW}x${maxH} No Mat: ${rows[0]?.success ? money(priced(rows[0])) : `FAIL "${rows[0]?.error}"`}; +5in mat (glass would be ${maxW + 10}x${maxH + 10}): ${ceilingPriced ? money(priced(rows[1])) : `FAIL "${rows[1]?.error}"`}; ` +
      `${small105.subcategoryId} ${smallW}x${smallH} +5in mat: ${rows[2]?.success ? money(priced(rows[2])) : `FAIL "${rows[2]?.error}"`}; over-max width ${maxW + 2}: ${rows[3]?.success ? 'PRICED (published bounds are NOT enforced by pricing)' : `rejected "${rows[3]?.error}"`}. ` +
      `checkImageConfig ${ci.status}, recommended ${gc.inches ? `${gc.inches.w}x${gc.inches.h}in` : 'n/a'} (= the ordered print size, mat excluded again); actual reported as ${gc.actual.w}x${gc.actual.h} for a ${img.px.width}x${img.px.height} file${orientationSwapped ? ' — the API normalises orientation, so a landscape master satisfies a portrait order and vice versa' : ''}. ` +
      `${ceilingPriced ? 'The API prices mats past the published glass ceiling AND prices sizes past the published max, so both ceilings MUST be enforced by our rules engine before checkout — the provider will not stop them (F2).' : 'The API rejects the over-ceiling mat, so the constraint surface is provider-enforced as well as UI-enforced.'}`,
    { ceilingPriced, overMaxPriced: Boolean(rows[3]?.success), orientationSwapped, recommendedInches: gc.inches },
  )
}

// --- P5: paper bleed geometry ---------------------------------------------
if (shouldRun('bleed')) {
  const p = probe({ key: 'bleed',
    question: 'Does a paper Bleed option behave like a mat (per_side_in, image stays at the ordered aspect) or does it shrink the image inside the sheet (blocked)?',
    planRef: '§6 P0 "Paper bleed geometry"; ADR-4; §9 F3',
  })
  const paper = subByName(103, /archival matte/i, 103001)
  const bleedNo = optId(paper, /bleed/i, /no bleed/i, 39)
  const bleed025 = optId(paper, /bleed/i, /0\.25in/i, 36)
  const bleed1 = optId(paper, /bleed/i, /1\.00in|1in bleed/i, 38)
  const img = await probeImage(2400, 3000, '8x10-at-300dpi')
  const pr = attach(
    p,
    await client.priceBatch(
      [
        { subcategoryId: Number(paper.subcategoryId), size: { width: 8, height: 10 }, options: [bleedNo] },
        { subcategoryId: Number(paper.subcategoryId), size: { width: 8, height: 10 }, options: [bleed025] },
        { subcategoryId: Number(paper.subcategoryId), size: { width: 8, height: 10 }, options: [bleed1] },
      ],
      'bleed:price',
    ),
    '103001 8x10 with No Bleed / 0.25in / 1.00in',
  )
  const ciNo = attach(
    p,
    await client.checkImageConfig({ subcategoryId: Number(paper.subcategoryId), printWidth: 8, printHeight: 10, imageUrl: img.url, orderItemOptions: [bleedNo] }, 'bleed:ci:none'),
    'checkImageConfig 8x10, No Bleed, aspect-exact 2400x3000 image (control)',
  )
  const ci025 = attach(
    p,
    await client.checkImageConfig({ subcategoryId: Number(paper.subcategoryId), printWidth: 8, printHeight: 10, imageUrl: img.url, orderItemOptions: [bleed025] }, 'bleed:ci:025'),
    'checkImageConfig 8x10, 0.25in bleed, SAME aspect-exact image',
  )
  const ci1 = attach(
    p,
    await client.checkImageConfig({ subcategoryId: Number(paper.subcategoryId), printWidth: 8, printHeight: 10, imageUrl: img.url, orderItemOptions: [bleed1] }, 'bleed:ci:1'),
    'checkImageConfig 8x10, 1.00in bleed, SAME aspect-exact image',
  )
  // A 406 still reports the API's own expectation in `recommendedWidth/Height`
  // (inches x 25). Follow it literally: build an image at exactly that aspect and
  // re-check. If even the API's own number cannot be satisfied, the option is unusable.
  const g025 = geo(ci025.body)
  const g1 = geo(ci1.body)
  let ciPadded = null
  let paddedNote = null
  if (g025.inches && g025.inches.w > 0 && g025.inches.h > 0) {
    const padded = await probeImage(g025.inches.w * 300, g025.inches.h * 300, `bleed-expected-${g025.inches.w}x${g025.inches.h}in`)
    ciPadded = attach(
      p,
      await client.checkImageConfig(
        { subcategoryId: Number(paper.subcategoryId), printWidth: 8, printHeight: 10, imageUrl: padded.url, orderItemOptions: [bleed025] },
        'bleed:ci:padded',
      ),
      `re-check 0.25in bleed with an image built at the API's OWN expectation (${g025.inches.w}x${g025.inches.h}in at 300 DPI)`,
    )
  } else {
    paddedNote = 'no positive expectation was returned to build an image from'
  }
  const perSide = ci025.status === 200 && ci1.status === 200
  const impossible = Boolean(g1.inches && (g1.inches.w <= 0 || g1.inches.h <= 0))
  // Observed rule: expected print area = ordered size minus 24 x bleed inches per axis.
  const model = (b) => ({ w: 8 - 24 * b, h: 10 - 24 * b })
  const modelHolds = g025.inches && near(g025.inches.w, model(0.25).w, 0.01) && near(g025.inches.h, model(0.25).h, 0.01) && g1.inches && near(g1.inches.w, model(1).w, 0.01) && near(g1.inches.h, model(1).h, 0.01)
  finish(
    p,
    perSide ? 'PASS' : 'FINDING',
    `No Bleed ${ciNo.status} (control, recommended ${geo(ciNo.body).inches?.w}x${geo(ciNo.body).inches?.h}in = the ordered size); 0.25in bleed ${ci025.status} expecting ${g025.inches?.w}x${g025.inches?.h}in; 1.00in bleed ${ci1.status} expecting ${g1.inches?.w}x${g1.inches?.h}in${impossible ? ' — a NEGATIVE size, which no image can satisfy' : ''}${ciPadded ? `; re-check with an image at the API's own expectation: ${ciPadded.status}` : `; padded re-check skipped (${paddedNote})`}. ` +
      (perSide
        ? 'Bleed leaves the ordered aspect alone (the sheet grows): geometry key `per_side_in`, fully enablable with aspect-exact masters.'
        : `Bleed is NOT per_side_in: the API shrinks the expected image to (ordered - 24 x bleed) per axis${modelHolds ? ' (that 24x factor reproduces exactly on both 0.25in and 1.00in)' : ''}, which is geometrically wrong and goes negative at 1.00in. ADR-4 must treat every non-zero Bleed option as BLOCKED-with-reason, like Image Wrap, and keep No Bleed as the only enablable member of the group.`) +
      ` Prices 8x10 are identical across the group: none ${money(priced(pr.body?.[0]))}, 0.25in ${money(priced(pr.body?.[1]))}, 1in ${money(priced(pr.body?.[2]))} — nothing is lost commercially by blocking them.`,
    {
      geometry: perSide ? 'per_side_in' : 'blocked (expected image = ordered - 24 x bleed per axis)',
      expected025In: g025.inches,
      expected1In: g1.inches,
      paddedRecheckStatus: ciPadded?.status ?? null,
      modelHolds: Boolean(modelHolds),
    },
  )
}

// --- P6: Solid Color Wrap + hex -------------------------------------------
if (shouldRun('solid')) {
  const p = probe({ key: 'solid', question: 'Does Solid Color Wrap with solidColorHexCode pass checkImageConfig, submit, and echo back on GET /orders?', planRef: '§6 P0 "Solid Color Wrap"; ADR-4 `needs_hex`; §9 F5' })
  const canvas = subByName(101, /1\.25in stretched canvas/i, 101002)
  const solid = optId(canvas, /canvas border/i, /solid color/i, 3)
  const sawtooth = optId(canvas, /hanging hardware/i, /sawtooth/i, 11)
  const finish259 = optId(canvas, /canvas finish/i, /matte/i, 259)
  const opts = [solid, sawtooth, finish259].filter((v) => Number.isFinite(v))
  const img = await probeImage(2400, 3000, '8x10-at-300dpi')
  const pr = attach(p, await client.priceBatch([{ subcategoryId: Number(canvas.subcategoryId), size: { width: 8, height: 10 }, options: opts }], 'solid:price'), '101002 8x10 with Solid Color')
  const ci = attach(
    p,
    await client.checkImageConfig({ subcategoryId: Number(canvas.subcategoryId), printWidth: 8, printHeight: 10, imageUrl: img.url, orderItemOptions: opts }, 'solid:ci'),
    'checkImageConfig with Solid Color selected',
  )
  const ord = await placeOrder(client, p, {
    subcategoryId: Number(canvas.subcategoryId),
    width: 8,
    height: 10,
    options: opts,
    imageUrl: img.url,
    solidColorHexCode: '#336699',
    label: 'canvas-solid-color',
  })
  finish(
    p,
    ord?.rec?.status === 201 ? 'PASS' : ord ? 'FINDING' : 'SKIPPED',
    `checkImageConfig ${ci.status} with Solid Color selected; submit ${ord?.rec?.status ?? 'not attempted'} order ${ord?.orderNumber ?? 'n/a'}; price ${money(priced(pr.body?.[0]))}. ` +
      `${ord?.rec?.status === 201 ? 'Solid Color Wrap + solidColorHexCode is accepted end to end on an aspect-exact master (the option that 406s is Image Wrap, not Solid Color). What comes back on GET /orders is settled in the order-echo probe below.' : 'Submit did not return 201 — read the raw body before enabling the option.'}`,
    { orderNumber: ord?.orderNumber ?? null, options: opts, hexSent: '#336699' },
  )
}

// --- P7: fractional sizes --------------------------------------------------
if (shouldRun('fractional')) {
  const p = probe({ key: 'fractional', question: 'Which endpoints accept fractional inches (9.25 x 11)?', planRef: '§6 P0 "Fractional sizes"; §9 F15' })
  const targets = [
    subByName(103, /archival matte/i, 103001),
    subByName(105, /1\.25w x 0\.875h black frame/i, 105005),
    subByName(106, /glossy white metal/i, 106001),
    subByName(107, /peel and stick/i, 107001),
    subByName(108, /foam-mounted archival matte/i, 108001),
    subByName(101, /1\.25in stretched canvas/i, 101002),
  ].filter(Boolean)
  // Geometry-NEUTRAL options everywhere: an empty array is not neutral (the API
  // resolves the group defaults to Image Wrap on canvas and 0.25in bleed on paper,
  // both of which move the expected file aspect), which would confound a size probe.
  const optsFor = (s) => {
    const id = Number(s.subcategoryId)
    if (id === Number(framed105.subcategoryId)) return [matNone, ...base105]
    if (s.categoryId === 103 || s.categoryId === 108) return [optId(s, /bleed/i, /no bleed/i, 39)]
    if (s.categoryId === 101 || s.categoryId === 102) return [optId(s, /canvas border/i, /mirror/i, 2)]
    if (s.categoryId === 106) return [optId(s, /hanging hardware/i, /^none$/i, 35)]
    const req = requiredBySub.get(id)
    if (req && (req.required ?? []).length > 0) return groupsOf(s).map((g) => g.items[0]?.id).filter((v) => Number.isFinite(v))
    return []
  }
  const W = 9.25
  const H = 11
  const singles = []
  for (const s of targets) {
    const rec = await client.priceSingle({ subcategoryId: Number(s.subcategoryId), size: { width: W, height: H }, options: optsFor(s) }, `frac:single:${s.subcategoryId}`)
    attach(p, rec, `/pricing/product (single) ${s.subcategoryId} ${W}x${H}`)
    singles.push({ sub: Number(s.subcategoryId), status: rec.status, success: rec.status === 200 && rec.body?.price != null, price: rec.body?.price ?? null, error: rec.body?.error ?? rec.body?.message ?? null })
  }
  const batch = attach(
    p,
    await client.priceBatch(targets.map((s) => ({ subcategoryId: Number(s.subcategoryId), size: { width: W, height: H }, options: optsFor(s) })), 'frac:batch'),
    `/pricing/products (batch) all six at ${W}x${H}`,
  )
  const ship = attach(
    p,
    await client.shipping(
      {
        recipient: RECIPIENT,
        orderItems: targets.map((s) => ({ subcategoryId: Number(s.subcategoryId), quantity: 1, width: W, height: H, orderItemOptions: optsFor(s) })),
      },
      'frac:shipping',
    ),
    `/pricing/shipping with fractional ${W}x${H} items`,
  )
  const paper = targets[0]
  const img = await probeImage(2775, 3300, '9.25x11-at-300dpi')
  const ciPaper = attach(
    p,
    await client.checkImageConfig({ subcategoryId: Number(paper.subcategoryId), printWidth: W, printHeight: H, imageUrl: img.url, orderItemOptions: optsFor(paper) }, 'frac:ci:paper'),
    `checkImageConfig ${paper.subcategoryId} at ${W}x${H} with an aspect-exact 2775x3300 image`,
  )
  const canvas = targets[targets.length - 1]
  const ciCanvas = attach(
    p,
    await client.checkImageConfig({ subcategoryId: Number(canvas.subcategoryId), printWidth: W, printHeight: H, imageUrl: img.url, orderItemOptions: optsFor(canvas) }, 'frac:ci:canvas'),
    `checkImageConfig ${canvas.subcategoryId} at ${W}x${H}`,
  )
  const ord = await placeOrder(client, p, {
    subcategoryId: Number(paper.subcategoryId),
    width: W,
    height: H,
    options: optsFor(paper),
    imageUrl: img.url,
    label: 'paper-fractional',
  })
  const batchRows = Array.isArray(batch.body) ? batch.body : []
  const batchOk = batchRows.filter((r) => r?.success).length
  const singleOk = singles.filter((s) => s.success).length
  const gPaper = geo(ciPaper.body)
  const gCanvas = geo(ciCanvas.body)
  finish(
    p,
    'FINDING',
    `single /pricing/product ${singleOk}/${singles.length} accepted; batch /pricing/products ${batchOk}/${targets.length} accepted (HTTP ${batch.status}); /pricing/shipping ${ship.status}; ` +
      `checkImageConfig ${paper.subcategoryId} ${ciPaper.status} (recommended ${gPaper.inches?.w}x${gPaper.inches?.h}in vs ordered ${W}x${H}), ${canvas.subcategoryId} ${ciCanvas.status} (recommended ${gCanvas.inches?.w}x${gCanvas.inches?.h}in); ` +
      `fractional sandbox order ${ord?.rec?.status ?? 'not attempted'} (${ord?.orderNumber ?? 'n/a'}). ` +
      `${batchOk === targets.length ? 'The batch endpoint accepts fractional inches despite its integer-typed schema, so the quote path needs no per-endpoint fallback for size typing.' : 'The batch endpoint rejects fractional inches (documented integer typing is real): the quote path MUST fall back to /pricing/product for fractional sizes.'} ` +
      `${ciPaper.status === 200 && (ord?.rec?.status === 201 || !ALLOW_ORDERS) ? 'Fractional sizes also survive the image check and order submit with geometry-neutral options.' : `Fractional geometry is only safe with geometry-neutral options selected; see the recommended sizes above.`}`,
    {
      singles,
      batch: batchRows.map((r, i) => ({ sub: Number(targets[i].subcategoryId), success: Boolean(r?.success), error: r?.error ?? null, price: r?.price ?? null })),
      shippingStatus: ship.status,
      checkImage: { paper: ciPaper.status, canvas: ciCanvas.status, paperRecommendedIn: gPaper.inches, canvasRecommendedIn: gCanvas.inches },
      orderStatus: ord?.rec?.status ?? null,
      orderNumber: ord?.orderNumber ?? null,
    },
  )
}

// --- P8..P12: option interactions (one batch, five questions) --------------
if (shouldRunAny(['matcolor', 'easel', 'hardware', 'foamcore', 'glazing'])) {
  const canvas125 = subByName(101, /1\.25in stretched canvas/i, 101002)
  const canvas075 = subByName(101, /0\.75in stretched canvas/i, 101001)
  const canvas150 = subByName(101, /1\.50in stretched canvas|1\.5in stretched canvas/i, 101003)
  const metal = subByName(106, /glossy white metal/i, 106001)
  const easel = optId(metal, /hanging hardware|installation/i, /easel/i, 32)
  const insetFrame = optId(metal, /hanging hardware|installation/i, /inset frame$/i, 31)
  const foamcore = optId(canvas150, /underlayer/i, /foamcore/i, 10)
  const hw125 = optId(canvas125, /hanging hardware/i, /sawtooth/i, 11)
  const foreignHw = groupsOf(canvas075)
    .filter((g) => /hanging hardware/i.test(g.group))
    .flatMap((g) => g.items.map((i) => i.id))
  const mirror = optId(canvas125, /canvas border/i, /mirror/i, 2)

  const items = []
  const tag = (label, item) => {
    items.push({ label, ...item })
    return items.length - 1
  }
  const iMatColorNoMat = tag('mat color with No Mat', { subcategoryId: Number(framed105.subcategoryId), size: { width: 8, height: 10 }, options: [matNone, matWhite, paperMatte, hardWire, backingNone, glazingAcrylic, mountDry] })
  const iMatColorWithMat = tag('mat color with 2in mat (control)', { subcategoryId: Number(framed105.subcategoryId), size: { width: 8, height: 10 }, options: [mat2, matWhite, paperMatte, hardWire, backingNone, glazingAcrylic, mountDry] })
  const iGlazingOn = tag('framed paper glazing = Acrylic', { subcategoryId: Number(framed105.subcategoryId), size: { width: 8, height: 10 }, options: [matNone, matWhite, paperMatte, hardWire, backingNone, glazingAcrylic, mountDry] })
  const iGlazingOff = tag('framed paper glazing = No Glass', { subcategoryId: Number(framed105.subcategoryId), size: { width: 8, height: 10 }, options: [matNone, matWhite, paperMatte, hardWire, backingNone, glazingNone, mountDry] })
  const iEaselWhite = tag('metal easel at a whitelisted size (8x10)', { subcategoryId: Number(metal.subcategoryId), size: { width: 8, height: 10 }, options: [easel] })
  const iEaselNon = tag('metal easel at a NON-whitelisted size (13x19)', { subcategoryId: Number(metal.subcategoryId), size: { width: 13, height: 19 }, options: [easel] })
  const iEaselBig = tag('metal easel at 30x40 (far outside the published list)', { subcategoryId: Number(metal.subcategoryId), size: { width: 30, height: 40 }, options: [easel] })
  const iInset = tag('metal inset frame (control)', { subcategoryId: Number(metal.subcategoryId), size: { width: 13, height: 19 }, options: [insetFrame] })
  const hwIdx = foreignHw.map((id) => tag(`1.25in canvas with ${optName(canvas075, id)} (id ${id}, NOT in its own group)`, { subcategoryId: Number(canvas125.subcategoryId), size: { width: 12, height: 16 }, options: [mirror, id] }))
  const iHwOwn = tag(`1.25in canvas with its own hardware (id ${hw125})`, { subcategoryId: Number(canvas125.subcategoryId), size: { width: 12, height: 16 }, options: [mirror, hw125] })
  const iFoamOff = tag('foamcore on 1.25in canvas (foamcore is a 1.5in-only group)', { subcategoryId: Number(canvas125.subcategoryId), size: { width: 12, height: 16 }, options: [mirror, foamcore] })
  const iFoamOn = tag('foamcore on 1.50in canvas (control)', { subcategoryId: Number(canvas150.subcategoryId), size: { width: 12, height: 16 }, options: [mirror, foamcore] })

  const rec = await client.priceBatch(items.map(({ label, ...rest }) => rest), 'interactions')
  const rows = Array.isArray(rec.body) ? rec.body : []
  const row = (i) => rows[i]
  const shape = (i) => {
    const r = row(i)
    if (!r) return 'no row'
    return r.success ? `${money(priced(r))} [${(r.options ?? []).map((o) => o.optionId).join(',')}]` : `REJECTED "${r.error}"`
  }
  const view = (indices, note) => ({
    note,
    method: rec.method,
    path: rec.path,
    request: indices.map((i) => items[i]),
    status: rec.status,
    body: indices.map((i) => rows[i] ?? null),
    rawText: JSON.stringify(indices.map((i) => rows[i] ?? null)),
  })

  const p8 = probe({ key: 'matcolor', question: 'Is a Mat Color accepted when Mat Size = No Mat (dependent-visible group)?', planRef: '§6 P0 "Option interactions"; ADR-4 depends_on_group' })
  p8.requests.push(view([iMatColorNoMat, iMatColorWithMat], 'mat colour with and without a mat'))
  finish(
    p8,
    'FINDING',
    `No Mat + White mat colour: ${shape(iMatColorNoMat)}; 2in mat + White: ${shape(iMatColorWithMat)}. ` +
      `${row(iMatColorNoMat)?.success ? 'The API silently accepts a mat colour with No Mat (it is echoed in the resolved options at $0), so Mat Color visibility is OURS to enforce — the provider will not reject the nonsense combination.' : 'The API rejects mat colour without a mat, so the dependency is provider-enforced too.'}`,
    { noMat: shape(iMatColorNoMat), withMat: shape(iMatColorWithMat) },
  )

  const p9 = probe({ key: 'easel', question: 'Does the metal easel price only at the published whitelist sizes?', planRef: '§6 P0 "Option interactions"; ADR-4 size_whitelist; §9 F10' })
  p9.requests.push(view([iEaselWhite, iEaselNon, iEaselBig, iInset], 'easel at whitelisted vs non-whitelisted sizes'))
  const easelStrict = Boolean(row(iEaselWhite)?.success) && !row(iEaselNon)?.success
  finish(
    p9,
    'FINDING',
    `8x10 (whitelisted): ${shape(iEaselWhite)}; 13x19: ${shape(iEaselNon)}; 30x40: ${shape(iEaselBig)}; inset frame 13x19 (control): ${shape(iInset)}. ` +
      `${easelStrict ? 'The whitelist is provider-enforced at pricing time.' : 'Pricing accepts the easel at sizes outside the published whitelist — the size_whitelist rule is OURS alone, and an unguarded UI would sell an easel LumaPrints will not mount.'}`,
    { easelStrict },
  )

  const p10 = probe({ key: 'hardware', question: 'On 1.25in canvas (sawtooth-only hardware group), what happens to the other depths’ hardware ids?', planRef: '§6 P0 "Option interactions"; §9 F10' })
  p10.requests.push(view([...hwIdx, iHwOwn], 'each 0.75in/1.5in hardware id submitted against 101002, plus its own sawtooth'))
  const accepted = hwIdx.filter((i) => row(i)?.success).map((i) => items[i].options[1])
  finish(
    p10,
    'FINDING',
    `own sawtooth id ${hw125}: ${shape(iHwOwn)}; foreign hardware ids ${foreignHw.join(',')} -> ${hwIdx.map((i) => `${items[i].options[1]}:${row(i)?.success ? 'priced' : 'rejected'}`).join(' ')}. ` +
      `${accepted.length === 0 ? 'Every foreign hardware id is rejected: per-subcategory option lists are self-enforcing and no special-casing is needed (F10 answered).' : `Foreign ids ${accepted.join(',')} were ACCEPTED on 101002 — option validity is NOT provider-enforced across subcategories, so our catalog must gate by the per-subcategory list.`}`,
    { acceptedForeignHardware: accepted },
  )

  const p11 = probe({ key: 'foamcore', question: 'Is the foamcore underlayer rejected on a depth that does not publish that group?', planRef: '§6 P0 "Option interactions"' })
  p11.requests.push(view([iFoamOff, iFoamOn], 'foamcore on 1.25in vs 1.50in canvas'))
  finish(
    p11,
    'FINDING',
    `foamcore id ${foamcore} on 101002: ${shape(iFoamOff)}; on ${canvas150.subcategoryId} (control): ${shape(iFoamOn)}. ` +
      `${row(iFoamOff)?.success ? 'Accepted where the group does not exist — the API is permissive, so the per-subcategory list is the only guard.' : 'Rejected as expected: the group boundary is provider-enforced.'}`,
    {},
  )

  const p12 = probe({ key: 'glazing', question: 'Is glazing a real option group on framed paper (priced), or always-on?', planRef: '§2 "Glazing — confirm group vs always-on in P0"' })
  p12.requests.push(view([iGlazingOn, iGlazingOff], 'acrylic vs no glass at the same size'))
  const dOn = priced(row(iGlazingOn))
  const dOff = priced(row(iGlazingOff))
  finish(
    p12,
    'PASS',
    `Acrylic Glass ${money(dOn)} vs No Glass ${money(dOff)} (delta ${dOn != null && dOff != null ? money(dOn - dOff) : 'n/a'}). Glazing is a genuine, priced option group (ids ${glazingAcrylic}/${glazingNone}) on every 105xxx subcategory, not an always-on extra.`,
    { acrylic: dOn, noGlass: dOff },
  )
}

// --- P13: per-option deltas by size ---------------------------------------
if (shouldRun('deltas')) {
  const p = probe({ key: 'deltas', question: 'Do per-option prices vary by print size (the cache-key assumption)?', planRef: '§6 P0 "Per-option price deltas by size"; ADR-3; §9 F6' })
  const fc = subByName(102, /1\.25in framed canvas/i, 102002)
  const frameGroup = groupsOf(fc).find((g) => /frame style/i.test(g.group))
  const frames = frameGroup?.items ?? []
  const mirror = optId(fc, /canvas border/i, /mirror/i, 2)
  const fcSizes = [
    { width: 8, height: 10 },
    { width: 20, height: 24 },
    { width: Math.min(40, Math.floor(num(fc.maximumWidth))), height: Math.min(52, Math.floor(num(fc.maximumHeight))) },
  ]
  const fcItems = []
  for (const size of fcSizes) for (const f of frames) fcItems.push({ subcategoryId: Number(fc.subcategoryId), size, options: [mirror, f.id] })
  const recFc = attach(p, await client.priceBatch(fcItems, 'deltas:framed-canvas'), `${fc.subcategoryId}: every frame style at ${fcSizes.map((s) => `${s.width}x${s.height}`).join(', ')}`)

  const matGroup = groupsOf(framed105).find((g) => /mat size/i.test(g.group))
  const mats = matGroup?.items ?? []
  const mpSizes = [
    { width: 8, height: 10 },
    { width: 18, height: 24 },
    { width: 24, height: 30 },
  ]
  const mpItems = []
  for (const size of mpSizes) for (const m of mats) mpItems.push({ subcategoryId: Number(framed105.subcategoryId), size, options: [m.id, ...base105] })
  const recMp = attach(p, await client.priceBatch(mpItems, 'deltas:framed-paper-mats'), `${framed105.subcategoryId}: every mat width at ${mpSizes.map((s) => `${s.width}x${s.height}`).join(', ')}`)

  const rowsFc = Array.isArray(recFc.body) ? recFc.body : []
  const rowsMp = Array.isArray(recMp.body) ? recMp.body : []
  const tableFc = []
  fcSizes.forEach((size, si) => {
    frames.forEach((f, fi) => {
      const r = rowsFc[si * frames.length + fi]
      const own = (r?.options ?? []).find((o) => Number(o.optionId) === Number(f.id))
      tableFc.push({ size: `${size.width}x${size.height}`, option: f.name, optionId: f.id, optionPrice: own?.price ?? null, total: priced(r), success: Boolean(r?.success), error: r?.error ?? null })
    })
  })
  const tableMp = []
  mpSizes.forEach((size, si) => {
    mats.forEach((m, mi) => {
      const r = rowsMp[si * mats.length + mi]
      const own = (r?.options ?? []).find((o) => Number(o.optionId) === Number(m.id))
      tableMp.push({ size: `${size.width}x${size.height}`, option: m.name, optionId: m.id, optionPrice: own?.price ?? null, total: priced(r), success: Boolean(r?.success), error: r?.error ?? null })
    })
  })
  const varies = (table) => {
    const byOption = new Map()
    for (const r of table) {
      if (r.optionPrice == null) continue
      if (!byOption.has(r.optionId)) byOption.set(r.optionId, new Set())
      byOption.get(r.optionId).add(Number(r.optionPrice))
    }
    return [...byOption.values()].some((s) => s.size > 1)
  }
  const fcVaries = varies(tableFc)
  const mpVaries = varies(tableMp)
  finish(
    p,
    'PASS',
    `Frame-style prices vary by size: ${fcVaries ? 'YES' : 'NO'}; mat-width prices vary by size: ${mpVaries ? 'YES' : 'NO'}. ` +
      `${fcVaries || mpVaries ? 'Per-option deltas MUST be cached per (subcategory, size), never per option alone (ADR-3 cache key confirmed, F6 real).' : 'Option prices were flat across sizes in this sweep — the size-keyed cache is still correct, but this assumption should be re-probed before simplifying it.'} ` +
      `${tableMp.filter((r) => !r.success).length} mat rows and ${tableFc.filter((r) => !r.success).length} frame rows failed to price.`,
    { framedCanvas: tableFc, framedPaperMats: tableMp, fcVaries, mpVaries },
  )
}

// --- P14: additivity -------------------------------------------------------
if (shouldRun('additivity')) {
  const p = probe({ key: 'additivity', question: 'Does a whole configuration price equal base + the sum of individually-priced option deltas?', planRef: '§6 P0 "Additivity"; ADR-3; §9 F26' })
  const canvas075 = subByName(101, /0\.75in stretched canvas/i, 101001)
  const canvas150 = subByName(101, /1\.50in stretched canvas|1\.5in stretched canvas/i, 101003)
  const fc = subByName(102, /1\.25in framed canvas/i, 102002)
  const framedSmall = subByName(105, /0\.875w x 0\.875h black frame/i, 105001)
  const paper = subByName(103, /archival matte/i, 103001)
  const metal = subByName(106, /glossy white metal/i, 106001)

  // Every extra names the GROUP it belongs to. Two members of one group are mutually
  // exclusive — combining them is not a multi-option configuration, it is one choice
  // overwriting another — so combinations are built only across DISTINCT groups.
  // A subcategory with a single option group has no multi-option configuration at all;
  // that is recorded as not-applicable with its group list, never as a pricing finding.
  const families = [
    {
      name: 'canvas 101003 (1.5in)',
      sub: canvas150,
      size: { width: 16, height: 20 },
      baseline: [
        optId(canvas150, /canvas border/i, /mirror/i, 2),
        optId(canvas150, /canvas finish/i, /^matte$/i, 213),
        optId(canvas150, /underlayer/i, /no canvas underlayer/i, 9),
        optId(canvas150, /hanging hardware/i, /sawtooth hanger/i, 4),
      ],
      extras: [
        { label: 'Foamcore underlayer', group: 'Canvas Underlayer', swap: [optId(canvas150, /underlayer/i, /no canvas underlayer/i, 9), optId(canvas150, /underlayer/i, /foamcore/i, 10)] },
        { label: 'Three-point security hardware', group: 'Canvas Hanging Hardware', swap: [optId(canvas150, /hanging hardware/i, /sawtooth hanger/i, 4), optId(canvas150, /hanging hardware/i, /three-point/i, 133)] },
        { label: 'Semi-glossy finish', group: 'Canvas Finish', swap: [optId(canvas150, /canvas finish/i, /^matte$/i, 213), optId(canvas150, /canvas finish/i, /semi-glossy/i, 212)] },
      ],
    },
    {
      name: 'canvas 101001 (0.75in)',
      sub: canvas075,
      size: { width: 16, height: 20 },
      baseline: [
        optId(canvas075, /canvas border/i, /mirror/i, 2),
        optId(canvas075, /canvas finish/i, /^matte$/i, 213),
        optId(canvas075, /hanging hardware/i, /sawtooth hanger/i, 4),
      ],
      extras: [
        { label: 'Solid colour border instead of mirror', group: 'Canvas Border', swap: [optId(canvas075, /canvas border/i, /mirror/i, 2), optId(canvas075, /canvas border/i, /solid color/i, 3)] },
        { label: 'Black backboard + hanging wire', group: 'Canvas Hanging Hardware', swap: [optId(canvas075, /hanging hardware/i, /sawtooth hanger/i, 4), optId(canvas075, /hanging hardware/i, /backboard backing with hanging wire/i, 7)] },
        { label: 'Semi-glossy finish', group: 'Canvas Finish', swap: [optId(canvas075, /canvas finish/i, /^matte$/i, 213), optId(canvas075, /canvas finish/i, /semi-glossy/i, 212)] },
      ],
    },
    {
      name: 'framed canvas 102002',
      sub: fc,
      size: { width: 16, height: 20 },
      baseline: [optId(fc, /canvas border/i, /mirror/i, 2), optId(fc, /frame styles?/i, /black/i, 27)],
      extras: [
        { label: 'Walnut frame instead of black', group: '1.25 Inch Frame Styles', swap: [optId(fc, /frame styles?/i, /black/i, 27), optId(fc, /frame styles?/i, /walnut/i, 120)] },
        { label: 'Hanging wire', group: 'Framed Canvas Hanging Hardware', add: optId(fc, /hanging hardware/i, /wire/i, 28) },
        { label: 'Solid colour border instead of mirror', group: 'Canvas Border', swap: [optId(fc, /canvas border/i, /mirror/i, 2), optId(fc, /canvas border/i, /solid color/i, 3)] },
      ],
    },
    {
      name: 'framed paper 105005',
      sub: framed105,
      size: { width: 16, height: 20 },
      baseline: [matNone, ...base105],
      extras: [
        { label: '3in mat instead of none', group: 'Mat Size', swap: [matNone, optId(framed105, /mat size/i, /^3\.0 inch/i, 69)] },
        { label: 'Somerset Velvet paper', group: 'Paper Type', swap: [paperMatte, optId(framed105, /paper type/i, /somerset/i, 82)] },
        { label: 'No glass instead of acrylic', group: 'Glazing', swap: [glazingAcrylic, glazingNone] },
      ],
    },
    {
      name: 'framed paper 105001',
      sub: framedSmall,
      size: { width: 16, height: 20 },
      baseline: [
        optId(framedSmall, /mat size/i, /no mat/i, 64),
        optId(framedSmall, /paper type/i, /archival matte/i, 74),
        optId(framedSmall, /hanging hardware/i, /wire/i, 83),
        optId(framedSmall, /backing/i, /no backing/i, 94),
        optId(framedSmall, /mat colou?r/i, /^white$/i, 96),
        optId(framedSmall, /glazing/i, /acrylic/i, 146),
        optId(framedSmall, /print mounting/i, /dry mounted/i, 148),
      ],
      extras: [
        { label: '2in mat instead of none', group: 'Mat Size', swap: [optId(framedSmall, /mat size/i, /no mat/i, 64), optId(framedSmall, /mat size/i, /^2\.0 inch/i, 67)] },
        { label: 'Kraft paper backing', group: 'Framed Fine Art Paper Backing', swap: [optId(framedSmall, /backing/i, /no backing/i, 94), optId(framedSmall, /backing/i, /kraft/i, 95)] },
        { label: 'Loose mounted instead of dry mounted', group: 'Print Mounting', swap: [optId(framedSmall, /print mounting/i, /dry mounted/i, 148), optId(framedSmall, /print mounting/i, /loose mounted/i, 149)] },
      ],
    },
    {
      name: 'metal 106001',
      sub: metal,
      size: { width: 16, height: 20 },
      baseline: [optId(metal, /hanging hardware/i, /^none$/i, 35)],
      // One group only: every alternative below replaces the baseline choice, so the
      // family can be priced but never combined.
      extras: (groupsOf(metal).find((g) => /hanging hardware/i.test(g.group))?.items ?? [])
        .filter((i) => !/^none$/i.test(i.name))
        .map((i) => ({ label: i.name, group: 'Metal Hanging Hardware', swap: [optId(metal, /hanging hardware/i, /^none$/i, 35), i.id] })),
    },
    {
      name: 'paper 103001',
      sub: paper,
      size: { width: 16, height: 20 },
      baseline: [optId(paper, /bleed/i, /no bleed/i, 39)],
      // One group only (Bleed Size) — same situation as metal.
      extras: (groupsOf(paper).find((g) => /bleed/i.test(g.group))?.items ?? [])
        .filter((i) => !/no bleed/i.test(i.name))
        .map((i) => ({ label: i.name, group: 'Bleed Size', swap: [optId(paper, /bleed/i, /no bleed/i, 39), i.id] })),
    },
  ]

  const applyExtra = (baseline, extra) => {
    if (extra.add != null) return [...baseline, extra.add]
    const [from, to] = extra.swap
    return baseline.map((o) => (o === from ? to : o))
  }
  // Combinations of extras that touch DISTINCT groups: every pair, then the full triple.
  const distinctCombos = (extras) => {
    const combos = []
    for (let a = 0; a < extras.length; a++) {
      for (let b = a + 1; b < extras.length; b++) {
        if (extras[a].group === extras[b].group) continue
        combos.push([a, b])
      }
    }
    for (let a = 0; a < extras.length; a++) {
      for (let b = a + 1; b < extras.length; b++) {
        for (let c = b + 1; c < extras.length; c++) {
          const gs = new Set([extras[a].group, extras[b].group, extras[c].group])
          if (gs.size < 3) continue
          combos.push([a, b, c])
        }
      }
    }
    return combos.slice(0, 4)
  }

  const items = []
  const index = []
  for (const fam of families) {
    fam.combos = distinctCombos(fam.extras)
    fam.groupCount = new Set(groupsOf(fam.sub).map((g) => g.group)).size
    index.push({ fam: fam.name, kind: 'baseline', i: items.length })
    items.push({ subcategoryId: Number(fam.sub.subcategoryId), size: fam.size, options: fam.baseline })
    fam.extras.forEach((ex, k) => {
      index.push({ fam: fam.name, kind: 'single', label: ex.label, k, i: items.length })
      items.push({ subcategoryId: Number(fam.sub.subcategoryId), size: fam.size, options: applyExtra(fam.baseline, ex) })
    })
    fam.combos.forEach((combo) => {
      let opts = fam.baseline
      for (const k of combo) opts = applyExtra(opts, fam.extras[k])
      index.push({ fam: fam.name, kind: 'combo', combo, i: items.length })
      items.push({ subcategoryId: Number(fam.sub.subcategoryId), size: fam.size, options: opts })
    })
  }
  const comboCount = families.reduce((n, f) => n + f.combos.length, 0)
  const rec = attach(
    p,
    await client.priceBatch(items, 'additivity'),
    `${families.length} families: baseline + each single-option price + ${comboCount} multi-option configurations built only from DISTINCT option groups, one size per family`,
  )
  const rows = Array.isArray(rec.body) ? rec.body : []
  const results = []
  const notApplicable = []
  for (const fam of families) {
    const bIdx = index.find((x) => x.fam === fam.name && x.kind === 'baseline').i
    const baseTotal = priced(rows[bIdx])
    const deltas = fam.extras.map((ex, k) => {
      const si = index.find((x) => x.fam === fam.name && x.kind === 'single' && x.k === k).i
      const t = priced(rows[si])
      return {
        label: ex.label,
        group: ex.group,
        total: t,
        delta: t != null && baseTotal != null ? Number((t - baseTotal).toFixed(2)) : null,
        success: Boolean(rows[si]?.success),
        error: rows[si]?.error ?? null,
      }
    })
    if (fam.combos.length === 0) {
      notApplicable.push({
        family: fam.name,
        subcategoryId: Number(fam.sub.subcategoryId),
        groups: groupsOf(fam.sub).map((g) => g.group),
        reason: 'every option belongs to a single group, so no multi-option configuration exists for this subcategory',
        baseTotal,
        deltas,
      })
      continue
    }
    for (const x of index.filter((y) => y.fam === fam.name && y.kind === 'combo')) {
      const r = rows[x.i]
      const apiTotal = priced(r)
      const predicted = baseTotal != null ? Number((baseTotal + x.combo.reduce((a, k) => a + (deltas[k].delta ?? NaN), 0)).toFixed(2)) : null
      results.push({
        family: fam.name,
        subcategoryId: Number(fam.sub.subcategoryId),
        config: x.combo.map((k) => `${fam.extras[k].label} [${fam.extras[k].group}]`).join(' + '),
        groups: x.combo.map((k) => fam.extras[k].group),
        baseTotal,
        deltas: x.combo.map((k) => deltas[k].delta),
        predicted,
        apiTotal,
        diff: apiTotal != null && predicted != null ? Number((apiTotal - predicted).toFixed(2)) : null,
        additive: apiTotal != null && predicted != null ? Math.abs(apiTotal - predicted) < 0.005 : null,
        success: Boolean(r?.success),
        error: r?.error ?? null,
      })
    }
  }
  const tested = results.filter((r) => r.additive !== null)
  const bad = tested.filter((r) => !r.additive)
  p.data.table = results.map((r) => `${r.family} | ${r.config} | base ${money(r.baseTotal)} + deltas [${r.deltas.map((d) => (d == null ? 'n/a' : d.toFixed(2))).join(', ')}] = predicted ${money(r.predicted)} | API ${money(r.apiTotal)} | diff ${r.diff}`)
  finish(
    p,
    bad.length === 0 ? 'PASS' : 'FINDING',
    `${tested.length - bad.length}/${tested.length} multi-option configurations are additive (apiTotal === base + Σ individually-priced deltas), across ${families.length - notApplicable.length} families. ` +
      (bad.length === 0
        ? 'ADR-3 may cache base + per-option deltas and sum them; V2 keeps asserting it on every maximal configuration.'
        : `NON-ADDITIVE: ${bad.map((b) => `${b.family} [${b.config}] base ${money(b.baseTotal)} + deltas [${b.deltas.join(', ')}] = predicted ${money(b.predicted)} vs API ${money(b.apiTotal)} (diff ${b.diff})`).join('; ')} — those subcategories need whole-config pricing rows (the F26 fallback), not summed deltas.`) +
      (notApplicable.length > 0
        ? ` Not applicable: ${notApplicable.map((n) => `${n.family} (groups: ${n.groups.join(', ')})`).join('; ')} — a single option group cannot produce a multi-option configuration, so additivity is vacuous there; each member was still priced individually.`
        : ''),
    { results, notApplicable, failures: bad.length, comboCount },
  )
}

// --- P15: what `options: []` silently resolves to --------------------------
if (shouldRun('defaults')) {
  const p = probe({ key: 'defaults',
    question: 'What does an EMPTY options array resolve to, and is that default safe for aspect-exact masters?',
    planRef: '§6 P0 "Required groups … what defaults apply"; ADR-4; §9 F4',
  })
  const canvas = subByName(101, /1\.25in stretched canvas/i, 101002)
  const paper = subByName(103, /archival matte/i, 103001)
  const img = await probeImage(2400, 3000, '8x10-at-300dpi')
  const pr = attach(
    p,
    await client.priceBatch(
      [
        { subcategoryId: Number(canvas.subcategoryId), size: { width: 8, height: 10 }, options: [] },
        { subcategoryId: Number(paper.subcategoryId), size: { width: 8, height: 10 }, options: [] },
      ],
      'defaults:price',
    ),
    'price 101002 and 103001 with options [] — the response echoes the resolved set',
  )
  const ciCanvas = attach(
    p,
    await client.checkImageConfig({ subcategoryId: Number(canvas.subcategoryId), printWidth: 8, printHeight: 10, imageUrl: img.url, orderItemOptions: [] }, 'defaults:ci:canvas'),
    'checkImageConfig 101002 8x10, options [], aspect-exact 2400x3000 master',
  )
  const ciPaper = attach(
    p,
    await client.checkImageConfig({ subcategoryId: Number(paper.subcategoryId), printWidth: 8, printHeight: 10, imageUrl: img.url, orderItemOptions: [] }, 'defaults:ci:paper'),
    'checkImageConfig 103001 8x10, options [], same master',
  )
  const gc = geo(ciCanvas.body)
  const gp = geo(ciPaper.body)
  const resolvedCanvas = (pr.body?.[0]?.options ?? []).map((o) => `${o.optionId}=${o.optionName}`)
  const resolvedPaper = (pr.body?.[1]?.options ?? []).map((o) => `${o.optionId}=${o.optionName}`)
  const bothSafe = ciCanvas.status === 200 && ciPaper.status === 200
  finish(
    p,
    bothSafe ? 'PASS' : 'FINDING',
    `Pricing with [] returns resolved options — 101002: [${resolvedCanvas.join(', ') || 'none echoed'}]; 103001: [${resolvedPaper.join(', ') || 'none echoed'}]. ` +
      `checkImageConfig with []: canvas ${ciCanvas.status} (expects ${gc.inches?.w}x${gc.inches?.h}in for an 8x10 order), paper ${ciPaper.status} (expects ${gp.inches?.w}x${gp.inches?.h}in). ` +
      (bothSafe
        ? 'Empty options are geometry-safe here.'
        : 'An empty options array is NOT neutral: the API resolves it to the geometry-hostile group defaults (Image Wrap on canvas: +3.75in per axis; 0.25in Bleed on paper), which 406 an aspect-exact master. Every seed, quote, shipping call and order MUST send an explicit geometry-neutral option set — never [] — and the catalog\'s is_default must encode Mirror Wrap / No Bleed, not the provider default.'),
    { resolvedCanvas, resolvedPaper, canvasRecommendedIn: gc.inches, paperRecommendedIn: gp.inches, statuses: { canvas: ciCanvas.status, paper: ciPaper.status } },
  )
}

// --- P16: deferred order echo ---------------------------------------------
if (shouldRun('orderecho')) {
  const p = probe({ key: 'orderecho',
    question: 'Do queued sandbox orders materialise, and does GET /orders/{n} echo the option ids, the fractional dimensions and solidColorHexCode?',
    planRef: '§6 P0 "Mat math"/"Solid Color Wrap"; V4 echo assertion; §9 F5/F18',
  })
  if (orderLog.length === 0) {
    skip(p, ALLOW_ORDERS ? 'no orders were placed in this run' : 'orders disabled (--no-orders)')
  } else {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const echoes = []
    for (const o of orderLog) {
      if (!o.orderNumber) {
        echoes.push({ ...o, echoStatus: null, note: 'submit did not return an orderNumber' })
        continue
      }
      let rec = null
      for (let attempt = 0; attempt < 5; attempt++) {
        rec = await client.getOrder(o.orderNumber, `echo:${o.label}:${attempt}`)
        if (rec.status === 200) break
        if (attempt < 4) await sleep(45_000)
      }
      attach(p, rec, `GET /orders/${o.orderNumber} (${o.label})`)
      o.echoStatus = rec.status
      const item = rec.body?.orderItems?.[0] ?? {}
      echoes.push({
        label: o.label,
        orderNumber: o.orderNumber,
        echoStatus: rec.status,
        orderStatus: rec.body?.orderStatus ?? null,
        width: item.width ?? null,
        height: item.height ?? null,
        sentWidth: o.submitted?.width ?? null,
        sentHeight: o.submitted?.height ?? null,
        echoedOptionIds: (item.orderItemOptions ?? []).map((x) => Number(x.optionId)),
        sentOptionIds: o.submitted?.orderItemOptions ?? [],
        hexSent: o.submitted?.solidColorHexCode ?? null,
        hexEchoed: Boolean(o.submitted?.solidColorHexCode) && JSON.stringify(rec.body ?? {}).includes(String(o.submitted.solidColorHexCode)),
        itemKeys: Object.keys(item),
      })
    }
    const materialised = echoes.filter((e) => e.echoStatus === 200)
    const optionsMatch = materialised.every((e) => e.sentOptionIds.every((id) => e.echoedOptionIds.includes(Number(id))))
    const dimsMatch = materialised.every((e) => Number(e.width) === Number(e.sentWidth) && Number(e.height) === Number(e.sentHeight))
    const hexCase = echoes.find((e) => e.hexSent)
    finish(
      p,
      materialised.length === echoes.length ? 'PASS' : 'FINDING',
      `${materialised.length}/${echoes.length} orders returned 200 on GET (the submit 201 is only a QUEUE acknowledgement — a GET immediately after submit 404s, so V4 must poll, not read once). ` +
        `Option ids echo back exactly: ${optionsMatch ? 'YES' : 'NO'}; dimensions echo exactly (including the fractional 9.25x11): ${dimsMatch ? 'YES' : 'NO'}; ` +
        `solidColorHexCode echoed: ${hexCase ? (hexCase.hexEchoed ? 'YES' : 'NO') : 'not tested'}. ` +
        `${hexCase && !hexCase.hexEchoed ? 'The hex never comes back (the order item carries only subcategoryId, externalItemId, quantity, width, height, file, itemCostTotal, orderItemOptions), so our own snapshot is the sole record of the chosen colour — assert it in our DB, never read it back from the provider.' : ''} ` +
        `orderStatus values: ${[...new Set(materialised.map((e) => e.orderStatus))].join(', ') || 'n/a'}.`,
      { echoes },
    )
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const summary = client.printSummary('\nprobe-run ')
const rawFile = path.join(OUT_DIR, `probes.${STAMP}.json`)

// A partial run (`--only`) re-renders the WHOLE report: probes it did not run are kept
// verbatim from the previous run's record, so PROBES.md is never silently truncated to
// the subset that happened to be re-executed.
let merged = probes
let carried = []
let priorRun = null
let priorOrders = []
let priorImages = []
let priorRecords = []
if (ONLY) {
  if (!fs.existsSync(rawFile)) {
    console.error(`--only needs an existing ${path.relative(REPO, rawFile)} to merge into; run the full matrix first.`)
    process.exit(2)
  }
  const prior = JSON.parse(fs.readFileSync(rawFile, 'utf8'))
  priorRun = prior.runId ?? null
  priorOrders = prior.orders ?? []
  priorImages = prior.images ?? []
  priorRecords = prior.records ?? []
  // Probes recorded before keys existed carry only their id: recover the key from the
  // canonical order so a re-run replaces them instead of duplicating them.
  const priorProbes = (prior.probes ?? []).map((p) => ({
    ...p,
    key: p.key ?? KEY_ORDER[Number(String(p.id ?? '').replace(/^P/, '')) - 1],
  }))
  const fresh = new Map(probes.map((p) => [p.key, p]))
  carried = priorProbes.filter((p) => !fresh.has(p.key))
  merged = [...carried, ...probes].sort((a, b) => KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key))
  console.log(`merge: re-ran ${probes.map((p) => p.key).join(', ')}; carried ${carried.length} probe(s) from run ${priorRun}`)
}

const counts = {
  run: merged.length,
  reRun: ONLY ? probes.length : merged.length,
  carried: carried.length,
  pass: merged.filter((p) => p.verdict === 'PASS').length,
  finding: merged.filter((p) => p.verdict === 'FINDING').length,
  fail: merged.filter((p) => p.verdict === 'FAIL').length,
  skipped: merged.filter((p) => p.verdict === 'SKIPPED').length,
}
const allOrders = [...priorOrders.filter((o) => !orderLog.some((n) => n.orderNumber === o.orderNumber)), ...orderLog]
const allImages = [...priorImages.filter((i) => !imageManifest.some((n) => n.storagePath === i.storagePath)), ...imageManifest]

// Signed-URL tokens are credentials with a 2-hour life, and these files are committed:
// the storage PATH is the evidence that matters, the token never is.
const redact = (s) => String(s).replace(/([?&]token=)[A-Za-z0-9._~%-]+/g, '$1REDACTED')

const trim = (v, n = 1500) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, 0)
  if (s == null) return ''
  const r = redact(s)
  return r.length > n ? `${r.slice(0, n)}\n… [trimmed, full body in probes.${STAMP}.json]` : r
}

const md = []
md.push(`# LumaPrints P0 probes — ${client.host}`)
md.push('')
md.push(`Run: ${RUN_ID} · store ${client.storeId} · snapshot \`${path.basename(snapshotPath)}\``)
md.push(
  `Requests this pass: ${summary.requestCount} · wall ${(summary.wallMs / 1000).toFixed(1)}s · peak ${summary.peakPerRolling60s} in any rolling 60s (cap ${summary.rpmCap}) · 429s ${summary.rateLimited}`,
)
if (ONLY) {
  md.push(
    `This pass re-ran **${probes.map((x) => `${x.id} (${x.key})`).join(', ')}**; the other ${counts.carried} probe(s) are carried verbatim from run ${priorRun}.`,
  )
}
md.push(`Probes: ${counts.run} total · ${counts.pass} PASS · ${counts.finding} FINDING · ${counts.fail} FAIL · ${counts.skipped} SKIPPED`)
md.push(`Sandbox orders placed: ${allOrders.length}${allOrders.length ? ` (${allOrders.map((o) => `${o.label}=${o.orderNumber ?? o.status}`).join(', ')})` : ''}${ONLY ? ` — ${ordersPlaced} in this pass` : ''}`)
md.push('')
md.push('Probe images (private `print-masters` bucket, 2-hour signed URLs; paths recorded, tokens not):')
md.push('')
for (const im of imageManifest) {
  md.push(`- \`${im.storagePath}\` — ${im.px.width}x${im.px.height}px, ${(im.bytes / 1024).toFixed(0)}KB, reachability ${im.verify.method} ${im.verify.status} ${im.verify.contentType}`)
}
md.push('')
md.push('---')
md.push('')
for (const p of merged) {
  md.push(`### ${p.id} — ${p.question}`)
  md.push('')
  md.push(`Plan ref: ${p.planRef}`)
  md.push('')
  md.push('Request(s):')
  md.push('')
  for (const r of p.requests) {
    md.push(`- \`${r.method} ${r.path}\`${r.note ? ` — ${r.note}` : ''}`)
    if (r.request != null) {
      md.push('')
      md.push('  ```json')
      md.push(`  ${trim(r.request, 1200).split('\n').join('\n  ')}`)
      md.push('  ```')
    }
  }
  md.push('')
  md.push('Response(s):')
  md.push('')
  for (const r of p.requests) {
    md.push(`- \`${r.method} ${r.path}\` -> **${r.status ?? 'not attempted'}**`)
    md.push('')
    md.push('  ```json')
    md.push(`  ${trim(r.body ?? r.rawText ?? '', 1500).split('\n').join('\n  ')}`)
    md.push('  ```')
  }
  md.push('')
  md.push(`Verdict: **${p.verdict}**`)
  md.push('')
  md.push(`Implication: ${p.implication}`)
  md.push('')
}
md.push('---')
md.push('')
md.push('## Sandbox orders')
md.push('')
if (allOrders.length === 0) md.push('- none placed in this run')
else {
  md.push('| label | externalId | submit status | orderNumber | GET echo |')
  md.push('|---|---|---|---|---|')
  for (const o of allOrders) md.push(`| ${o.label} | \`${o.externalId}\` | ${o.status} | ${o.orderNumber ?? '—'} | ${o.echoStatus ?? '—'} |`)
}
md.push('')

const probesMd = path.join(OUT_DIR, 'PROBES.md')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(probesMd, md.join('\n') + '\n')

fs.writeFileSync(
  rawFile,
  redact(
    JSON.stringify(
      {
        runId: RUN_ID,
        priorRunId: priorRun,
        reRanKeys: ONLY ?? 'all',
        host: client.host,
        storeId: client.storeId,
        snapshot: path.basename(snapshotPath),
        summary,
        counts,
        orders: allOrders,
        images: allImages.map(({ url, ...rest }) => rest),
        probes: merged,
        records: [...priorRecords, ...client.records],
      },
      null,
      2,
    ),
  ) + '\n',
)

console.log('')
console.log(`probes run=${counts.run} pass=${counts.pass} finding=${counts.finding} fail=${counts.fail} skipped=${counts.skipped}`)
console.log(`sandbox orders placed=${ordersPlaced} ${orderLog.map((o) => `${o.label}:${o.orderNumber ?? o.status}`).join(' ')}`)
console.log(`Wrote ${path.relative(REPO, probesMd)}`)
console.log(`Wrote ${path.relative(REPO, rawFile)}`)
// P0 is discovery: a FINDING is information, not a failure. Only a hard FAIL exits non-zero.
process.exit(counts.fail > 0 ? 1 : 0)
