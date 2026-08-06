// Authored by DotWin
//
// The fixed-window rollover rule shared by the Postgres rate_limit_hit()
// function and the in-memory fallback. These cases pin the semantics the
// migration's SQL implements: N requests allowed per window, over-limit hits
// counted but never extending the window, and a clean rollover once the window
// has passed.

import { describe, expect, it } from 'vitest'
import { nextWindowState, type WindowState } from '@/lib/api/rate-limit'

const LIMIT = 3
const WINDOW = 60_000

describe('nextWindowState', () => {
  it('opens a window on the first hit', () => {
    const d = nextWindowState(null, 1_000, LIMIT, WINDOW)
    expect(d.ok).toBe(true)
    expect(d.state.count).toBe(1)
    expect(d.remaining).toBe(LIMIT - 1)
    expect(d.resetAt).toBe(1_000 + WINDOW)
  })

  it('treats undefined the same as an absent bucket', () => {
    const d = nextWindowState(undefined, 500, LIMIT, WINDOW)
    expect(d.ok).toBe(true)
    expect(d.state.count).toBe(1)
  })

  it('allows exactly `limit` hits inside one window', () => {
    let state: WindowState | null = null
    const decisions = []
    for (let i = 0; i < LIMIT; i++) {
      const d = nextWindowState(state, 1_000 + i, LIMIT, WINDOW)
      state = d.state
      decisions.push(d)
    }
    expect(decisions.map((d) => d.ok)).toEqual([true, true, true])
    expect(decisions.map((d) => d.remaining)).toEqual([2, 1, 0])
    // Every hit stays inside the window opened by the first one.
    expect(new Set(decisions.map((d) => d.resetAt))).toEqual(new Set([1_000 + WINDOW]))
  })

  it('rejects the hit after the limit and reports no remaining', () => {
    const state: WindowState = { count: LIMIT, resetAt: 61_000 }
    const d = nextWindowState(state, 5_000, LIMIT, WINDOW)
    expect(d.ok).toBe(false)
    expect(d.remaining).toBe(0)
    expect(d.state.count).toBe(LIMIT + 1)
  })

  it('counts over-limit hits without extending the window', () => {
    const state: WindowState = { count: 9, resetAt: 61_000 }
    const d = nextWindowState(state, 60_999, LIMIT, WINDOW)
    expect(d.ok).toBe(false)
    expect(d.state.count).toBe(10)
    expect(d.state.resetAt).toBe(61_000)
  })

  it('rolls over once the window has elapsed', () => {
    const exhausted: WindowState = { count: 99, resetAt: 61_000 }
    const d = nextWindowState(exhausted, 61_000, LIMIT, WINDOW)
    expect(d.ok).toBe(true)
    expect(d.state.count).toBe(1)
    expect(d.remaining).toBe(LIMIT - 1)
    expect(d.state.resetAt).toBe(61_000 + WINDOW)
  })

  it('rolls over on the exact expiry boundary, not one tick later', () => {
    const state: WindowState = { count: LIMIT, resetAt: 10_000 }
    expect(nextWindowState(state, 9_999, LIMIT, WINDOW).ok).toBe(false)
    expect(nextWindowState(state, 10_000, LIMIT, WINDOW).ok).toBe(true)
  })

  it('honors a limit of one', () => {
    const first = nextWindowState(null, 0, 1, WINDOW)
    expect(first.ok).toBe(true)
    expect(first.remaining).toBe(0)
    expect(nextWindowState(first.state, 1, 1, WINDOW).ok).toBe(false)
  })
})
