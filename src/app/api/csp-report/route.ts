// dotwin-allow:public-write (unauthenticated by design): browsers post CSP
// violation reports with no credentials and no CORS preflight. The handler
// writes nothing to the database, bounds the body it will read, and always
// answers 204. Authored by DotWin.

import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

// A violation report is a small JSON object. Anything larger is not a report,
// so it is dropped unread rather than parsed.
const MAX_BODY_BYTES = 16_384

// Per-IP ceiling. Generous enough that a genuinely broken page still tells us
// what broke (a browser fires one report per distinct violation), tight enough
// that the endpoint cannot be used to flood the log drain.
const RATE_LIMIT = { limit: 60, windowMs: 60_000, keyPrefix: 'csp-report' }

// Field caps for the log line. A report is attacker-controllable input, so
// every value that reaches the log is length-bounded and stripped of the
// newlines and control characters that would otherwise let a caller forge
// additional log entries.
const MAX_FIELD_CHARS = 200

// The `application/csp-report` body shape (CSP Level 2 / report-uri).
interface LegacyCspReport {
  'csp-report'?: Record<string, unknown>
}

// One entry of an `application/reports+json` body (Reporting API / report-to).
interface ReportingApiEntry {
  type?: unknown
  url?: unknown
  body?: Record<string, unknown>
}

// The subset of fields both shapes share, after normalization.
interface NormalizedViolation {
  documentUri: string
  directive: string
  blockedUri: string
  disposition: string
  sourceFile: string
  lineNumber: string
  sample: string
}

function clean(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return ''
  // Collapse anything that would break the one-line log contract: CR/LF and
  // the rest of the C0 control range plus DEL, which is how a caller would
  // otherwise forge extra log entries.
  return value.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, MAX_FIELD_CHARS)
}

function normalize(body: Record<string, unknown>): NormalizedViolation {
  // The Reporting API renamed the CSP2 fields; accept either spelling so both
  // transports produce the same log line.
  const directive =
    body['effectiveDirective'] ?? body['effective-directive'] ?? body['violatedDirective'] ?? body['violated-directive']
  return {
    documentUri: clean(body['documentURL'] ?? body['document-uri']),
    directive: clean(directive),
    blockedUri: clean(body['blockedURL'] ?? body['blocked-uri']),
    disposition: clean(body['disposition']),
    sourceFile: clean(body['sourceFile'] ?? body['source-file']),
    lineNumber: clean(body['lineNumber'] ?? body['line-number']),
    sample: clean(body['sample'] ?? body['script-sample']),
  }
}

function logViolation(violation: NormalizedViolation): void {
  // One line per violation, key=value, so a Vercel log drain can be filtered on
  // the `[csp-violation]` prefix and the fields parsed without a JSON decoder.
  const parts = [
    '[csp-violation]',
    `directive=${violation.directive || 'unknown'}`,
    `blocked=${violation.blockedUri || 'unknown'}`,
    `document=${violation.documentUri || 'unknown'}`,
  ]
  if (violation.disposition) parts.push(`disposition=${violation.disposition}`)
  if (violation.sourceFile) parts.push(`source=${violation.sourceFile}:${violation.lineNumber || '0'}`)
  if (violation.sample) parts.push(`sample=${JSON.stringify(violation.sample)}`)
  console.error(parts.join(' '))
}

// Every exit path answers 204: a violation collector must never give a probing
// client a distinguishable response, and a browser ignores the body anyway.
function noContent(): Response {
  return new Response(null, { status: 204 })
}

// POST /api/csp-report: collect Content-Security-Policy violation reports from
// browsers (both the `application/csp-report` and `application/reports+json`
// shapes) and emit one compact line per violation for the log drain; public.
export async function POST(request: Request): Promise<Response> {
  const rl = rateLimit(request, RATE_LIMIT)
  if (!rl.ok) return rateLimitResponse(rl)

  // Refuse an oversized body before reading it. `content-length` is absent on a
  // chunked upload, so the decoded text is re-checked below.
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return noContent()

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return noContent()
  }
  if (raw.length === 0 || raw.length > MAX_BODY_BYTES) return noContent()

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return noContent()
  }

  // `application/reports+json` sends an array of envelopes; `application/csp-report`
  // sends a single object under a `csp-report` key. Dispatch on the payload
  // itself rather than the content type, because browsers are inconsistent
  // about which type they label a report with.
  if (Array.isArray(payload)) {
    for (const entry of payload as ReportingApiEntry[]) {
      if (!entry || typeof entry !== 'object') continue
      if (typeof entry.type === 'string' && entry.type !== 'csp-violation') continue
      const body = entry.body
      if (!body || typeof body !== 'object') continue
      const violation = normalize(body)
      // The envelope carries the document URL when the report body omits it.
      if (!violation.documentUri) violation.documentUri = clean(entry.url)
      logViolation(violation)
    }
    return noContent()
  }

  if (payload && typeof payload === 'object') {
    const legacy = (payload as LegacyCspReport)['csp-report']
    const body = legacy && typeof legacy === 'object' ? legacy : (payload as Record<string, unknown>)
    logViolation(normalize(body))
  }

  return noContent()
}
