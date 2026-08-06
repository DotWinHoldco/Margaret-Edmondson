'use client'

// Last-touch funnel attribution, client side. A funnel landing page remembers
// its funnel id for up to a day; checkout sends it with the order request and
// the server re-verifies it against a real published funnel before storing it
// on the immutable checkout snapshot. Purchases are counted ONLY by the Stripe
// webhook from that snapshot, so nothing here can inflate the counter: the
// worst a tampered value can do is fail server verification and drop to null.

const STORAGE_KEY = 'abm_funnel_attrib'
const ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Remember the funnel that referred this visitor (last touch wins). */
export function rememberFunnelAttribution(funnelId: string): void {
  if (!UUID_RE.test(funnelId)) return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: funnelId, ts: Date.now() }))
  } catch {
    // Storage unavailable (private mode): attribution is best-effort.
  }
}

/** The funnel id to attach to checkout, or null when none is live. */
export function readFunnelAttribution(): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: unknown; ts?: unknown }
    if (
      typeof parsed.id !== 'string' ||
      !UUID_RE.test(parsed.id) ||
      typeof parsed.ts !== 'number' ||
      Date.now() - parsed.ts > ATTRIBUTION_WINDOW_MS
    ) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed.id
  } catch {
    return null
  }
}

/** Drop the attribution after a completed purchase. */
export function clearFunnelAttribution(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}
