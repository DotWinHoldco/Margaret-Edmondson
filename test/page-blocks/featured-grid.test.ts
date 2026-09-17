// Authored by DotWin
// Featured tiles link where the product lives NOW, not where it lived when the block was
// saved; a tile whose product is gone is not shown.

import { describe, expect, it } from 'vitest'
import { mergeFeaturedTiles } from '@/lib/page-blocks/featured-grid'

const THINK = '4318f2e0-5e62-47f4-919d-1111e2d39fda'
const UNEXPECTED = '8b29a146-4d34-4b1a-8837-bd044e6216c1'
const GONE = '00000000-0000-4000-8000-000000000009'

const saved = [
  { id: THINK, title: 'Think Again', slug: 'think-again', image_url: '/a.jpg', width: 800, height: 600 },
  { id: UNEXPECTED, title: 'Unexpected', slug: 'unexpected', image_url: '/b.jpg' },
  { id: GONE, title: 'Archived', slug: 'archived', image_url: '/c.jpg' },
  { id: 'placeholder', title: 'Coming soon', slug: 'shop', image_url: '/d.jpg' },
]

const live = new Map([
  [THINK, { slug: 'think-again-paintin-the-ass', title: "Think Again (Paintin' the Ass)", priceLabel: '$1750.00' }],
  [UNEXPECTED, { slug: 'unexpected', title: 'Unexpected', priceLabel: 'From $39.00' }],
])

describe('mergeFeaturedTiles', () => {
  it('takes slug and title from the live row, keeps the saved image, drops a dead tile, keeps a placeholder', () => {
    const tiles = mergeFeaturedTiles(saved, live)
    expect(tiles.map((t) => t.id)).toEqual([THINK, UNEXPECTED, 'placeholder'])
    expect(tiles[0]).toMatchObject({
      slug: 'think-again-paintin-the-ass',
      title: "Think Again (Paintin' the Ass)",
      image_url: '/a.jpg',
      width: 800,
      display_price_label: '$1750.00',
    })
    expect(tiles[1]).toMatchObject({ slug: 'unexpected', display_price_label: 'From $39.00' })
    expect(tiles[2]).toMatchObject({ slug: 'shop', display_price_label: 'View options' })
  })

  it('tolerates a block with no tiles or malformed tiles', () => {
    expect(mergeFeaturedTiles(undefined, live)).toEqual([])
    expect(mergeFeaturedTiles('nope', live)).toEqual([])
    expect(mergeFeaturedTiles([null, 4, { id: THINK }], live)).toHaveLength(1)
  })
})
