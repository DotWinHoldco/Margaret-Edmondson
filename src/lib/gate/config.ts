/**
 * Site-gate configuration, DB-first with env fallback.
 *
 * The pre-launch password gate used to be controlled ONLY by the
 * SITE_PASSWORD / SITE_AUTH_SECRET env vars, which meant going live required a
 * Vercel change. The gate is now driven by site_settings (gate_enabled,
 * gate_password, gate_secret, gate_cookie_hours) so the owner can go live,
 * re-gate, change the password, or change the cookie duration from
 * /admin/settings — env vars remain a fallback so a missing/unreadable DB row
 * can never strand the site in the wrong state.
 *
 * Runtime constraints: this module is imported by BOTH the edge middleware
 * (src/proxy.ts) and node route handlers (/api/gate), so it uses only fetch +
 * WebCrypto — no node:crypto, no supabase-js. site_settings has NO anon read
 * policy (it carries internal config), so the read uses the service-role key
 * directly against PostgREST. That is a narrow, documented server read in the
 * same class as webhooks/crons (no user session, deliberate) — the fields read
 * here are exactly the gate credential material the middleware must compare
 * against and must never reach a browser.
 *
 * Caching: per-instance cache with a short TTL, stale-while-error. A transient
 * DB failure serves the last-known-good config (so a live site cannot
 * re-gate itself, and a gated site cannot briefly open) and only a cold
 * instance with no successful read ever falls back to env behavior.
 */

export interface GateConfig {
  enabled: boolean
  password: string | null
  secret: string | null
  cookieHours: number
  source: 'db' | 'db-stale' | 'env'
}

const TTL_MS = 30_000
const DEFAULT_COOKIE_HOURS = 720 // 30 days — matches the previous fixed maxAge

interface GateRow {
  gate_enabled: boolean | null
  gate_password: string | null
  gate_secret: string | null
  gate_cookie_hours: number | null
}

let cache: { ts: number; row: GateRow } | null = null

export function clearGateConfigCache() {
  cache = null
}

function envConfig(): GateConfig {
  const password = process.env.SITE_PASSWORD || null
  const secret = process.env.SITE_AUTH_SECRET || null
  return {
    enabled: Boolean(password && secret),
    password,
    secret,
    cookieHours: DEFAULT_COOKIE_HOURS,
    source: 'env',
  }
}

function fromRow(row: GateRow, source: 'db' | 'db-stale'): GateConfig {
  // DB row wins; null credential fields fall through to env so a schema-only
  // deploy (columns added, secrets not yet seeded) behaves exactly as before.
  const password = row.gate_password || process.env.SITE_PASSWORD || null
  const secret = row.gate_secret || process.env.SITE_AUTH_SECRET || null
  const enabled = row.gate_enabled !== false && Boolean(password && secret)
  const hours = Number(row.gate_cookie_hours)
  return {
    enabled,
    password,
    secret,
    cookieHours: Number.isFinite(hours) && hours >= 1 ? Math.min(hours, 8760) : DEFAULT_COOKIE_HOURS,
    source,
  }
}

export async function getGateConfig(): Promise<GateConfig> {
  if (cache && Date.now() - cache.ts < TTL_MS) return fromRow(cache.row, 'db')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return cache ? fromRow(cache.row, 'db-stale') : envConfig()
  }

  try {
    const res = await fetch(
      `${url}/rest/v1/site_settings?id=eq.true&select=gate_enabled,gate_password,gate_secret,gate_cookie_hours`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(2500),
        cache: 'no-store',
      },
    )
    if (!res.ok) throw new Error(`gate config read ${res.status}`)
    const rows = (await res.json()) as GateRow[]
    const row = rows?.[0]
    if (!row) throw new Error('gate config row missing')
    cache = { ts: Date.now(), row }
    return fromRow(row, 'db')
  } catch {
    // Stale-while-error: keep serving the last good config; env only when cold.
    return cache ? fromRow(cache.row, 'db-stale') : envConfig()
  }
}

/** The gate cookie value: SHA-256 hex of password + secret (WebCrypto, edge-safe). */
export async function gateToken(password: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(password + secret)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
