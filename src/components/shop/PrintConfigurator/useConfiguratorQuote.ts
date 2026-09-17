'use client'

// Authored by DotWin
// The one place the configurator learns what a configuration costs.
//
// Money is never computed here. The hook sends the selection to the print-quote route
// and holds what came back; a price on screen is always a price the server just said,
// for the exact state that produced it. The moment any control changes, the previous
// answer stops being the current one (the request key changes, the state returns to
// `quoting`), so "Add to Cart" can never carry a price from a configuration the
// shopper has already moved away from.
//
// The rest of the behaviour is what a picker on a public endpoint needs: a 250 ms
// debounce so a swatch row is not a request per keystroke, an AbortController per
// request so a slow answer cannot overwrite a fast newer one, one retry after two
// seconds when the limiter says so, and a distinct state for the door closing under
// the page (the store turned the configurator off mid-session).

import { useEffect, useState } from 'react'
import type { PrintQuoteRequest, PrintQuoteResponse } from '@/lib/pricing/quote-types'
import type { ConstraintViolation } from '@/lib/pricing/quote-types'

export type QuoteErrorCode = 'rate_limited' | 'provider_busy' | 'invalid_request' | 'not_found'

/** A label as a shopper may see it; the public route strips the per-option money. */
export interface QuoteLabel {
  group_key: string
  group_label: string
  option_id: number
  option_label: string
}

export type QuoteState =
  | { status: 'idle' }
  | { status: 'quoting' }
  | {
      status: 'quoted'
      priceCents: number
      stale: boolean
      outerWidthIn: number
      outerHeightIn: number
      lineHash: string
      labels: QuoteLabel[]
      /** The exact request this price answers. Never read from anywhere else. */
      request: PrintQuoteRequest
    }
  | { status: 'unavailable'; violations: ConstraintViolation[] }
  | { status: 'error'; code: QuoteErrorCode }

export const QUOTE_DEBOUNCE_MS = 250
export const QUOTE_RETRY_MS = 2_000

export const QUOTE_ERROR_COPY: Record<QuoteErrorCode, string> = {
  rate_limited: 'Prices are updating. One moment.',
  provider_busy: 'Our print partner is busy. Please try again in a minute.',
  invalid_request: 'We could not price that combination. Please choose again.',
  not_found: 'This print is not available.',
}

export const STALE_NOTE = 'price last checked earlier today'

interface Outcome {
  ok: boolean
  code?: QuoteErrorCode
  body?: Extract<PrintQuoteResponse, { ok: true }>
}

/**
 * Read one answer off the wire. The limiter answers with the shared API error body
 * rather than this route's contract, so the status decides first and the body only
 * refines it: a 429 is a 429 whatever it carries.
 */
function readOutcome(status: number, payload: unknown): Outcome {
  if (status === 429) return { ok: false, code: 'rate_limited' }
  const body = payload as PrintQuoteResponse | null
  if (body && typeof body === 'object' && 'ok' in body) {
    if (body.ok === true) return { ok: true, body }
    if (body.ok === false && typeof body.code === 'string') return { ok: false, code: body.code }
  }
  if (status === 404) return { ok: false, code: 'not_found' }
  if (status === 400) return { ok: false, code: 'invalid_request' }
  return { ok: false, code: 'provider_busy' }
}

/**
 * Quote `request` for `productId`, or hold at idle while `request` is null (the
 * configuration is incomplete: a wrap colour with no hex yet, no size chosen).
 */
export function useConfiguratorQuote(
  productId: string,
  request: PrintQuoteRequest | null,
): { state: QuoteState } {
  // The answer is stored WITH the request it answers, and the state is derived from
  // the two. That is what makes a price un-offerable the instant a control changes:
  // the key stops matching, so the hook reads `quoting` again without an effect having
  // to reset anything, and "Add to Cart" goes back to disabled in the same render.
  const [answer, setAnswer] = useState<{ key: string; state: QuoteState } | null>(null)
  const body = request === null ? null : JSON.stringify(request)
  const state: QuoteState =
    body === null ? { status: 'idle' } : answer?.key === body ? answer.state : { status: 'quoting' }

  useEffect(() => {
    if (body === null) return
    let cancelled = false
    const timers: Array<ReturnType<typeof setTimeout>> = []
    let controller: AbortController | null = null
    const settle = (next: QuoteState) => {
      if (!cancelled) setAnswer({ key: body, state: next })
    }

    async function run(retryUsed: boolean) {
      controller?.abort()
      const own = new AbortController()
      controller = own
      let status = 0
      let payload: unknown = null
      try {
        const response = await fetch(`/api/products/${productId}/print-quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body as string,
          signal: own.signal,
        })
        status = response.status
        payload = await response.json().catch(() => null)
      } catch {
        if (cancelled || own.signal.aborted) return
        settle({ status: 'error', code: 'provider_busy' })
        return
      }
      if (cancelled || own.signal.aborted) return

      const outcome = readOutcome(status, payload)
      if (outcome.ok && outcome.body) {
        const priced = outcome.body
        if (!priced.available) {
          settle({ status: 'unavailable', violations: priced.violations ?? [] })
          return
        }
        settle({
          status: 'quoted',
          priceCents: priced.priceCents,
          stale: priced.stale === true,
          outerWidthIn: priced.outerWidthIn,
          outerHeightIn: priced.outerHeightIn,
          lineHash: priced.lineHash,
          labels: (priced.labels ?? []).map((label) => ({
            group_key: label.group_key,
            group_label: label.group_label,
            option_id: label.option_id,
            option_label: label.option_label,
          })),
          request: JSON.parse(body as string) as PrintQuoteRequest,
        })
        return
      }
      // One retry, and only for the limiter: a busy provider or a closed door is not
      // something a second immediate request improves.
      if (outcome.code === 'rate_limited' && !retryUsed) {
        settle({ status: 'error', code: 'rate_limited' })
        timers.push(
          setTimeout(() => {
            if (cancelled) return
            setAnswer(null)
            void run(true)
          }, QUOTE_RETRY_MS),
        )
        return
      }
      settle({ status: 'error', code: outcome.code ?? 'provider_busy' })
    }

    timers.push(
      setTimeout(() => {
        if (!cancelled) void run(false)
      }, QUOTE_DEBOUNCE_MS),
    )

    return () => {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
      controller?.abort()
    }
  }, [body, productId])

  return { state }
}
