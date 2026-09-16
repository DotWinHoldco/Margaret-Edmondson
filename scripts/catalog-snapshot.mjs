#!/usr/bin/env node
// Authored by DotWin
// Phase 0 catalog snapshot: walk the LumaPrints catalog verbatim and freeze it as a
// committed fixture, then score that fixture against the build plan's target-catalog
// checklist (audit/FULL-CATALOG-BUILD-PLAN.md §2).
//
// Why: every later phase (schema seed, rules engine, pricing cache, admin toggles) is
// built against ids, bounds, DPI and option groups that only the API knows. Guessing
// them is the single biggest first-try risk, and sandbox ids are not guaranteed to
// equal production ids (plan §9 F12) — so each host gets its own dated fixture and
// `--diff` maps them BY NAME, failing loudly on a same-name/different-id pair.
//
// Modes:
//   node scripts/catalog-snapshot.mjs --env .env.luma [--out fixtures/lumaprints]
//       Live walk (categories -> subcategories -> options), <=25 req/min.
//   node scripts/catalog-snapshot.mjs --assemble <dir> [--out fixtures/lumaprints]
//       Build the same fixture from per-category JSON files captured through the
//       admin snapshot route (production keys live only in Vercel).
//   node scripts/catalog-snapshot.mjs --diff <a.json> <b.json> [--out fixtures/lumaprints]
//       Name-mapped id diff; exit 1 when any same-name row carries a different id.

import fs from 'node:fs'
import path from 'node:path'
import { clientFromEnv, parseArgs, todayStamp } from './lib/lumaprints-probe-client.mjs'

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

// ---------------------------------------------------------------------------
// Plan §2 checklist, encoded as data. Patterns are matched case-insensitively
// against the API's own names; anything the API has that is NOT listed here is an
// EXTRA (a finding to fold back into the plan, never an error).
// ---------------------------------------------------------------------------
// Patterns are deliberately TIGHT and each API row is claimed by at most one checklist
// row (first listed wins). A loose pattern would quietly absorb a group §2 never listed
// — e.g. "Framed Fine Art Paper Backing" swallowed by a bare /paper/ — and swallowing an
// extra is the one failure mode this file exists to prevent.
const CHECKLIST = [
  {
    categoryId: 101,
    category: 'Canvas',
    subcategories: [
      { label: '0.75in stretched canvas', pattern: /0\.75in stretched canvas/i },
      { label: '1.25in stretched canvas', pattern: /1\.25in stretched canvas/i },
      { label: '1.5in stretched canvas', pattern: /1\.50?in stretched canvas/i },
      { label: 'rolled canvas', pattern: /^rolled canvas$/i },
    ],
    optionGroups: [
      { label: 'Canvas Border', pattern: /^canvas border$/i },
      { label: 'Hanging Hardware', pattern: /canvas hanging hardware/i },
      { label: 'Foamcore Underlayer (1.5in only)', pattern: /^canvas underlayer$/i },
      { label: 'Rolled border / extra margin', pattern: /^rolled canvas border size$/i },
    ],
  },
  {
    categoryId: 102,
    category: 'Framed Canvas',
    subcategories: [
      { label: '0.75in framed canvas', pattern: /0\.75in framed canvas/i },
      { label: '1.25in framed canvas', pattern: /1\.25in framed canvas/i },
      { label: '1.5in framed canvas', pattern: /1\.50?in framed canvas/i },
    ],
    optionGroups: [
      { label: 'Frame Style (required)', pattern: /frame styles?$/i },
      { label: 'Canvas Border', pattern: /^canvas border$/i },
      { label: 'Hanging Hardware', pattern: /framed canvas hanging hardware/i },
      { label: 'Foamcore Underlayer (1.5in only)', pattern: /^canvas underlayer$/i },
    ],
  },
  {
    categoryId: 103,
    category: 'Fine Art Paper',
    subcategories: [
      { label: 'Archival/Premium Smooth Matte', pattern: /archival matte/i },
      { label: 'Hot Press', pattern: /hot press/i },
      { label: 'Cold Press Textured', pattern: /cold press/i },
      { label: 'Semi-Gloss Luster', pattern: /semi-?glossy/i },
      { label: 'Metallic', pattern: /metallic/i },
      { label: 'Glossy Photo', pattern: /(^|\s)glossy (fine art|photo)/i },
      { label: 'Somerset Velvet', pattern: /somerset/i },
    ],
    optionGroups: [{ label: 'Bleed', pattern: /bleed size/i }],
  },
  {
    categoryId: 105,
    category: 'Framed Fine Art Paper',
    subcategories: [{ label: 'frame profile subcategories (>=10 expected)', pattern: /frame/i, countAtLeast: 10 }],
    optionGroups: [
      { label: 'Mat Size', pattern: /^mat size$/i },
      { label: 'Mat Color', pattern: /^mat colou?r$/i },
      { label: 'Glazing', pattern: /^glazing$/i },
      { label: 'Paper Type', pattern: /^paper type$/i },
      { label: 'Hanging Hardware', pattern: /hanging hardware$/i },
    ],
  },
  {
    categoryId: 106,
    category: 'Metal',
    subcategories: [
      { label: 'Glossy White Metal', pattern: /glossy white/i },
      { label: 'Glossy Silver Metal', pattern: /glossy silver/i },
    ],
    optionGroups: [
      { label: 'Surface (glossy white/silver) as an OPTION group', pattern: /^(metal )?(surface|finish)$/i, optional: true },
      { label: 'Installation (easel / inset frame / standout posts)', pattern: /metal hanging hardware|installation/i },
    ],
  },
  {
    categoryId: 107,
    category: 'Peel and Stick',
    subcategories: [{ label: 'Peel and Stick', pattern: /peel and stick|peel & stick/i }],
    optionGroups: [],
  },
  {
    categoryId: 108,
    category: 'Foam-mounted Fine Art Paper',
    subcategories: [
      { label: 'Foam-mounted Archival Matte', pattern: /foam-?mounted archival matte/i },
      { label: 'Foam-mounted Hot Press', pattern: /foam-?mounted hot press/i },
      { label: 'Foam-mounted Cold Press', pattern: /foam-?mounted cold press/i },
      { label: 'Foam-mounted Semi-Gloss', pattern: /foam-?mounted semi-?glossy/i },
      { label: 'Foam-mounted Metallic', pattern: /foam-?mounted metallic/i },
      { label: 'Foam-mounted Glossy', pattern: /foam-?mounted glossy/i },
      { label: 'Foam-mounted Somerset Velvet', pattern: /foam-?mounted somerset/i },
    ],
    optionGroups: [
      { label: 'Paper Type as an OPTION group', pattern: /^paper type$/i, optional: true },
      { label: 'Bleed', pattern: /bleed size/i },
    ],
  },
]

// ---------------------------------------------------------------------------
// Shape helpers. The categories endpoint is documented as {id,name}; the older
// discovery script read `categoryId`. Accept either rather than trust either.
// ---------------------------------------------------------------------------
const categoryId = (c) => Number(c.id ?? c.categoryId)
const categoryName = (c) => String(c.name ?? c.categoryName ?? '')

function subKey(sub) {
  return {
    subcategoryId: Number(sub.subcategoryId),
    name: String(sub.name ?? ''),
  }
}

// ---------------------------------------------------------------------------
// Live walk
// ---------------------------------------------------------------------------
async function walkCatalog(client) {
  const capturedAt = new Date().toISOString()
  const catRec = await client.getCategories()
  if (!catRec.ok || !Array.isArray(catRec.body)) {
    throw new Error(`categories failed: ${catRec.status} ${catRec.rawText.slice(0, 500)}`)
  }
  const categories = []
  for (const c of catRec.body) {
    const id = categoryId(c)
    const name = categoryName(c)
    console.log(`category ${id} ${name}`)
    const subsRec = await client.getSubcategories(id)
    if (!subsRec.ok || !Array.isArray(subsRec.body)) {
      console.warn(`  subcategories ${id}: ${subsRec.status} ${subsRec.rawText.slice(0, 200)}`)
      categories.push({ id, name, error: { status: subsRec.status, body: subsRec.body }, subcategories: [] })
      continue
    }
    const subcategories = []
    for (const s of subsRec.body) {
      const optRec = await client.getSubcategoryOptions(s.subcategoryId)
      const optionGroups = optRec.ok && Array.isArray(optRec.body) ? optRec.body : []
      const entry = { ...s, optionGroups }
      if (!optRec.ok) entry.optionsError = { status: optRec.status, body: optRec.body }
      subcategories.push(entry)
      console.log(
        `  sub ${s.subcategoryId} ${s.name} — ${optionGroups.length} group(s)${optRec.ok ? '' : ` [options ${optRec.status}]`}`,
      )
    }
    categories.push({ id, name, subcategories })
  }
  const s = client.summary()
  return { capturedAt, host: client.host, requestCount: s.requestCount, wallMs: s.wallMs, categories }
}

// ---------------------------------------------------------------------------
// Coverage report against the plan checklist
// ---------------------------------------------------------------------------
function closestName(names, pattern) {
  // Best-effort "closest name" for a missing row: the name sharing the most
  // lowercase word tokens with the pattern source.
  const tokens = String(pattern.source)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
  let best = null
  let bestScore = 0
  for (const n of names) {
    const low = n.toLowerCase()
    const score = tokens.reduce((acc, t) => acc + (low.includes(t) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = n
    }
  }
  return bestScore > 0 ? best : names[0] ?? null
}

function buildCoverage(snapshot) {
  const lines = []
  const rows = []
  lines.push(`# Catalog coverage — ${snapshot.host}`)
  lines.push('')
  lines.push(`Captured: ${snapshot.capturedAt} · requests: ${snapshot.requestCount} · wall: ${snapshot.wallMs}ms`)
  lines.push('')
  lines.push('Scored against audit/FULL-CATALOG-BUILD-PLAN.md §2 (the checklist, not the source of truth).')
  lines.push('EXTRA = the API has it and §2 does not list it: a finding to fold back into the plan, not an error.')
  lines.push('')

  const byId = new Map(snapshot.categories.map((c) => [Number(c.id), c]))
  const checkedCategoryIds = new Set()

  for (const row of CHECKLIST) {
    checkedCategoryIds.add(row.categoryId)
    const cat = byId.get(row.categoryId)
    lines.push(`## ${row.categoryId} — ${row.category}`)
    lines.push('')
    if (!cat) {
      lines.push('- **MISSING CATEGORY**: not present in the snapshot.')
      lines.push('')
      rows.push({ category: row.categoryId, kind: 'category', label: row.category, status: 'missing' })
      continue
    }
    const subNames = cat.subcategories.map((s) => String(s.name ?? ''))
    lines.push(`API name: \`${cat.name}\` · ${cat.subcategories.length} subcategories`)
    lines.push('')
    lines.push('| § 2 expects | status | API row(s) |')
    lines.push('|---|---|---|')
    const matchedSubs = new Set()
    for (const exp of row.subcategories) {
      // Claimed rows never count twice: a subcategory answers at most one checklist row.
      const hits = cat.subcategories.filter((s) => !matchedSubs.has(Number(s.subcategoryId)) && exp.pattern.test(String(s.name ?? '')))
      hits.forEach((h) => matchedSubs.add(Number(h.subcategoryId)))
      let status
      if (exp.countAtLeast) {
        status = hits.length >= exp.countAtLeast ? `present (${hits.length})` : `PARTIAL (${hits.length} < ${exp.countAtLeast})`
      } else {
        status = hits.length > 0 ? 'present' : exp.optional ? 'missing (optional)' : 'MISSING'
      }
      const detail =
        hits.length > 0
          ? hits.slice(0, 6).map((h) => `${h.subcategoryId} ${h.name}`).join('; ') + (hits.length > 6 ? ` … +${hits.length - 6}` : '')
          : `closest: ${closestName(subNames, exp.pattern) ?? 'n/a'}`
      lines.push(`| subcategory · ${exp.label} | ${status} | ${detail} |`)
      rows.push({ category: row.categoryId, kind: 'subcategory', label: exp.label, status, detail })
    }

    // Option groups: the union across this category's subcategories.
    const groupNames = new Map()
    for (const s of cat.subcategories) {
      for (const g of s.optionGroups ?? []) {
        const name = String(g.optionGroup ?? '')
        if (!groupNames.has(name)) groupNames.set(name, [])
        groupNames.get(name).push(`${s.subcategoryId}`)
      }
    }
    const matchedGroups = new Set()
    for (const exp of row.optionGroups) {
      const hits = [...groupNames.keys()].filter((n) => !matchedGroups.has(n) && exp.pattern.test(n))
      hits.forEach((h) => matchedGroups.add(h))
      const status = hits.length > 0 ? 'present' : exp.optional ? 'missing (optional)' : 'MISSING'
      const detail =
        hits.length > 0
          ? hits.map((h) => `${h} (on ${groupNames.get(h).length} subcat)`).join('; ')
          : `closest: ${closestName([...groupNames.keys()], exp.pattern) ?? 'no groups on this category'}`
      lines.push(`| option group · ${exp.label} | ${status} | ${detail} |`)
      rows.push({ category: row.categoryId, kind: 'optionGroup', label: exp.label, status, detail })
    }

    const extraSubs = cat.subcategories.filter((s) => !matchedSubs.has(Number(s.subcategoryId)))
    for (const s of extraSubs) {
      lines.push(`| — | **EXTRA** subcategory | ${s.subcategoryId} ${s.name} |`)
      rows.push({ category: row.categoryId, kind: 'subcategory', label: String(s.name), status: 'EXTRA', detail: String(s.subcategoryId) })
    }
    const extraGroups = [...groupNames.keys()].filter((n) => !matchedGroups.has(n))
    for (const g of extraGroups) {
      lines.push(`| — | **EXTRA** option group | ${g} (on ${groupNames.get(g).length} subcat) |`)
      rows.push({ category: row.categoryId, kind: 'optionGroup', label: g, status: 'EXTRA', detail: `${groupNames.get(g).length} subcategories` })
    }
    lines.push('')
  }

  const extraCategories = snapshot.categories.filter((c) => !checkedCategoryIds.has(Number(c.id)))
  lines.push('## EXTRA categories (present in the API, absent from §2)')
  lines.push('')
  if (extraCategories.length === 0) lines.push('- none')
  for (const c of extraCategories) {
    lines.push(`- **${c.id} ${c.name}** — ${c.subcategories.length} subcategories: ${c.subcategories.map((s) => `${s.subcategoryId} ${s.name}`).join(', ') || 'none'}`)
    rows.push({ category: Number(c.id), kind: 'category', label: String(c.name), status: 'EXTRA', detail: `${c.subcategories.length} subcategories` })
  }
  lines.push('')

  // Full inventory: every subcategory with bounds/DPI and its groups.
  lines.push('## Full inventory (verbatim)')
  lines.push('')
  lines.push('| category | subcategoryId | name | minW | maxW | minH | maxH | DPI | option groups |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const c of snapshot.categories) {
    for (const s of c.subcategories) {
      const groups = (s.optionGroups ?? []).map((g) => `${g.optionGroup} (${(g.optionGroupItems ?? []).length})`).join('; ')
      lines.push(
        `| ${c.id} ${c.name} | ${s.subcategoryId} | ${s.name} | ${s.minimumWidth} | ${s.maximumWidth} | ${s.minimumHeight} | ${s.maximumHeight} | ${s.requiredDPI ?? ''} | ${groups || '—'} |`,
      )
    }
  }
  lines.push('')
  return { markdown: lines.join('\n'), rows }
}

// ---------------------------------------------------------------------------
// Assemble mode: per-category payloads from the admin snapshot route
// ---------------------------------------------------------------------------
function assemble(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
  // The admin route pages a big category across invocations (`incomplete`/`nextOffset`),
  // so several files can describe ONE category: merge them, deduping by subcategoryId.
  const byId = new Map()
  let host = null
  let capturedAt = null
  const incomplete = []
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    const payload = raw.data ?? raw
    if (!payload.category) continue
    host = host ?? payload.host
    capturedAt = capturedAt ?? payload.capturedAt
    if (payload.incomplete) incomplete.push({ file: f, category: Number(payload.category.id), nextOffset: payload.nextOffset ?? null })
    const cat = payload.category
    const id = Number(cat.id)
    if (!byId.has(id)) byId.set(id, { id, name: String(cat.name ?? ''), subcategories: [] })
    const target = byId.get(id)
    if (!target.name && cat.name) target.name = String(cat.name)
    for (const s of cat.subcategories ?? []) {
      if (target.subcategories.some((x) => Number(x.subcategoryId) === Number(s.subcategoryId))) continue
      target.subcategories.push({ ...s })
    }
  }
  const categories = [...byId.values()]
  if (categories.length === 0) throw new Error(`no per-category payloads found in ${dir}`)
  categories.sort((a, b) => a.id - b.id)
  for (const c of categories) c.subcategories.sort((a, b) => Number(a.subcategoryId) - Number(b.subcategoryId))
  // A page that reported `incomplete` and was never continued means the fixture is
  // missing rows: say so loudly rather than assembling a quietly partial snapshot.
  const dangling = incomplete.filter((i) => {
    const cat = byId.get(i.category)
    return i.nextOffset != null && cat && cat.subcategories.length <= i.nextOffset
  })
  if (dangling.length > 0) {
    console.warn(`WARNING: these captures were incomplete and no continuation was found: ${dangling.map((d) => `${d.file} (category ${d.category}, resume at offset ${d.nextOffset})`).join('; ')}`)
  }
  return {
    capturedAt: capturedAt ?? new Date().toISOString(),
    host: host ?? 'unknown-host',
    requestCount: null,
    wallMs: null,
    assembledFrom: { dir, files, incomplete },
    categories,
  }
}

// ---------------------------------------------------------------------------
// Diff mode: map by NAME, report id stability (plan §9 F12)
// ---------------------------------------------------------------------------
function indexByName(snapshot) {
  const cats = new Map()
  for (const c of snapshot.categories) {
    const subs = new Map()
    for (const s of c.subcategories) {
      const groups = new Map()
      for (const g of s.optionGroups ?? []) {
        const items = new Map()
        for (const it of g.optionGroupItems ?? []) items.set(String(it.optionName), Number(it.optionId))
        groups.set(String(g.optionGroup), items)
      }
      subs.set(String(s.name), { id: Number(s.subcategoryId), groups })
    }
    cats.set(String(c.name), { id: Number(c.id), subs })
  }
  return cats
}

function diffSnapshots(a, b) {
  const A = indexByName(a)
  const B = indexByName(b)
  const same = []
  const drift = []
  const onlyA = []
  const onlyB = []

  const cmp = (kind, pathStr, idA, idB) => {
    if (idA === idB) same.push({ kind, path: pathStr, id: idA })
    else drift.push({ kind, path: pathStr, idA, idB })
  }

  for (const [cName, cA] of A) {
    const cB = B.get(cName)
    if (!cB) {
      onlyA.push({ kind: 'category', path: cName, id: cA.id })
      continue
    }
    cmp('category', cName, cA.id, cB.id)
    for (const [sName, sA] of cA.subs) {
      const sB = cB.subs.get(sName)
      if (!sB) {
        onlyA.push({ kind: 'subcategory', path: `${cName} / ${sName}`, id: sA.id })
        continue
      }
      cmp('subcategory', `${cName} / ${sName}`, sA.id, sB.id)
      for (const [gName, gA] of sA.groups) {
        const gB = sB.groups.get(gName)
        if (!gB) {
          onlyA.push({ kind: 'optionGroup', path: `${cName} / ${sName} / ${gName}`, id: null })
          continue
        }
        for (const [oName, oA] of gA) {
          const oB = gB.get(oName)
          if (oB === undefined) {
            onlyA.push({ kind: 'option', path: `${cName} / ${sName} / ${gName} / ${oName}`, id: oA })
            continue
          }
          cmp('option', `${cName} / ${sName} / ${gName} / ${oName}`, oA, oB)
        }
        for (const [oName, oB] of gB) if (!gA.has(oName)) onlyB.push({ kind: 'option', path: `${cName} / ${sName} / ${gName} / ${oName}`, id: oB })
      }
      for (const [gName] of sB.groups) if (!sA.groups.has(gName)) onlyB.push({ kind: 'optionGroup', path: `${cName} / ${sName} / ${gName}`, id: null })
    }
    for (const [sName, sB] of cB.subs) if (!cA.subs.has(sName)) onlyB.push({ kind: 'subcategory', path: `${cName} / ${sName}`, id: sB.id })
  }
  for (const [cName, cB] of B) if (!A.has(cName)) onlyB.push({ kind: 'category', path: cName, id: cB.id })

  return { same, drift, onlyA, onlyB }
}

function diffMarkdown(a, b, d, aPath, bPath) {
  const L = []
  L.push(`# Catalog id diff (by name) — ${a.host} vs ${b.host}`)
  L.push('')
  L.push(`A: \`${aPath}\` (${a.host}, captured ${a.capturedAt})`)
  L.push(`B: \`${bPath}\` (${b.host}, captured ${b.capturedAt})`)
  L.push('')
  L.push(`- same-name same-id: **${d.same.length}**`)
  L.push(`- same-name DIFFERENT id (F12 signal): **${d.drift.length}**`)
  L.push(`- only in A: **${d.onlyA.length}**`)
  L.push(`- only in B: **${d.onlyB.length}**`)
  L.push('')
  L.push('## Same name, different id')
  L.push('')
  if (d.drift.length === 0) L.push('- none (ids are stable across hosts by name)')
  else {
    L.push('| kind | name path | id in A | id in B |')
    L.push('|---|---|---|---|')
    for (const r of d.drift) L.push(`| ${r.kind} | ${r.path} | ${r.idA} | ${r.idB} |`)
  }
  L.push('')
  for (const [title, arr] of [['Only in A', d.onlyA], ['Only in B', d.onlyB]]) {
    L.push(`## ${title}`)
    L.push('')
    if (arr.length === 0) L.push('- none')
    else for (const r of arr) L.push(`- ${r.kind}: ${r.path}${r.id == null ? '' : ` (id ${r.id})`}`)
    L.push('')
  }
  return L.join('\n')
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2))
const outDir = path.resolve(REPO, typeof args.out === 'string' ? args.out : 'fixtures/lumaprints')
fs.mkdirSync(outDir, { recursive: true })
const stamp = todayStamp()

if (args.diff) {
  const aPath = typeof args.diff === 'string' ? args.diff : args._[0]
  const bPath = args._[args._.length - 1] === aPath ? args._[0] : args._[args._.length - 1]
  if (!aPath || !bPath || aPath === bPath) {
    console.error('Usage: --diff <a.json> <b.json>')
    process.exit(2)
  }
  const a = JSON.parse(fs.readFileSync(path.resolve(aPath), 'utf8'))
  const b = JSON.parse(fs.readFileSync(path.resolve(bPath), 'utf8'))
  const d = diffSnapshots(a, b)
  const md = diffMarkdown(a, b, d, aPath, bPath)
  const file = path.join(outDir, `id-diff.${stamp}.md`)
  fs.writeFileSync(file, md)
  console.log(md)
  console.log(`\nWrote ${path.relative(REPO, file)}`)
  process.exit(d.drift.length > 0 ? 1 : 0)
}

let snapshot
if (args.assemble) {
  const dir = path.resolve(String(args.assemble))
  snapshot = assemble(dir)
  console.log(`Assembled ${snapshot.categories.length} categories from ${dir}`)
} else {
  const { client, envFile } = clientFromEnv({ envFile: typeof args.env === 'string' ? args.env : '.env.luma', rpm: 25 })
  console.log(`Walking ${client.baseUrl} (env ${envFile}) at <=${client.rpm} req/min`)
  snapshot = await walkCatalog(client)
  client.printSummary('snapshot ')
}

const fixtureFile = path.join(outDir, `catalog.${snapshot.host}.${stamp}.json`)
fs.writeFileSync(fixtureFile, JSON.stringify(snapshot, null, 2) + '\n')

const { markdown, rows } = buildCoverage(snapshot)
const coverageFile = path.join(outDir, `coverage.${snapshot.host}.${stamp}.md`)
fs.writeFileSync(coverageFile, markdown + '\n')

const subCount = snapshot.categories.reduce((n, c) => n + c.subcategories.length, 0)
const missing = rows.filter((r) => String(r.status).startsWith('MISSING') || String(r.status).startsWith('PARTIAL'))
const extras = rows.filter((r) => r.status === 'EXTRA')

console.log('')
console.log(`categories=${snapshot.categories.length} subcategories=${subCount}`)
console.log(`requestCount=${snapshot.requestCount} wallMs=${snapshot.wallMs}`)
console.log(`checklist rows missing/partial=${missing.length} extras=${extras.length}`)
for (const m of missing) console.log(`  MISSING ${m.category} ${m.kind} "${m.label}" -> ${m.detail}`)
for (const e of extras.slice(0, 40)) console.log(`  EXTRA   ${e.category} ${e.kind} "${e.label}" (${e.detail})`)
if (extras.length > 40) console.log(`  … +${extras.length - 40} more extras (see coverage file)`)
console.log('')
console.log(`Wrote ${path.relative(REPO, fixtureFile)}`)
console.log(`Wrote ${path.relative(REPO, coverageFile)}`)
