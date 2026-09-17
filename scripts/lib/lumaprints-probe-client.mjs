// Authored by DotWin
// Shared standalone LumaPrints client for the catalog snapshot + probe harness.
//
// Why this exists: the app client (`src/lib/integrations/lumaprints.ts`) reads the
// fulfillment kill switch out of Supabase on every call and has no request budget of
// its own. Discovery scripts run hundreds of calls against a key whose documented
// ceiling is 40 requests/minute shared with the live storefront's quote path, so this
// client enforces a HARD token bucket (default 25/min, leaving >=15/min headroom for
// customers per plan F29/ADR-7), honours `x-ratelimit-reset` on a 429, and records
// every request/response so a probe verdict can never be reported without its status
// code and raw body.
//
// Nothing here writes to the database and nothing here is imported by the app.

import fs from 'node:fs'
import path from 'node:path'

/**
 * The sandbox, by exact hostname.
 *
 * This used to be a substring test against the whole base URL, which is a gate that can
 * be walked through: `https://us.api.lumaprints.com/api-sandbox`, or any host whose
 * name or path merely contains the word, would have passed `isSandbox` and unlocked
 * order submission against PRODUCTION. The host is parsed and compared whole.
 */
export const SANDBOX_HOSTNAME = 'us.api-sandbox.lumaprints.com'

/** Load a KEY=VALUE env file into process.env WITHOUT clobbering exported vars. */
export function loadEnvFile(file) {
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) return { loaded: false, file: abs, keys: [] }
  const keys = []
  for (const line of fs.readFileSync(abs, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue
    keys.push(k)
    if (process.env[k] === undefined) {
      process.env[k] = t
        .slice(i + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
    }
  }
  return { loaded: true, file: abs, keys }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Throttled, recording LumaPrints client.
 *
 * Every call goes through `request()`: the token bucket counts EVERY request
 * (including retries), so the printed `requestCount` is the real spend against the
 * key's minute budget.
 */
export class ProbeClient {
  constructor({ baseUrl, apiKey, apiSecret, storeId, rpm = 25, maxRetries = 3, verbose = true }) {
    if (!baseUrl) throw new Error('ProbeClient: baseUrl is required')
    if (!apiKey || !apiSecret) throw new Error('ProbeClient: apiKey/apiSecret are required')
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.host = new URL(this.baseUrl).hostname
    this.storeId = Number(storeId)
    this.rpm = rpm
    this.maxRetries = maxRetries
    this.verbose = verbose
    this.auth = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    this.records = []
    this.requestCount = 0
    this.rateLimited = 0
    this.startedAt = Date.now()
    /** @type {number[]} epoch ms of each request sent, trimmed to the last 60s */
    this._window = []
  }

  get isSandbox() {
    return this.host === SANDBOX_HOSTNAME
  }

  /** Refuse to continue unless the configured host is the sandbox. */
  assertSandbox(what = 'this operation') {
    if (!this.isSandbox) {
      throw new Error(
        `REFUSING: ${what} requires the sandbox host (got "${this.baseUrl}"). This harness never runs against production.`,
      )
    }
  }

  async _throttle() {
    for (;;) {
      const now = Date.now()
      this._window = this._window.filter((t) => now - t < 60_000)
      if (this._window.length < this.rpm) {
        this._window.push(now)
        return
      }
      const waitMs = 60_000 - (now - this._window[0]) + 50
      if (this.verbose) process.stderr.write(`  [throttle] budget full, waiting ${Math.ceil(waitMs / 1000)}s\n`)
      await sleep(waitMs)
    }
  }

  /**
   * Send one request. Returns `{ status, ok, body, rawText, headers, ms }` and pushes
   * the same record (with the request) onto `this.records`.
   */
  async request(method, apiPath, body, { label = null, retryOn = true } = {}) {
    let attempt = 0
    for (;;) {
      await this._throttle()
      this.requestCount += 1
      const startedAt = Date.now()
      let status = 0
      let rawText = ''
      let headers = {}
      let error = null
      try {
        const res = await fetch(`${this.baseUrl}${apiPath}`, {
          method,
          headers: { Authorization: this.auth, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
        status = res.status
        headers = {
          'x-ratelimit-limit': res.headers.get('x-ratelimit-limit'),
          'x-ratelimit-remaining': res.headers.get('x-ratelimit-remaining'),
          'x-ratelimit-reset': res.headers.get('x-ratelimit-reset'),
        }
        rawText = await res.text()
      } catch (e) {
        error = String(e && e.message ? e.message : e)
      }
      const ms = Date.now() - startedAt
      let parsed
      try {
        parsed = rawText ? JSON.parse(rawText) : null
      } catch {
        parsed = rawText
      }
      const record = {
        label,
        method,
        path: apiPath,
        request: body ?? null,
        status,
        ok: status >= 200 && status < 300,
        body: parsed,
        rawText,
        headers,
        ms,
        attempt,
        error,
        at: new Date(startedAt).toISOString(),
      }
      this.records.push(record)

      const retryable = status === 429 || (status >= 500 && status < 600) || (error && status === 0)
      if (status === 429) this.rateLimited += 1
      if (retryOn && retryable && attempt < this.maxRetries) {
        const resetSec = Number(headers['x-ratelimit-reset'])
        const waitMs = Number.isFinite(resetSec) && resetSec > 0 ? resetSec * 1000 + 250 : 2000 * 2 ** attempt
        if (this.verbose) {
          process.stderr.write(`  [backoff] ${method} ${apiPath} -> ${status || error}; waiting ${Math.ceil(waitMs / 1000)}s\n`)
        }
        await sleep(waitMs)
        attempt += 1
        continue
      }
      if (error && status === 0) throw new Error(`${method} ${apiPath} failed: ${error}`)
      return record
    }
  }

  get(apiPath, opts) {
    return this.request('GET', apiPath, undefined, opts)
  }

  post(apiPath, body, opts) {
    return this.request('POST', apiPath, body, opts)
  }

  // --- Catalog endpoints (documented contract, docs/lumaprints-api-reference.md) ---

  getCategories() {
    return this.get('/api/v1/products/categories', { label: 'categories' })
  }

  getSubcategories(categoryId) {
    return this.get(`/api/v1/products/categories/${categoryId}/subcategories`, {
      label: `subcategories:${categoryId}`,
    })
  }

  getSubcategoryOptions(subcategoryId) {
    return this.get(`/api/v1/products/subcategories/${subcategoryId}/options`, {
      label: `options:${subcategoryId}`,
    })
  }

  priceBatch(items, label = 'pricing/products') {
    return this.post('/api/v1/pricing/products', items, { label })
  }

  priceSingle(item, label = 'pricing/product') {
    return this.post('/api/v1/pricing/product', item, { label })
  }

  shipping(payload, label = 'pricing/shipping') {
    return this.post('/api/v1/pricing/shipping', payload, { label })
  }

  checkImageConfig(payload, label = 'checkImageConfig') {
    return this.post('/api/v1/images/checkImageConfig', payload, { label })
  }

  /** Submit ONE order. Sandbox-gated at the call site AND here. */
  submitOrder(payload, label = 'orders') {
    this.assertSandbox('submitting an order')
    if (!Number.isFinite(this.storeId) || this.storeId <= 0) {
      throw new Error('ProbeClient: a positive storeId is required to submit an order')
    }
    return this.post('/api/v1/orders', payload, { label })
  }

  getOrder(orderNumber, label = 'orders/get') {
    return this.get(`/api/v1/orders/${orderNumber}`, { label })
  }

  /**
   * Peak requests started inside ANY rolling 60s window. This, not the run average,
   * is the number the 40/min provider limit cares about: a run can average more than
   * the cap across a long wall time only if its bursts sit on window boundaries.
   */
  peakPerMinute() {
    const starts = this.records.map((r) => Date.parse(r.at)).sort((a, b) => a - b)
    let peak = 0
    for (let i = 0; i < starts.length; i++) {
      let n = 0
      for (let j = i; j < starts.length && starts[j] - starts[i] < 60_000; j++) n++
      if (n > peak) peak = n
    }
    return peak
  }

  summary() {
    const wallMs = Date.now() - this.startedAt
    return {
      host: this.host,
      requestCount: this.requestCount,
      wallMs,
      rpmCap: this.rpm,
      averageRpm: wallMs > 0 ? Number(((this.requestCount / wallMs) * 60_000).toFixed(2)) : 0,
      peakPerRolling60s: this.peakPerMinute(),
      rateLimited: this.rateLimited,
    }
  }

  printSummary(prefix = '') {
    const s = this.summary()
    console.log(
      `${prefix}requests=${s.requestCount} wallMs=${s.wallMs} (${(s.wallMs / 1000).toFixed(1)}s) peakPerRolling60s=${s.peakPerRolling60s} (cap ${s.rpmCap}) averageRpm=${s.averageRpm} 429s=${s.rateLimited}`,
    )
    return s
  }
}

/**
 * Build a client from an env file + process env. `--env <file>` is the caller's flag;
 * exported vars always win over the file.
 */
export function clientFromEnv({ envFile = '.env.luma', rpm = 25, verbose = true } = {}) {
  const loaded = loadEnvFile(envFile)
  const baseUrl = process.env.LUMAPRINTS_BASE_URL || ''
  const apiKey = process.env.LUMAPRINTS_API_KEY
  const apiSecret = process.env.LUMAPRINTS_API_SECRET
  const storeId = process.env.LUMAPRINTS_STORE_ID
  if (!baseUrl) throw new Error(`LUMAPRINTS_BASE_URL is not set (env file: ${loaded.file}, loaded=${loaded.loaded})`)
  if (!apiKey || !apiSecret) throw new Error(`LUMAPRINTS_API_KEY / LUMAPRINTS_API_SECRET are not set (env file: ${loaded.file})`)
  return { client: new ProbeClient({ baseUrl, apiKey, apiSecret, storeId, rpm, verbose }), envFile: loaded.file }
}

/** Parse `--flag value` / `--flag` argv into an object. */
export function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const k = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) out[k] = true
      else {
        out[k] = next
        i++
      }
    } else out._.push(a)
  }
  return out
}

/** Today in YYYY-MM-DD, local time (fixture filenames are date-stamped). */
export function todayStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
