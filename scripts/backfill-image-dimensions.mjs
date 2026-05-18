#!/usr/bin/env node
/**
 * For every product_images row whose URL is on Supabase Storage, download a
 * tiny prefix and read the WebP header to extract width/height. Write back
 * to the row so we can render images at their true intrinsic aspect ratio.
 */

import sharp from 'sharp'

const REF = 'klwkajukicsoiwpsgftt'
const MGMT = `https://api.supabase.com/v1/projects/${REF}`
const SBP_TOKEN = process.env.SBP_TOKEN
if (!SBP_TOKEN) { console.error('Missing SBP_TOKEN'); process.exit(1) }

async function sql(query) {
  const r = await fetch(`${MGMT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SBP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(JSON.stringify(d))
  return d
}

async function getDims(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Fetch ${url}: ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  const m = await sharp(buf).metadata()
  return { width: m.width, height: m.height }
}

const rows = await sql(`select id, url from product_images where url like 'https://%.supabase.co/%' and (width is null or height is null);`)
console.log(`${rows.length} rows to backfill\n`)

let ok = 0, fail = 0
for (const row of rows) {
  try {
    const { width, height } = await getDims(row.url)
    await sql(`update product_images set width = ${width}, height = ${height} where id = '${row.id}';`)
    console.log(`  ${width}x${height}  ${row.url.split('/').pop()}`)
    ok += 1
  } catch (err) {
    console.log(`  FAIL  ${row.url.split('/').pop()}: ${err.message}`)
    fail += 1
  }
}
console.log(`\nDone: ${ok} updated, ${fail} failed.`)
