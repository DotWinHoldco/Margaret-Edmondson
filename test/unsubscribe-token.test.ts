import { describe, it, expect } from 'vitest'
import { signUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/email/unsubscribe'

describe('unsubscribe token', () => {
  it('round-trips contact id', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const token = signUnsubscribeToken(id)
    const v = verifyUnsubscribeToken(token)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.contactId).toBe(id)
  })

  it('round-trips with list id', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const list = '11111111-2222-3333-4444-555555555555'
    const token = signUnsubscribeToken(id, list)
    const v = verifyUnsubscribeToken(token)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.contactId).toBe(id)
      expect(v.listId).toBe(list)
    }
  })

  it('rejects tampered tokens', () => {
    const token = signUnsubscribeToken('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    const broken = token.slice(0, -2) + 'XX'
    const v = verifyUnsubscribeToken(broken)
    expect(v.ok).toBe(false)
  })

  it('rejects malformed tokens', () => {
    expect(verifyUnsubscribeToken('not-a-token').ok).toBe(false)
    expect(verifyUnsubscribeToken('').ok).toBe(false)
  })
})
