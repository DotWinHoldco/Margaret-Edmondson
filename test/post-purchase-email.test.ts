// @vitest-environment node
// Authored by DotWin. Exercise delivery failures and the actual customer-facing letter.
import { readFileSync, readdirSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/settings/accessor', () => ({
  getEmailFromLine: vi.fn(async () => 'ArtByME <studio@example.com>'),
  getBusinessEmail: vi.fn(async () => 'studio@example.com'),
}))
import { sendEmail } from '@/lib/email/send'
import { processPostPurchaseEmails, renderPurchaseThankYou } from '@/lib/email/post-purchase'
import { GET } from '@/app/api/cron/post-purchase/route'

const id = '00000000-0000-4000-8000-000000000001'
const file = readdirSync('supabase/migrations').find(name => name.endsWith('_enable_day_after_purchase_letter.sql'))!
const body = readFileSync(`supabase/migrations/${file}`, 'utf8').split('$letter$')[1]
const context = {
  automationId: id, stepId: id, contactId: id, name: 'Alex <Patron>',
  subject: 'A personal thank-you from Margaret — Art By ME',
  preheader: 'Thank you for supporting my art. Enjoy 10% off your next order.', body,
  code: 'THANKYOU-123456789ABC', percentOff: 10, validFrom: '2026-11-07T16:00:00.000Z',
  expiresAt: '2026-12-07T16:00:00.000Z', orderRef: 'pi_example', payload: null as unknown,
}
const job = { id, claim_token: id, related_order_id: id, email_snapshot: 'buyer@example.com', attempts: 1 }

function fakeClient(options: { prepareError?: boolean; suppressed?: boolean; freezeError?: boolean; completeError?: boolean } = {}) {
  let payload: unknown = null
  const updates: Record<string, unknown>[] = []
  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_post_purchase_email') return { data: [job], error: null }
    if (name === 'prepare_post_purchase_email') return {
      data: options.suppressed ? null : { ...context, payload }, error: options.prepareError ? { message: 'DB unavailable' } : null,
    }
    return { data: !options.completeError, error: options.completeError ? { message: 'write failed' } : null }
  })
  const from = vi.fn(() => ({
    update: (values: Record<string, unknown>) => {
      updates.push(values)
      const result = { data: { id }, error: null }
      const chain = {
        eq: () => chain, is: () => chain, gt: () => chain, select: () => chain,
        maybeSingle: async () => {
          if (options.freezeError) return { data: null, error: { message: 'write failed' } }
          payload = values.payload
          return result
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      }
      return chain
    },
  }))
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, updates }
}

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.mocked(sendEmail).mockReset().mockResolvedValue({ id: 'resend-example' })
})
afterEach(() => vi.unstubAllEnvs())

it('renders the approved letter with a real offer slot, review link, signature, expiry and opt-out', () => {
  const html = renderPurchaseThankYou(context, 'https://www.artbyme.studio/api/unsubscribe?token=example')
  expect(html).toContain('Dear Alex &lt;Patron&gt;,')
  expect(html).toContain('10% off your next order')
  expect(html).toContain('valid for 30 days')
  expect(html).toContain(context.code)
  expect(html).toContain('December 7, 2026')
  expect(html).toContain('Once your artwork arrives')
  expect(html).toContain('https://www.artbyme.studio/reviews#share')
  expect(html).toContain('Margaret Edmondson<br />Artist')
  expect(html).toContain('because you purchased artwork')
  expect(html).toContain('Unsubscribe')
  expect(html).not.toMatch(/\{\{|Optional:|add in|joined the ArtByME Studio List/)
})

it('persists the complete payload before sending and confirms the provider ID', async () => {
  const db = fakeClient()
  vi.mocked(sendEmail).mockImplementation(async () => {
    expect(db.updates[0].payload).toMatchObject({ to: job.email_snapshot, from: 'ArtByME <studio@example.com>' })
    return { id: 'resend-example' }
  })
  expect(await processPostPurchaseEmails(db.client, { limit: 1 })).toEqual({ sent: 1, skipped: 0, retried: 0 })
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `post_purchase:${id}`, timeoutMs: 20_000 }))
  expect(db.rpc).toHaveBeenCalledWith('complete_post_purchase_email', expect.objectContaining({ p_message_id: 'resend-example' }))
})

it('retries with an identical frozen message when the provider times out', async () => {
  const db = fakeClient()
  vi.mocked(sendEmail).mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ id: 'resend-example' })
  expect((await processPostPurchaseEmails(db.client, { limit: 1 })).retried).toBe(1)
  expect((await processPostPurchaseEmails(db.client, { limit: 1 })).sent).toBe(1)
  expect(vi.mocked(sendEmail).mock.calls[0][0]).toEqual(vi.mocked(sendEmail).mock.calls[1][0])
  expect(db.updates.filter(row => row.payload)).toHaveLength(1)
})

for (const failure of ['prepareError', 'freezeError'] as const) {
  it(`fails closed on ${failure} without sending`, async () => {
    const db = fakeClient({ [failure]: true })
    expect((await processPostPurchaseEmails(db.client, { limit: 1 })).retried).toBe(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })
}

it('does not send to a suppressed customer or count absent configuration as delivery', async () => {
  const db = fakeClient({ suppressed: true })
  expect((await processPostPurchaseEmails(db.client, { limit: 1 })).skipped).toBe(1)
  vi.stubEnv('RESEND_API_KEY', '')
  await expect(processPostPurchaseEmails(db.client)).rejects.toThrow('not configured')
  expect(sendEmail).not.toHaveBeenCalled()
})

it('keeps the identical message for a retry if the provider accepted it but recording failed', async () => {
  const db = fakeClient({ completeError: true })
  expect((await processPostPurchaseEmails(db.client, { limit: 1 })).retried).toBe(1)
  expect((await processPostPurchaseEmails(db.client, { limit: 1 })).retried).toBe(1)
  expect(vi.mocked(sendEmail).mock.calls[0][0]).toEqual(vi.mocked(sendEmail).mock.calls[1][0])
})

it('refuses unauthenticated cron requests', async () => {
  vi.stubEnv('CRON_SECRET', 'cron-test-secret')
  expect((await GET(new Request('https://www.artbyme.studio/api/cron/post-purchase'))).status).toBe(401)
  vi.stubEnv('CRON_SECRET', '')
  expect((await GET(new Request('https://www.artbyme.studio/api/cron/post-purchase', { headers: { Authorization: 'Bearer undefined' } }))).status).toBe(503)
  expect(sendEmail).not.toHaveBeenCalled()
})
