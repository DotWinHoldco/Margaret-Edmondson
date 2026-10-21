import { describe, expect, it } from 'vitest'
import { artworkYear, orderGallery } from '@/lib/gallery/order'
describe('artist-supplied gallery chronology', () => {
  it('sorts recent work first without inventing years for undated artwork', () => {
    const pieces = [{ title: 'Earlier', tags: ['2020'] }, { title: 'Undated', tags: [] }, { title: 'Recent', tags: ['2026'] }]
    expect(orderGallery(pieces).map((p) => p.title)).toEqual(['Recent', 'Earlier', 'Undated'])
    expect(pieces[0].title).toBe('Earlier')
    expect(artworkYear(['oil', '20x26'])).toBeNull()
  })
})
