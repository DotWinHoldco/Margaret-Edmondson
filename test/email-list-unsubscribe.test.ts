import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'

// COM-1 regression: renderAndSend must emit RFC 8058 one-click unsubscribe
// headers on marketing sends, and skip them on transactional (hideUnsubscribe)
// sends. COM-2: a suppressed contact is never sent.
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ id: 'mock' })) }))
vi.mock('@/lib/email/suppression', () => ({ isSuppressed: vi.fn(async () => false) }))

import { renderAndSend } from '@/lib/email/render'
import { sendEmail } from '@/lib/email/send'
import { isSuppressed } from '@/lib/email/suppression'

const sendMock = sendEmail as unknown as Mock
const suppressMock = isSuppressed as unknown as Mock

interface SentArgs {
  to: string
  subject: string
  html: string
  headers?: Record<string, string>
}

beforeEach(() => {
  sendMock.mockClear()
  suppressMock.mockReset()
  suppressMock.mockResolvedValue(false)
  process.env.UNSUBSCRIBE_SECRET = 'test-secret'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://artbyme.studio'
})

describe('renderAndSend List-Unsubscribe (COM-1)', () => {
  it('sets List-Unsubscribe + List-Unsubscribe-Post on a marketing send', async () => {
    await renderAndSend({
      to: 'buyer@example.com',
      subject: 'Hello',
      body: '<p>Hi</p>',
      contactId: 'contact-123',
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    const args = sendMock.mock.calls[0][0] as SentArgs
    expect(args.headers?.['List-Unsubscribe']).toMatch(
      /^<https:\/\/artbyme\.studio\/api\/unsubscribe\?token=.+>$/,
    )
    expect(args.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })

  it('does NOT set unsubscribe headers on a transactional (hideUnsubscribe) send', async () => {
    await renderAndSend({
      to: 'buyer@example.com',
      subject: 'Receipt',
      body: '<p>Thanks</p>',
      contactId: 'contact-123',
      hideUnsubscribe: true,
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    const args = sendMock.mock.calls[0][0] as SentArgs
    expect(args.headers?.['List-Unsubscribe']).toBeUndefined()
    expect(args.headers?.['List-Unsubscribe-Post']).toBeUndefined()
  })

  it('does not send to a suppressed contact (COM-2)', async () => {
    suppressMock.mockResolvedValueOnce(true)
    const result = await renderAndSend({
      to: 'gone@example.com',
      subject: 'Campaign',
      body: '<p>Buy</p>',
      contactId: 'contact-999',
    })

    expect(result).toEqual({ suppressed: true })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
