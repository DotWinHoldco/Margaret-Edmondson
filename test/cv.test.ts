import { describe, it, expect } from 'vitest'
import { parseSortYear, compareEntries, type CvEntry } from '@/lib/cv'

function makeEntry(overrides: Partial<CvEntry>): CvEntry {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    section: 'exhibitions',
    year: '2025',
    sort_year_numeric: 2025,
    title: 'Untitled',
    venue: null,
    institution: null,
    location: null,
    juror: null,
    award: null,
    notes: null,
    linked_artwork_slug: null,
    display_order: 0,
    is_published: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('parseSortYear', () => {
  it('parses a plain four-digit year', () => {
    expect(parseSortYear('2025')).toBe(2025)
  })

  it('parses the starting year of a range', () => {
    expect(parseSortYear('2020–2021')).toBe(2020)
    expect(parseSortYear('2020-2021')).toBe(2020)
  })

  it('parses years with words around them', () => {
    expect(parseSortYear('2025–present')).toBe(2025)
    expect(parseSortYear('ca. 1998')).toBe(1998)
  })

  it('returns 0 when no four-digit year is present', () => {
    expect(parseSortYear('TBD')).toBe(0)
    expect(parseSortYear('')).toBe(0)
    expect(parseSortYear('thirty')).toBe(0)
  })

  it('ignores three-digit numbers', () => {
    expect(parseSortYear('Studio 312')).toBe(0)
  })

  it('takes only the first match when multiple years appear', () => {
    expect(parseSortYear('2023, then 2024')).toBe(2023)
  })
})

describe('compareEntries', () => {
  it('sorts by descending year', () => {
    const a = makeEntry({ sort_year_numeric: 2020 })
    const b = makeEntry({ sort_year_numeric: 2025 })
    expect(compareEntries(a, b)).toBeGreaterThan(0)
    expect(compareEntries(b, a)).toBeLessThan(0)
  })

  it('breaks ties with ascending display_order', () => {
    const a = makeEntry({ sort_year_numeric: 2025, display_order: 1, title: 'A' })
    const b = makeEntry({ sort_year_numeric: 2025, display_order: 0, title: 'Z' })
    expect(compareEntries(a, b)).toBeGreaterThan(0)
  })

  it('breaks final ties with title ascending', () => {
    const a = makeEntry({ sort_year_numeric: 2025, display_order: 0, title: 'Zebras' })
    const b = makeEntry({ sort_year_numeric: 2025, display_order: 0, title: 'Apples' })
    expect(compareEntries(a, b)).toBeGreaterThan(0)
  })

  it('groups a real list of exhibitions correctly', () => {
    const list: CvEntry[] = [
      makeEntry({ id: '1', sort_year_numeric: 2022, display_order: 2, title: 'Augusta Plein Air Art Festival' }),
      makeEntry({ id: '2', sort_year_numeric: 2025, display_order: 0, title: 'SWA Membership Exhibition' }),
      makeEntry({ id: '3', sort_year_numeric: 2025, display_order: 2, title: 'Richardson Civic Art' }),
      makeEntry({ id: '4', sort_year_numeric: 2023, display_order: 0, title: 'Winter Art Show' }),
      makeEntry({ id: '5', sort_year_numeric: 2025, display_order: 1, title: '62nd Annual SWS' }),
    ]
    const sorted = [...list].sort(compareEntries).map((e) => e.id)
    expect(sorted).toEqual(['2', '5', '3', '4', '1'])
  })
})
