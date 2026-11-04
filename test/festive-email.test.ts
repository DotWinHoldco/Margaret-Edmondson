import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { festiveEmailContent, sendFestiveEmails } from '@/lib/classes/festive/email'

const send = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email/send', () => ({ sendEmail: send }))
vi.mock('@/lib/settings/accessor', () => ({ getOrderNotificationEmail: async () => 'margaret@artbyme.studio' }))
const payload = { name: '<script>Buyer</script>', email: 'buyer@example.com', phone: '555-555-0100', painters: [{ name: 'Parent', painting: 'snowman' as const }, { name: 'Child', painting: 'santa' as const }] }
const sent = new Map<string, string>()
const db = { rpc: vi.fn(async () => ({ data: true, error: null })), from: (table: string) => {
  let kind = ''
  let update: Record<string, unknown> | undefined
  const query = {
    select: () => query,
    eq: (key: string, value: string) => { if (key === 'kind') kind = value; return query },
    is: () => query,
    update: (value: Record<string, unknown>) => { update = value; return query },
    single: async () => ({ data: table === 'festive_registrations' ? { payload, total: 4000, mode: 'live', status: 'paid' } : { sent_at: sent.get(kind) || null }, error: null }),
    then: (resolve: (value: unknown) => unknown) => { if (update?.sent_at) sent.set(kind, String(update.sent_at)); return Promise.resolve(resolve({ error: null })) },
  }
  return query
} } as unknown as SupabaseClient
beforeEach(() => { vi.clearAllMocks(); sent.clear(); send.mockResolvedValue({ id: 'email_fixture' }) })
describe('festive confirmation email', () => {
  it('contains the group choices, price, venue and date with escaped customer input', () => {
    const html = festiveEmailContent(payload, 4000, 'buyer')
    expect(html).toContain('Snowman'); expect(html).toContain('Santa'); expect(html).toContain('$40.00')
    expect(html).toContain('November 21, 2026'); expect(html).toContain('103 Freese Drive, Sanger')
    expect(html).not.toContain('<script>Buyer</script>')
  })
  it('sends buyer and studio once across duplicate webhook deliveries', async () => {
    await sendFestiveEmails(db, 'registration')
    await sendFestiveEmails(db, 'registration')
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'buyer@example.com', idempotencyKey: 'festive:registration:buyer' })
    expect(send.mock.calls[1][0]).toMatchObject({ to: 'margaret@artbyme.studio', idempotencyKey: 'festive:registration:studio' })
  })
  it('retries the failed studio email without resending a delivered buyer confirmation', async () => {
    send.mockResolvedValueOnce({ id: 'buyer_receipt' }).mockResolvedValueOnce(null)
    await expect(sendFestiveEmails(db, 'registration')).rejects.toThrow()
    await sendFestiveEmails(db, 'registration')
    expect(send).toHaveBeenCalledTimes(3)
    expect(send.mock.calls[2][0].to).toBe('margaret@artbyme.studio')
  })
})
