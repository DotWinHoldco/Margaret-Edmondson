#!/usr/bin/env node
/**
 * Walks the Lumaprints catalog: categories → subcategories → options.
 * Prints a JSON tree so we can pick subcategoryIds + default options for
 * each medium we want to expose in the variant builder.
 *
 * Run: node -r dotenv/config scripts/discover-lumaprints-catalog.mjs dotenv_config_path=.env.lumaprints
 */

import { readFileSync } from 'node:fs'

// Lightweight .env loader so we don't need dotenv installed.
function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      const val = m[2].replace(/^"|"$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
    }
  } catch { /* file missing — fall through to existing env */ }
}
loadEnv('.env.lumaprints')

const API_KEY = process.env.LUMAPRINTS_API_KEY
const API_SECRET = process.env.LUMAPRINTS_API_SECRET
const BASE = process.env.LUMAPRINTS_BASE_URL || 'https://us.api.lumaprints.com'
if (!API_KEY || !API_SECRET) {
  console.error('Missing LUMAPRINTS_API_KEY / LUMAPRINTS_API_SECRET')
  process.exit(1)
}
const AUTH = `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}`

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: AUTH, 'Content-Type': 'application/json' } })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

const categories = await get('/api/v1/products/categories')
const tree = []
for (const c of categories) {
  const subs = await get(`/api/v1/products/categories/${c.categoryId}/subcategories`)
  const subInfo = []
  for (const s of subs) {
    let options = []
    try {
      options = await get(`/api/v1/products/subcategories/${s.subcategoryId}/options`)
    } catch (e) {
      options = [{ error: String(e) }]
    }
    subInfo.push({
      subcategoryId: s.subcategoryId,
      name: s.name,
      sizes: s.sizes || s.availableSizes || null,
      options,
    })
  }
  tree.push({ categoryId: c.categoryId, name: c.name, subcategories: subInfo })
}

console.log(JSON.stringify(tree, null, 2))
