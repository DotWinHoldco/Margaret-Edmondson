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
// seconds when the limiter says so, a distinct state for the door closing under the
// page (the store turned the configurator off mid-session), and — since 2026-09-17 — a
// retry ladder for a busy provider. The key-wide request budget resets every minute, so
// a 503 is almost always "ask again in a few seconds", and a shopper who sees a red
// error where a price should be does not come back to try. The page now says it is
// checking, retries at 4, 8, 16 and 32 seconds (one full budget window), and only
// then shows the error copy. "Add to Cart" stays disabled throughout.

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
  /** The provider was busy; the hook is waiting to ask again. `attempt` counts retries so far. */
  | { status: 'retrying'; attempt: number }
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
/**
 * Waits before each retry of a busy provider. Four steps summing to sixty seconds: the
 * shared provider budget is a one-minute window, so by the last step it has reset once.
 */
export const PROVIDER_RETRY_MS: readonly number[] = [4_000, 8_000, 16_000, 32_000]

export const QUOTE_ERROR_COPY: Record<QuoteErrorCode, string> = {
  rate_limited: 'Prices are updating. One moment.',
  provider_busy: 'Our print partner is busy. Please try again in a minute.',
  invalid_request: 'We could not price that combination. Please choose again.',
  not_found: 'This print is not available.',
}

export const STALE_NOTE = 'price last checked earlier today'
export const RETRYING_NOTE = 'Our print partner is taking a moment. We’ll keep checking.'

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
    const later = (ms: number, fn: () => void) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn()
        }, ms),
      )
    }

    /**
     * A busy provider: wait the next step of the ladder and ask again, or give up
     * after the last step. The state says "retrying" so the page can show it is still
     * working rather than a red line that the shopper reads as final.
     */
    const retryBusy = (busyRetries: number, limiterRetryUsed: boolean) => {
      const wait = PROVIDER_RETRY_MS[busyRetries]
      if (wait === undefined) {
        settle({ status: 'error', code: 'provider_busy' })
        return
      }
      settle({ status: 'retrying', attempt: busyRetries + 1 })
      later(wait, () => void run(busyRetries + 1, limiterRetryUsed))
    }

    async function run(busyRetries: number, limiterRetryUsed: boolean) {
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
        // The network, not the server: the same ladder, because a flaky connection
        // and a busy provider look identical from here and deserve the same patience.
        retryBusy(busyRetries, limiterRetryUsed)
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
      // The limiter: one quick retry, then the busy ladder if it is still saying no.
      if (outcome.code === 'rate_limited') {
        if (!limiterRetryUsed) {
          settle({ status: 'error', code: 'rate_limited' })
          later(QUOTE_RETRY_MS, () => void run(busyRetries, true))
          return
        }
        retryBusy(busyRetries, true)
        return
      }
      if (outcome.code === 'provider_busy') {
        retryBusy(busyRetries, limiterRetryUsed)
        return
      }
      // A closed door or a bad request is not something waiting improves.
      settle({ status: 'error', code: outcome.code ?? 'provider_busy' })
    }

    later(QUOTE_DEBOUNCE_MS, () => void run(0, false))

    return () => {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
      controller?.abort()
    }
  }, [body, productId])

  return { state }
}
