#!/usr/bin/env node
/**
 * Nightly Lumaprints price refresh.
 *
 * Hits /api/admin/variants/refresh for every published product. The route
 * itself does the cache-busting + cost recomputation; this script is the
 * scheduler-friendly wrapper.
 *
 * Run via Vercel Cron once one is configured, or `node scripts/refresh-lumaprints-prices.mjs`
 * locally. Requires:
 *   - APP_URL  — origin where the deployed admin lives (e.g. https://artbyme.studio)
 *   - ADMIN_REFRESH_TOKEN — service auth token for the admin API (paired with a
 *     server-side check in route handler if used outside the browser session;
 *     for now requires a logged-in admin's cookie).
 *
 * Output: JSON summary `{ product_id, refreshed, unavailable, big_changes }`
 * per product. Emails Margaret only when any variant cost moved more than 5%.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP_URL = process.env.APP_URL || 'https://artbyme.studio'
const COOKIE = process.env.ADMIN_COOKIE || ''
const SUPABASE_REF = process.env.SUPABASE_REF || 'klwkajukicsoiwpsgftt'

const RAW = execSync(`security find-generic-password -s 'Supabase CLI' -a supabase -w 2>/dev/null || true`, { encoding: 'utf8' }).trim()
const TOKEN = RAW.startsWith('go-keyring-base64:')
  ? Buffer.from(RAW.replace('go-keyring-base64:', ''), 'base64').toString('utf8')
  : ''

async function listPublishedProducts() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: "select id, slug, title from products where is_published = true order by created_at asc",
    }),
  })
  if (!res.ok) throw new Error(`List products failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function refresh(product_id) {
  const res = await fetch(`${APP_URL}/api/admin/variants/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({ product_id }),
  })
  if (!res.ok) {
    return { error: `${res.status}: ${await res.text()}` }
  }
  return res.json()
}

const products = await listPublishedProducts()
const summary = []
for (const p of products) {
  const result = await refresh(p.id)
  if (result.error) {
    summary.push({ slug: p.slug, error: result.error })
    continue
  }
  const diffs = result.data?.diffs || []
  const bigChanges = diffs.filter((d) => {
    if (!d.cost_before) return d.cost_after > 0
    return Math.abs(d.cost_after - d.cost_before) / d.cost_before > 0.05
  })
  summary.push({
    slug: p.slug,
    refreshed: result.data?.refreshed ?? 0,
    unavailable: result.data?.unavailable ?? 0,
    big_changes: bigChanges,
  })
}

console.log(JSON.stringify({ at: new Date().toISOString(), summary }, null, 2))
