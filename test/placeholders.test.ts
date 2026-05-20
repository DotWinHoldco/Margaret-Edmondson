import { describe, it, expect } from 'vitest'
import { substitutePlaceholders } from '@/lib/email/placeholders'

describe('substitutePlaceholders', () => {
  it('substitutes known tokens', () => {
    const out = substitutePlaceholders('Hi {{first_name}}, use {{discount_code}}', {
      first_name: 'Margaret',
      discount_code: 'WELCOME-AB12',
    })
    expect(out).toBe('Hi Margaret, use WELCOME-AB12')
  })

  it('collapses unknown tokens to empty', () => {
    const out = substitutePlaceholders('Hello {{mystery}}!', {})
    expect(out).toBe('Hello !')
  })

  it('first_name_or_friend falls back to friend', () => {
    const out = substitutePlaceholders('{{first_name_or_friend}}', {})
    expect(out).toBe('friend')
  })

  it('respects explicit first_name over default', () => {
    const out = substitutePlaceholders('{{first_name_or_friend}}', { first_name: 'Sam' })
    expect(out).toBe('Sam')
  })

  it('is case-insensitive on token key', () => {
    const out = substitutePlaceholders('{{ FIRST_NAME }}', { first_name: 'Margaret' })
    expect(out).toBe('Margaret')
  })

  it('site_url defaults from env or constant', () => {
    const out = substitutePlaceholders('{{site_url}}', {})
    expect(out).toMatch(/^https?:\/\//)
  })
})
