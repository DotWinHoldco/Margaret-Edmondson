import { describe, it, expect } from 'vitest'

// Phase 0 smoke test: gates need npm test to exit 0. Real tests follow per-phase.
describe('environment', () => {
  it('process is defined', () => {
    expect(typeof process).toBe('object')
  })
})
