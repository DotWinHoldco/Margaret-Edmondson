// Authored by DotWin
//
// The single friendly-error layer for ArtByME. Nothing the customer or the
// studio owner sees should ever be raw developer text — no Postgres error
// strings, no stack traces, no "PGRST" codes. Every error surfaced in the UI
// resolves through here to a plain, human sentence.
//
// Two entry points:
//   - friendlyMessage(code)        -> the canonical copy for a known error code
//   - resolveErrorMessage(input)   -> best-effort human copy for anything
//                                     (an error code, an Error, a raw string,
//                                     a { error, code } API body, a network fail)
//
// Used by both the server response helper (src/lib/api/respond.ts) and the
// client fetch wrapper (src/lib/api/client.ts), so keep it free of any
// server-only or 'use client' imports.

/** Canonical error codes returned by the API (respond.ts) and mapped below. */
export const FRIENDLY_MESSAGES: Record<string, string> = {
  // Generic
  INTERNAL: 'Something went wrong on our end. Please try again in a moment.',
  UNKNOWN: 'Something went wrong. Please try again.',
  NETWORK: "We couldn't reach the server. Please check your connection and try again.",

  // Data / database
  DATABASE_ERROR:
    'There was an error with your database. Please try again — if it keeps happening, contact your developer.',
  NOT_FOUND: "We couldn't find what you were looking for.",
  CONFLICT: 'That conflicts with something that already exists. Please review and try again.',
  ALREADY_EXISTS: 'That already exists. Please use a different value.',

  // Validation / input
  VALIDATION_FAILED: 'Please check the highlighted fields and try again.',
  INVALID_JSON: "We couldn't read that request. Please refresh the page and try again.",
  INVALID_INPUT: 'Some of the information entered is not valid. Please review and try again.',

  // Auth / permission
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: "You don't have permission to do that.",
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',

  // Rate limiting
  RATE_LIMITED: "You're doing that a little too quickly. Please wait a moment and try again.",

  // Payments / Stripe
  PAYMENT_ERROR: 'There was a problem processing your payment. Please try again.',
  PROVIDER_STRIPE: 'There was a problem with the payment system. Please try again in a moment.',

  // Print fulfillment / LumaPrints
  PROVIDER_LUMAPRINTS:
    'The print system (LumaPrints) expected something different. Please contact your developer.',
  LUMAPRINTS_UNAVAILABLE: "That print option isn't available right now. Please try another size or medium.",
  SIZE_OUT_OF_BOUNDS: 'That size is outside the printable range for this piece. Please choose a different size.',

  // Email / Resend
  PROVIDER_EMAIL: "We couldn't send that email right now. Please try again shortly.",

  // Uploads / storage
  UPLOAD_FAILED: "That file couldn't be uploaded. Please check the file and try again.",
  FILE_TOO_LARGE: 'That file is too large. Please choose a smaller file.',
  UNSUPPORTED_FILE: "That file type isn't supported here.",

  // Configuration (missing keys / setup) — owner/dev facing
  CONFIG_MISSING: "This feature isn't fully set up yet. Please contact your developer.",
  SERVICE_UNAVAILABLE: 'This service is temporarily unavailable. Please try again shortly.',
}

/** Return the canonical copy for a known code, or a safe generic fallback. */
export function friendlyMessage(code?: string | null, fallback?: string): string {
  if (code && FRIENDLY_MESSAGES[code]) return FRIENDLY_MESSAGES[code]
  return fallback || FRIENDLY_MESSAGES.INTERNAL
}

// Signals that a string is raw developer/database output rather than a message
// meant for a person. If any match, we never show the string itself.
const DEV_SPEAK = [
  /duplicate key value/i,
  /violates (foreign key|unique|not-null|check|row-level)/i,
  /permission denied/i,
  /relation ".*" does not exist/i,
  /column .* does not exist/i,
  /null value in column/i,
  /invalid input syntax/i,
  /syntax error/i,
  /\bPGRST\d*/i,
  /\bpg[a-z_]*error/i,
  /supabaseKey is required/i,
  /JWT|jwt (expired|malformed)/,
  /fetch failed|Failed to fetch|ECONN|ENOTFOUND|ETIMEDOUT/i,
  /\bundefined is not\b|\bcannot read propert/i,
  /\bat\s+\w+.*\(.*:\d+:\d+\)/, // a stack frame
  /TypeError|ReferenceError|SyntaxError/,
  /\{".*":.*\}/, // looks like a JSON blob
]

function looksLikeDevSpeak(message: string): boolean {
  return DEV_SPEAK.some((re) => re.test(message))
}

/**
 * Best-effort friendly message for anything an error path can hand us. Prefers
 * a known code; otherwise passes through an already-human message, but replaces
 * anything that looks like raw developer/database text with friendly copy.
 * Guarantees a non-empty, human string and never returns dev-speak.
 */
export function resolveErrorMessage(input: unknown): string {
  const obj = input && typeof input === 'object' ? (input as Record<string, unknown>) : null

  const code = typeof obj?.code === 'string' ? (obj.code as string) : undefined
  if (code && FRIENDLY_MESSAGES[code]) return FRIENDLY_MESSAGES[code]

  const rawMsg =
    typeof input === 'string'
      ? input
      : typeof obj?.message === 'string'
        ? (obj.message as string)
        : typeof obj?.error === 'string'
          ? (obj.error as string)
          : input instanceof Error
            ? input.message
            : undefined

  if (!rawMsg || !rawMsg.trim()) return friendlyMessage(code)
  const msg = rawMsg.trim()
  if (looksLikeDevSpeak(msg)) return FRIENDLY_MESSAGES.DATABASE_ERROR
  // An overly long "message" is almost always a dump, not a sentence.
  if (msg.length > 180) return friendlyMessage(code, FRIENDLY_MESSAGES.INTERNAL)
  return msg
}
