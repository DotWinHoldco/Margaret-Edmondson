import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { requireCron } from '@/lib/auth/require-cron'

// AZ-1 regression: the shared cron guard must FAIL CLOSED when CRON_SECRET is
// unset (previously `Bearer ${undefined}` authenticated any caller), and must
// reject a wrong/missing token.
function req(authorization?: string): Request {
  return new Request('https://artbyme.studio/api/cron/x', {
    headers: authorization ? { authorization } : {},
  })
}

describe('requireCron (AZ-1)', () => {
  const original = process.env.CRON_SECRET

  beforeEach(() => {
    delete process.env.CRON_SECRET
  })
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it('fails closed (503) when CRON_SECRET is unset — even with "Bearer undefined"', () => {
    const r1 = requireCron(req('Bearer undefined'))
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.response.status).toBe(503)

    const r2 = requireCron(req())
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.response.status).toBe(503)
  })

  it('fails closed (503) when CRON_SECRET is empty', () => {
    process.env.CRON_SECRET = ''
    const r = requireCron(req('Bearer '))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(503)
  })

  it('rejects (401) a missing or wrong bearer token', () => {
    process.env.CRON_SECRET = 'super-secret-value'

    const missing = requireCron(req())
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.response.status).toBe(401)

    const wrong = requireCron(req('Bearer not-the-secret'))
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.response.status).toBe(401)

    // A prefix of the real secret must not pass (length-checked).
    const prefix = requireCron(req('Bearer super-secret'))
    expect(prefix.ok).toBe(false)
  })

  it('accepts the exact bearer token', () => {
    process.env.CRON_SECRET = 'super-secret-value'
    const r = requireCron(req('Bearer super-secret-value'))
    expect(r.ok).toBe(true)
  })
})
