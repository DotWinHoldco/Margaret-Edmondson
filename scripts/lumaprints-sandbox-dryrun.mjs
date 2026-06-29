// LumaPrints SANDBOX dry-run (Phase 8.3) — HUMAN-GATED, sandbox-only.
//
// Prices a nonstandard custom size and submits ONE order to the LumaPrints
// SANDBOX, then reads it back to confirm the dimensions echo. NEVER runs against
// production: it refuses unless LUMAPRINTS_BASE_URL points at the sandbox host.
//
// Run (with sandbox creds exported or in .env.local):
//   LUMAPRINTS_BASE_URL=https://us.api-sandbox.lumaprints.com \
//   LUMAPRINTS_API_KEY=... LUMAPRINTS_API_SECRET=... LUMAPRINTS_STORE_ID=... \
//   node scripts/lumaprints-sandbox-dryrun.mjs "https://<public-signed-master>.tif"
//
// Args: [1] public image URL (a padded print master, reachable by LumaPrints).
//       Optional: --width 18 --height 24 --subcategory 101002

import fs from 'node:fs'
import path from 'node:path'

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

// Load .env.local without clobbering already-exported vars.
const env = { ...process.env }
const envFile = path.join(REPO, '.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const k = t.slice(0, i)
    if (env[k] === undefined) env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
}

const BASE = env.LUMAPRINTS_BASE_URL || ''
const KEY = env.LUMAPRINTS_API_KEY
const SECRET = env.LUMAPRINTS_API_SECRET
const STORE = Number(env.LUMAPRINTS_STORE_ID)

// HARD SAFETY GATE: sandbox host only.
if (!BASE.includes('api-sandbox')) {
  console.error(`REFUSING: LUMAPRINTS_BASE_URL must be the sandbox host (got "${BASE}"). This script never runs against production.`)
  process.exit(1)
}
if (!KEY || !SECRET || !Number.isFinite(STORE) || STORE <= 0) {
  console.error('Missing sandbox LUMAPRINTS_API_KEY / LUMAPRINTS_API_SECRET / LUMAPRINTS_STORE_ID.')
  process.exit(1)
}

const args = process.argv.slice(2)
const imageUrl = args.find((a) => a.startsWith('http'))
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : def
}
const width = flag('width', 18)
const height = flag('height', 24)
const subcategoryId = flag('subcategory', 101002)
if (!imageUrl) {
  console.error('Pass a public image URL (a padded print master) as the first argument.')
  process.exit(1)
}

const auth = 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64')
async function api(p, init = {}) {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    headers: { Authorization: auth, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const diagDir = path.join(REPO, 'audit', 'diag')
fs.mkdirSync(diagDir, { recursive: true })
const log = {}

console.log(`Sandbox: ${BASE} · store ${STORE} · ${width}×${height}in subcat ${subcategoryId}`)

// 1. Price the custom size.
log.price = await api('/api/v1/pricing/products', {
  method: 'POST',
  body: JSON.stringify([{ subcategoryId, size: { width, height }, options: [] }]),
})
console.log('price:', JSON.stringify(log.price.body))

// 2. checkImageConfig (aspect/resolution).
log.checkImage = await api('/api/v1/images/checkImageConfig', {
  method: 'POST',
  body: JSON.stringify({ subcategoryId, printWidth: width, printHeight: height, imageUrl, orderItemOptions: [] }),
})
console.log('checkImageConfig:', log.checkImage.status, JSON.stringify(log.checkImage.body))

// 3. Submit ONE sandbox order.
const externalId = `dryrun-${stamp}`
log.submit = await api('/api/v1/orders', {
  method: 'POST',
  body: JSON.stringify({
    externalId,
    storeId: STORE,
    shippingMethod: 'default',
    productionTime: 'regular',
    recipient: { firstName: 'Sandbox', lastName: 'Test', addressLine1: '1 Test St', city: 'Austin', state: 'TX', zipCode: '78701', country: 'US' },
    orderItems: [{ externalItemId: `${externalId}-1`, subcategoryId, quantity: 1, width, height, file: { imageUrl, saveImage: true }, orderItemOptions: [] }],
  }),
})
console.log('submit:', log.submit.status, JSON.stringify(log.submit.body))

// 4. Read the order back (if it was queued).
const orderNumber = log.submit.body?.orderNumber
if (orderNumber) {
  // Sandbox may take a moment to materialize; this is a single best-effort read.
  log.getOrder = await api(`/api/v1/orders/${orderNumber}`)
  console.log('getOrder:', log.getOrder.status, JSON.stringify(log.getOrder.body))
}

// 5. Dedup probe. Resubmit the SAME externalId + externalItemId and record whether
// LumaPrints creates a SECOND distinct order (no dedup) or rejects / returns the
// same order (dedup). This answers the residual duplicate-order question for the
// fulfillment worker's auto-retry of a `failed` item (see KNOWN_RISKS, "Duplicate
// LumaPrints order ..."). Sandbox-only, harmless to repeat.
log.dedupProbe = await api('/api/v1/orders', {
  method: 'POST',
  body: JSON.stringify({
    externalId,
    storeId: STORE,
    shippingMethod: 'default',
    productionTime: 'regular',
    recipient: { firstName: 'Sandbox', lastName: 'Test', addressLine1: '1 Test St', city: 'Austin', state: 'TX', zipCode: '78701', country: 'US' },
    orderItems: [{ externalItemId: `${externalId}-1`, subcategoryId, quantity: 1, width, height, file: { imageUrl, saveImage: true }, orderItemOptions: [] }],
  }),
})
const dedupOrder = log.dedupProbe.body?.orderNumber
console.log('dedupProbe:', log.dedupProbe.status, JSON.stringify(log.dedupProbe.body))
console.log(
  dedupOrder && String(dedupOrder) !== String(orderNumber)
    ? `  NO DEDUP: a SECOND order (${dedupOrder}) was created for the same externalItemId. Gate the worker auto-retry of a failed item to pending-only before high-volume live use (see KNOWN_RISKS).`
    : `  DEDUP OK: the repeated externalItemId did not create a distinct second order.`,
)

const outFile = path.join(diagDir, `sandbox-dryrun-${stamp}.json`)
fs.writeFileSync(outFile, JSON.stringify(log, null, 2))
console.log(`\nSaved -> ${outFile}`)
console.log('Confirm: getOrder echoes width/height, the submit was 201, and review the dedup probe. NEVER run this against production.')
