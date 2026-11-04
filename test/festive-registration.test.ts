import { describe, expect, it } from 'vitest'
import { registrationPayload, paintingQuantities } from '@/lib/classes/festive/model'

describe('group painting registration', () => {
  const payload = { name: 'Test Buyer', email: 'PAINTER@example.com', phone: '(555) 555-0100', painters: [{ name: 'Parent', painting: 'snowman' }, { name: 'Child', painting: 'santa' }] }
  it('keeps different choices for each painter and normalizes contact email', () => {
    const parsed = registrationPayload.parse(payload)
    expect(parsed.email).toBe('painter@example.com')
    expect(paintingQuantities(parsed.painters)).toEqual([{ painting: 'snowman', quantity: 1 }, { painting: 'santa', quantity: 1 }])
  })
  it('groups equal designs without losing individual painters', () => {
    const parsed = registrationPayload.parse({ ...payload, painters: [...payload.painters, { name: 'Friend', painting: 'snowman' }] })
    expect(parsed.painters).toHaveLength(3)
    expect(paintingQuantities(parsed.painters)).toEqual([{ painting: 'snowman', quantity: 2 }, { painting: 'santa', quantity: 1 }])
  })
  it('requires one valid choice for each painter and rejects injected prices', () => {
    expect(registrationPayload.safeParse({ ...payload, painters: [] }).success).toBe(false)
    expect(registrationPayload.safeParse({ ...payload, painters: [{ name: '', painting: '' }] }).success).toBe(false)
    expect(registrationPayload.safeParse({ ...payload, total: 1 }).success).toBe(false)
    expect(registrationPayload.safeParse({ ...payload, painters: [{ name: '', painting: 'pet' }] }).success).toBe(false)
  })
  it('has no attendance capacity cap', () => {
    expect(registrationPayload.parse({ ...payload, painters: Array.from({ length: 150 }, () => ({ name: '', painting: 'reindeer' })) }).painters).toHaveLength(150)
  })
})
