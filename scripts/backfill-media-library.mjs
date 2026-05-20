#!/usr/bin/env node
/**
 * Backfill the media_library table from existing storage buckets.
 *
 * Maps each public bucket to its default category, walks the bucket
 * recursively, and upserts a media_library row for every image-like
 * object. Idempotent (uses storage_bucket + storage_path as the unique
 * key, so re-running won't dupe).
 *
 * Reads the Supabase Management token from the macOS keychain via the
 * same alias `sb-sql.sh` uses.
 */

import { execSync } from 'node:child_process'

const REF = process.env.SUPABASE_REF || 'klwkajukicsoiwpsgftt'

const RAW = execSync(`security find-generic-password -s 'Supabase CLI' -a supabase -w 2>/dev/null`, { encoding: 'utf8' }).trim()
const TOKEN = RAW.startsWith('go-keyring-base64:')
  ? Buffer.from(RAW.replace('go-keyring-base64:', ''), 'base64').toString('utf8')
  : ''
if (!TOKEN) {
  console.error('Could not load Supabase access token from keychain (alias: Supabase CLI / supabase).')
  process.exit(1)
}

const BASE = `https://api.supabase.com/v1/projects/${REF}`

async function runSql(query) {
  const res = await fetch(`${BASE}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// Bucket → default category list. Public buckets only; print-masters
// and shared-files are intentionally excluded (private/internal use).
const BUCKET_CATEGORIES = {
  'product-images': ['products'],
  'about-images': ['about'],
  'commission-references': ['commissions'],
  'class-pet-photos': ['classes'],
  'testimonials': ['testimonials'],
  'library': ['library'],
}

const IMG_EXT_RE = /\.(jpe?g|png|webp|avif|gif|svg)$/i

const SUPABASE_PROJECT_URL = `https://${REF}.supabase.co`

function publicUrl(bucket, path) {
  return `${SUPABASE_PROJECT_URL}/storage/v1/object/public/${bucket}/${path}`
}

function escapeSqlText(s) {
  return s.replace(/'/g, "''")
}

function escapeSqlArray(arr) {
  return arr.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')
}

// Walks the storage.objects table directly via the Management API. This
// returns paths even for nested objects without paging.
async function listObjects(bucket) {
  const out = await runSql(
    `select name from storage.objects where bucket_id = '${bucket}' order by name asc;`,
  )
  return out
}

let totalInserted = 0
let totalSkipped = 0
const summary = {}

for (const [bucket, categories] of Object.entries(BUCKET_CATEGORIES)) {
  let inserted = 0
  let skipped = 0
  let objects
  try {
    objects = await listObjects(bucket)
  } catch (e) {
    summary[bucket] = { error: String(e) }
    continue
  }

  const valueRows = []
  for (const obj of objects) {
    const path = obj.name
    if (!IMG_EXT_RE.test(path)) {
      skipped += 1
      continue
    }
    const fileName = path.split('/').pop() || path
    const url = publicUrl(bucket, path)
    valueRows.push(
      `('${bucket}', '${escapeSqlText(path)}', '${escapeSqlText(url)}', '${escapeSqlText(fileName)}', ARRAY[${categories.map((c) => `'${c}'`).join(',')}]::text[])`,
    )
  }
  if (valueRows.length === 0) {
    summary[bucket] = { inserted: 0, skipped }
    continue
  }

  const stmt = `
    insert into media_library (storage_bucket, storage_path, url, file_name, categories)
    values ${valueRows.join(',\n')}
    on conflict (storage_bucket, storage_path) do nothing
    returning id;
  `
  const result = await runSql(stmt)
  inserted = Array.isArray(result) ? result.length : 0
  totalInserted += inserted
  totalSkipped += skipped
  summary[bucket] = { inserted, skipped, considered: objects.length }
}

console.log(JSON.stringify({ totalInserted, totalSkipped, summary }, null, 2))
