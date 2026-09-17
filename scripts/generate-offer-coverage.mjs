// Authored by DotWin
// Drive the storewide offer-coverage generator from a terminal (plan P3, F25).
//
//   node scripts/generate-offer-coverage.mjs \
//     --base-url https://www.artbyme.studio \
//     --cookie-file ./admin.cookie [--dry-run] [--mediums canvas,metal]
//
// The cookie file holds the raw `Cookie:` header of an aal2 admin browser session
// (copy it out of the browser's network panel). That is how production-key operations
// run here: the route reads the same session an admin has, so nothing has to hold a
// service key to fill the store's draft sizes.
//
// Budget: each cell that actually needs pricing may spend about one provider price
// batch plus four shipping quotes, and the provider key allows roughly 25 calls a
// minute ACROSS the whole site. The route bounds the work per invocation (wall clock,
// or six priced cells) and returns a cursor; this script simply keeps calling with that
// cursor and waits three seconds between calls so a storewide fill leaves room for a
// shopper's quote. It never throttles the key itself.

import fs from 'node:fs'

const PAUSE_MS = 3000
const PATH = '/api/admin/variants/coverage'

function parseArgs(argv) {
  const args = { dryRun: false, mediums: null, baseUrl: null, cookieFile: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--base-url') args.baseUrl = argv[++i]
    else if (arg === '--cookie-file') args.cookieFile = argv[++i]
    else if (arg === '--mediums') args.mediums = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean)
  }
  return args
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function call(url, cookie, init) {
  const res = await fetch(url, {
    ...init,
    headers: { cookie, 'content-type': 'application/json', ...(init?.headers || {}) },
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`${init?.method || 'GET'} ${url} → ${res.status}`)
    console.error(text.slice(0, 2000))
    process.exit(1)
  }
  try {
    return JSON.parse(text).data
  } catch {
    fail(`Could not read the response body from ${url}`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.baseUrl) fail('Pass --base-url https://www.artbyme.studio')
  if (!args.cookieFile) fail('Pass --cookie-file ./admin.cookie (the raw Cookie header of an admin session)')
  if (!fs.existsSync(args.cookieFile)) fail(`No cookie file at ${args.cookieFile}`)
  const cookie = fs.readFileSync(args.cookieFile, 'utf8').trim()
  if (!cookie) fail(`${args.cookieFile} is empty`)

  // The cookie is a live admin session. It goes to the store's own hosts over TLS and
  // nowhere else, whatever a mistyped flag says.
  let origin
  try {
    origin = new URL(args.baseUrl)
  } catch {
    fail(`--base-url is not a URL: ${args.baseUrl}`)
  }
  const ALLOWED_HOSTS = [/^(www\.)?artbyme\.studio$/, /^[a-z0-9-]+\.vercel\.app$/, /^localhost$/]
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') fail(`--base-url must be https: (${origin.protocol})`)
  if (!ALLOWED_HOSTS.some((re) => re.test(origin.hostname))) fail(`--base-url host ${origin.hostname} is not one of the store's hosts`)
  const url = `${origin.origin}${PATH}`
  let cursor = null
  let calls = 0
  let created = 0

  console.log(`${args.dryRun ? 'Dry run' : 'Generating'} against ${url}`)
  for (;;) {
    const payload = {}
    if (cursor) payload.cursor = cursor
    if (args.dryRun) payload.dryRun = true
    if (args.mediums) payload.mediums = args.mediums

    const data = await call(url, cookie, { method: 'POST', body: JSON.stringify(payload) })
    calls += 1
    created += data.created.length
    console.log(
      `call ${calls}: products ${data.processed.products}, lanes ${data.processed.cells}, created ${data.created.length}, skipped ${data.skipped}, blocked ${data.blocked.length}, dropped ${data.dropped.length}, ${data.elapsedMs}ms`,
    )
    if (data.done || !data.cursor) break
    cursor = data.cursor
    await sleep(PAUSE_MS)
  }
  console.log(`${created} size${created === 1 ? '' : 's'} ${args.dryRun ? 'would be created' : 'created'} in ${calls} call(s).`)

  const report = await call(url, cookie, { method: 'GET' })
  const byMedium = new Map()
  for (const subcategory of report.subcategories) {
    const roll = byMedium.get(subcategory.medium) || { live: 0, draft: 0, none: 0, blocked: 0 }
    for (const product of report.products) {
      const cell = product.cells[subcategory.id]
      if (cell) roll[cell.status] += 1
    }
    byMedium.set(subcategory.medium, roll)
  }
  console.log(`\nCoverage as of ${report.generatedAt} (${report.products.length} artworks):`)
  for (const [medium, roll] of byMedium) {
    console.log(`  ${medium}: live ${roll.live}, draft ${roll.draft}, empty ${roll.none}, blocked ${roll.blocked}`)
  }
  console.log(
    `  all: live ${report.totals.live}, draft ${report.totals.draft}, empty ${report.totals.none}, blocked ${report.totals.blocked}`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
