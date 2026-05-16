#!/usr/bin/env node
// Convert every JPG/PNG under public/Margaret Edmondson/ARTWORK (excluding Official)
// to a 2400px-long-edge WebP at quality 85, upload to product-images/web/...,
// and rewrite matching product_images.url rows to the new public Supabase URL.

import sharp from 'sharp'
import { readdir, readFile, stat } from 'fs/promises'
import { join, relative } from 'path'

const PROJECT_REF = 'klwkajukicsoiwpsgftt'
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`
const SOURCE_ROOT = 'public/Margaret Edmondson/ARTWORK'
const BUCKET = 'product-images'
const PREFIX = 'web'
const LONG_EDGE = 2400
const QUALITY = 85
const MGMT_API = `https://api.supabase.com/v1/projects/${PROJECT_REF}`

const SBP_TOKEN = process.env.SBP_TOKEN
if (!SBP_TOKEN) { console.error('Missing SBP_TOKEN'); process.exit(1) }

async function getServiceRoleKey() {
  const res = await fetch(`${MGMT_API}/api-keys`, { headers: { Authorization: `Bearer ${SBP_TOKEN}` } })
  const keys = await res.json()
  const k = keys.find((x) => x.name === 'service_role')
  if (!k) throw new Error('No service_role key')
  return k.api_key
}

async function sql(query) {
  const res = await fetch(`${MGMT_API}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SBP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`SQL: ${JSON.stringify(data)}`)
  return data
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9.\-_/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function walk(dir) {
  const out = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'Official') continue
      out.push(...(await walk(p)))
    } else if (/\.(jpe?g|png)$/i.test(e.name)) {
      out.push(p)
    }
  }
  return out
}

function escapeStr(s) { return s.replace(/'/g, "''") }

async function uploadWebp(serviceKey, key, buffer, contentType = 'image/webp') {
  let lastErr = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${PROJECT_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buffer,
    })
    if (res.ok) return
    const body = await res.text()
    lastErr = `${res.status}: ${body.slice(0, 200).replace(/\s+/g, ' ')}`
    await new Promise((r) => setTimeout(r, 800 * attempt))
  }
  throw new Error(`Upload ${key} failed after retries: ${lastErr}`)
}

async function main() {
  const serviceKey = await getServiceRoleKey()
  const files = await walk(SOURCE_ROOT)
  console.log(`Found ${files.length} source images.\n`)

  let totalSrc = 0, totalOut = 0, updatedRows = 0
  const rows = []
  const failures = []

  for (const file of files) {
    const srcStat = await stat(file)
    const srcBytes = srcStat.size
    const rel = relative(SOURCE_ROOT, file)               // e.g. "Texas Themed/Mad Cow.jpg"
    const slugged = slugify(rel.replace(/\.(jpe?g|png)$/i, '.webp'))
    const key = `${PREFIX}/${slugged}`                     // e.g. "web/texas-themed/mad-cow.webp"

    const buf = await readFile(file)
    const webp = await sharp(buf)
      .rotate()
      .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer()

    try {
      await uploadWebp(serviceKey, key, webp)
    } catch (err) {
      console.log(`${rel.padEnd(60)} FAILED — ${err.message}`)
      failures.push({ file: rel, error: err.message })
      continue
    }
    const publicUrl = `${PROJECT_URL}/storage/v1/object/public/${BUCKET}/${key}`

    // Try to update any product_images row that points at the original /public path.
    const oldPath = `/Margaret Edmondson/ARTWORK/${rel}`
    const upd = await sql(
      `update product_images set url = '${escapeStr(publicUrl)}' where url = '${escapeStr(oldPath)}' returning id;`
    )
    const matched = Array.isArray(upd) ? upd.length : 0
    updatedRows += matched

    totalSrc += srcBytes
    totalOut += webp.length
    const compressionPct = ((1 - webp.length / srcBytes) * 100).toFixed(0)
    console.log(`${rel.padEnd(60)} ${(srcBytes/1024).toFixed(0).padStart(7)}KB → ${(webp.length/1024).toFixed(0).padStart(5)}KB (-${compressionPct}%) rows=${matched}`)
    rows.push({ file: rel, src: srcBytes, out: webp.length, key, publicUrl, rowsUpdated: matched })
  }

  console.log('\n===== SUMMARY =====')
  console.log(`Files processed:   ${files.length}`)
  console.log(`Uploaded:          ${rows.length}`)
  console.log(`Failed:            ${failures.length}`)
  console.log(`Total source:      ${(totalSrc/1024/1024).toFixed(1)} MB`)
  console.log(`Total compressed:  ${(totalOut/1024/1024).toFixed(1)} MB`)
  if (totalSrc > 0) console.log(`Compression ratio: -${((1 - totalOut/totalSrc) * 100).toFixed(0)}%`)
  console.log(`DB rows updated:   ${updatedRows}`)
  console.log(`Unmatched files:   ${rows.filter(r => r.rowsUpdated === 0).length}`)
  if (failures.length) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  ${f.file}: ${f.error}`)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
