#!/usr/bin/env node
/**
 * check-env.mjs — asserts the PRESENCE (never the value) of every environment
 * variable the platform needs to run. Loads .env.local first (for local runs),
 * then falls back to process.env (Vercel / CI). Prints a grouped report and
 * exits non-zero only when a REQUIRED var is missing, so it can gate CI.
 *
 * Usage: node scripts/check-env.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Lightweight .env loader (no dependency). process.env always wins.
function loadEnvFile(name) {
  const path = join(root, name)
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (process.env[key] !== undefined) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

// Local convenience only; in Vercel/CI these files do not exist.
loadEnvFile('.env.local')

/**
 * Each var: { name, required } — required means a missing value fails CI.
 * Optional vars are reported but never fail the run (e.g. test-mode Stripe keys
 * that only matter in non-prod, or features behind a flag).
 */
const GROUPS = {
  Supabase: [
    { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true },
    { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
  ],
  Stripe: [
    { name: 'STRIPE_SECRET_KEY_TEST', required: false },
    { name: 'STRIPE_WEBHOOK_SECRET_TEST', required: false },
    { name: 'STRIPE_SECRET_KEY', required: false },
    { name: 'STRIPE_WEBHOOK_SECRET', required: false },
    { name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', required: false },
  ],
  Email: [
    { name: 'RESEND_API_KEY', required: true },
    { name: 'RESEND_WEBHOOK_SECRET', required: false },
    { name: 'EMAIL_FROM', required: false },
  ],
  Fulfillment: [
    { name: 'LUMAPRINTS_API_KEY', required: false },
    { name: 'LUMAPRINTS_API_SECRET', required: false },
    { name: 'PRINTFUL_ACCESS_TOKEN', required: false },
    { name: 'SHIPSTATION_API_KEY', required: false },
  ],
  Meta: [{ name: 'META_CAPI_ACCESS_TOKEN', required: false }],
  AI: [{ name: 'ANTHROPIC_API_KEY', required: false }],
  Platform: [
    { name: 'CRON_SECRET', required: true },
    { name: 'SITE_PASSWORD', required: false },
    { name: 'SITE_AUTH_SECRET', required: false },
  ],
}

let missingRequired = 0
const missingNames = []

console.log('Environment presence check (values are never printed)\n')

for (const [group, vars] of Object.entries(GROUPS)) {
  console.log(`${group}:`)
  for (const { name, required } of vars) {
    const present = typeof process.env[name] === 'string' && process.env[name].length > 0
    const tag = present ? '  set  ' : required ? 'MISSING' : 'unset  '
    const mark = present ? '✓' : required ? '✗' : '·'
    console.log(`  ${mark} [${tag}] ${name}`)
    if (!present) {
      missingNames.push(name + (required ? ' (required)' : ''))
      if (required) missingRequired++
    }
  }
  console.log('')
}

if (missingNames.length) {
  console.log('Missing:', missingNames.join(', '))
}

if (missingRequired > 0) {
  console.error(`\n${missingRequired} REQUIRED variable(s) missing.`)
  process.exit(1)
}

console.log('\nAll required variables present.')
