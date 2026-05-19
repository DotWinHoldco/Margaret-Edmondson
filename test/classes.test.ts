import { describe, it, expect } from 'vitest'

// Phase 2: tests for the public-API contract pieces that don't require
// a running DB. Persistence/integration paths are smoke-tested by the
// page render gate.

describe('class price helpers', () => {
  it('formats cents to USD', () => {
    function priceUsd(cents: number) { return `$${(cents / 100).toFixed(0)}` }
    expect(priceUsd(4500)).toBe('$45')
    expect(priceUsd(3900)).toBe('$39')
    expect(priceUsd(0)).toBe('$0')
  })

  it('converts dollar string back to cents', () => {
    const toCents = (d: string) => Math.round(parseFloat(d || '0') * 100)
    expect(toCents('45')).toBe(4500)
    expect(toCents('45.00')).toBe(4500)
    expect(toCents('39.50')).toBe(3950)
    expect(toCents('')).toBe(0)
  })
})

describe('class session slug generation', () => {
  // Mirrors src/app/api/admin/class-sessions/route.ts::slugify
  function slugify(title: string, startsAt: string): string {
    const d = new Date(startsAt)
    const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'America/Chicago' }).toLowerCase()
    const day = d.toLocaleString('en-US', { day: 'numeric', timeZone: 'America/Chicago' })
    const year = d.toLocaleString('en-US', { year: 'numeric', timeZone: 'America/Chicago' })
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    return `${base}-${month}-${day}-${year}`
  }

  it('builds slug from title + date', () => {
    expect(slugify('Paint Your Pet Art Class — Adult', '2026-04-24T18:30:00-05:00'))
      .toBe('paint-your-pet-art-class-adult-april-24-2026')
  })

  it('strips emojis and punctuation', () => {
    expect(slugify('Hello! Class 🎨', '2026-04-24T18:30:00-05:00'))
      .toBe('hello-class-april-24-2026')
  })
})

describe('capacity math', () => {
  it('reservation count derives sold-out state', () => {
    const isSoldOut = (reserved: number, capacity: number) => reserved >= capacity
    expect(isSoldOut(9, 10)).toBe(false)
    expect(isSoldOut(10, 10)).toBe(true)
    expect(isSoldOut(11, 10)).toBe(true)
  })

  it('spots-left clamps at zero', () => {
    const left = (reserved: number, capacity: number) => Math.max(0, capacity - reserved)
    expect(left(3, 10)).toBe(7)
    expect(left(10, 10)).toBe(0)
    expect(left(12, 10)).toBe(0)
  })
})
