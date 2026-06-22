import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSuppressed } from '@/lib/email/suppression'

// COM-2 regression: a contact with status 'unsubscribed' is suppressed on every
// marketing/automated path; an unknown contact or a lookup error is not.

type LookupResult = { data: { status: string } | null; error: { message: string } | null }

// Minimal fake of the chain isSuppressed uses:
//   db.from('crm_contacts').select('status').eq(col, val).maybeSingle()
function fakeClient(result: LookupResult, onQuery?: (col: string, val: unknown) => void) {
  const builder = {
    eq(col: string, val: unknown) {
      onQuery?.(col, val)
      return builder
    },
    maybeSingle: async () => result,
  }
  return {
    from() {
      return { select: () => builder }
    },
  } as unknown as SupabaseClient
}

describe('isSuppressed (COM-2)', () => {
  it('suppresses an unsubscribed contact (by contactId)', async () => {
    let usedCol = ''
    const db = fakeClient({ data: { status: 'unsubscribed' }, error: null }, (c) => (usedCol = c))
    expect(await isSuppressed({ contactId: 'c-1' }, db)).toBe(true)
    expect(usedCol).toBe('id')
  })

  it('suppresses an unsubscribed contact (by email when no contactId)', async () => {
    let usedCol = ''
    const db = fakeClient({ data: { status: 'unsubscribed' }, error: null }, (c) => (usedCol = c))
    expect(await isSuppressed({ email: 'a@b.com' }, db)).toBe(true)
    expect(usedCol).toBe('email')
  })

  it('does not suppress an active/subscribed contact', async () => {
    const db = fakeClient({ data: { status: 'subscribed' }, error: null })
    expect(await isSuppressed({ contactId: 'c-1' }, db)).toBe(false)
  })

  it('does not suppress an unknown contact (no row)', async () => {
    const db = fakeClient({ data: null, error: null })
    expect(await isSuppressed({ email: 'new@b.com' }, db)).toBe(false)
  })

  it('fails OPEN (does not suppress) on a lookup error', async () => {
    const db = fakeClient({ data: null, error: { message: 'db down' } })
    expect(await isSuppressed({ contactId: 'c-1' }, db)).toBe(false)
  })

  it('returns false without querying when neither email nor contactId is given', async () => {
    let queried = false
    const db = fakeClient({ data: { status: 'unsubscribed' }, error: null }, () => (queried = true))
    expect(await isSuppressed({}, db)).toBe(false)
    expect(queried).toBe(false)
  })
})
