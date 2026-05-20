#!/usr/bin/env node
/**
 * One-shot uploader: walks public/Margaret Edmondson/Margaret Bio Photos/
 * and pushes each image into the about-images Supabase bucket, registers
 * the row in media_library with category 'about'.
 *
 * Idempotent — uses (storage_bucket, storage_path) as the upsert key.
 */

import { readFile, readdir } from 'node:fs/promises'
import { extname, basename, join } from 'node:path'
import { execSync } from 'node:child_process'

const REF = process.env.SUPABASE_REF || 'klwkajukicsoiwpsgftt'
const BUCKET = 'about-images'
const SRC = process.env.SRC || 'public/Margaret Edmondson/Margaret Bio Photos'

const RAW = execSync(`security find-generic-password -s 'Supabase CLI' -a supabase -w 2>/dev/null`, { encoding: 'utf8' }).trim()
const TOKEN = RAW.startsWith('go-keyring-base64:')
  ? Buffer.from(RAW.replace('go-keyring-base64:', ''), 'base64').toString('utf8')
  : ''
if (!TOKEN) { console.error('No Supabase token from keychain'); process.exit(1) }

const SUPABASE_URL = `https://${REF}.supabase.co`

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL ${res.status}: ${await res.text()}`)
  return res.json()
}

// Fetch the anon key from the project so we can hit /storage/v1/object/...
// from a node script with admin authorization via the management token.
// The Management API doesn't proxy storage uploads, but a service-role JWT
// minted via the management token does. Easier: use the management API's
// /storage/buckets/{name}/objects endpoint.
// Fetch the project's service-role key via Management API.
async function getServiceRoleKey() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) throw new Error(`api-keys: ${res.status} ${await res.text()}`)
  const keys = await res.json()
  const sr = keys.find((k) => k.name === 'service_role')
  if (!sr) throw new Error('service_role key not found')
  return sr.api_key
}

const SERVICE_ROLE_KEY = await getServiceRoleKey()

async function uploadObject(bucket, path, body, contentType) {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Upload ${path}: ${res.status} ${txt}`)
  }
}

function safeName(name) {
  const ext = extname(name)
  const base = basename(name, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base + ext.toLowerCase()
}

const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
const valueRows = []
let uploaded = 0
let failed = 0

for (const file of files) {
  const safe = safeName(file)
  const storagePath = `bio-photos/${safe}`
  const body = await readFile(join(SRC, file))
  const ext = extname(file).toLowerCase()
  const contentType = ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : 'image/jpeg'

  try {
    await uploadObject(BUCKET, storagePath, body, contentType)
    uploaded += 1
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
    valueRows.push(
      `('${BUCKET}', '${storagePath}', '${publicUrl}', '${file.replace(/'/g, "''")}', ARRAY['about']::text[], 'public-bio-photo')`,
    )
    console.log(`✓ ${file}`)
  } catch (e) {
    failed += 1
    console.error(`✗ ${file}: ${e.message}`)
  }
}

if (valueRows.length) {
  const stmt = `
    insert into media_library (storage_bucket, storage_path, url, file_name, categories, source)
    values ${valueRows.join(',\n')}
    on conflict (storage_bucket, storage_path) do nothing
    returning id, file_name;
  `
  const result = await runSql(stmt)
  console.log(`\nRegistered ${Array.isArray(result) ? result.length : 0} new media_library rows. Uploaded ${uploaded}, failed ${failed}.`)
} else {
  console.log(`No files uploaded. failed=${failed}`)
}
