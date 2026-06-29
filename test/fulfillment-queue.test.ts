import { describe, it, expect } from 'vitest'
import { decideJobOutcome, backoffMs } from '@/lib/fulfillment/queue'

// P2-2: the worker's retry/stop decision is pure, so its policy is pinned here
// without a database. Buckets: retryable = pending|failed, stranded = submitting,
// validation = failed_validation (not auto-retried), terminal = submitted/in-flight.
describe('decideJobOutcome', () => {
  const max = 6

  it('all items submitted → done', () => {
    expect(decideJobOutcome({ threw: false, itemStatuses: ['submitted', 'submitted'], attempts: 1, maxAttempts: max })).toBe('done')
  })

  it('in-flight terminal states (in_production/shipped) → done', () => {
    expect(decideJobOutcome({ threw: false, itemStatuses: ['in_production', 'shipped'], attempts: 2, maxAttempts: max })).toBe('done')
  })

  it('a validation-only failure does not keep the job alive → done (awaits manual refire)', () => {
    expect(decideJobOutcome({ threw: false, itemStatuses: ['failed_validation'], attempts: 1, maxAttempts: max })).toBe('done')
  })

  it('a retryable failed item reschedules while attempts remain → queued', () => {
    expect(decideJobOutcome({ threw: false, itemStatuses: ['failed'], attempts: 1, maxAttempts: max })).toBe('queued')
  })

  it('a still-pending item reschedules → queued', () => {
    expect(decideJobOutcome({ threw: false, itemStatuses: ['pending'], attempts: 3, maxAttempts: max })).toBe('queued')
  })

  it('a thrown pass reschedules while attempts remain → queued', () => {
    expect(decideJobOutcome({ threw: true, itemStatuses: ['submitted'], attempts: 1, maxAttempts: max })).toBe('queued')
  })

  it('retryable but attempts exhausted → failed', () => {
    expect(decideJobOutcome({ threw: false, itemStatuses: ['failed'], attempts: 6, maxAttempts: max })).toBe('failed')
  })

  it('a thrown pass at the attempt ceiling → failed', () => {
    expect(decideJobOutcome({ threw: true, itemStatuses: ['submitted'], attempts: 6, maxAttempts: max })).toBe('failed')
  })

  it('a stranded submitting item (no retryable) → needs_attention (do not auto-resubmit)', () => {
    expect(decideJobOutcome({ threw: false, itemStatuses: ['submitted', 'submitting'], attempts: 2, maxAttempts: max })).toBe('needs_attention')
  })

  it('retryable beats stranded — a failed item next to a submitting one still retries', () => {
    expect(decideJobOutcome({ threw: false, itemStatuses: ['failed', 'submitting'], attempts: 2, maxAttempts: max })).toBe('queued')
  })
})

// Exponential backoff with a 60-minute ceiling; attempts is the post-increment count.
describe('backoffMs', () => {
  it('first retry waits ~2 minutes', () => {
    expect(backoffMs(1)).toBe(2 * 60_000)
  })
  it('grows exponentially', () => {
    expect(backoffMs(2)).toBe(4 * 60_000)
    expect(backoffMs(3)).toBe(8 * 60_000)
    expect(backoffMs(5)).toBe(32 * 60_000)
  })
  it('caps at 60 minutes', () => {
    expect(backoffMs(6)).toBe(60 * 60_000)
    expect(backoffMs(20)).toBe(60 * 60_000)
  })
})
