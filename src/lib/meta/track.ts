// Unified event tracker. Fires the client-side Pixel event with a
// shared event_id, then mirrors to the server via /api/pixel/event so
// the server can forward to Meta CAPI with the same id. Meta
// deduplicates within ~24h on (event_name, event_id).

export interface TrackOptions {
  eventName: string
  params?: Record<string, unknown>
  userData?: { email?: string | null }
  eventId?: string
}

export function track(opts: TrackOptions): string {
  const eventId = opts.eventId || randomId()
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      window.fbq('track', opts.eventName, opts.params || {}, { eventID: eventId })
    } catch { /* ignore */ }
  }

  if (typeof window !== 'undefined') {
    // best-effort server mirror — do not block
    fetch('/api/pixel/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: opts.eventName,
        eventId,
        params: opts.params || {},
        userData: opts.userData || {},
        sourceUrl: window.location.href,
      }),
      keepalive: true,
    }).catch(() => { /* ignore */ })
  }

  return eventId
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
