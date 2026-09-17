// Authored by DotWin
// The homepage Featured grid stores a SNAPSHOT of each tile (id, title, slug, image) from
// the day it was saved. Only the id is identity; everything a shopper can click through on
// has to come from the live product row, or a renamed product leaves a dead tile behind
// (2026-09-17: "Think Again" was renamed on 09-14 and the homepage linked the old slug for
// three days). The loader already reads the live rows for the price label; this is the
// one place that decides what else the tile takes from them.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface FeaturedTile {
  id: string
  slug?: string
  title?: string
  display_price_label?: string
  [key: string]: unknown
}

export interface LiveTileFacts {
  slug: string | null
  title: string | null
  priceLabel: string
}

/**
 * Merge the saved tiles with the live products, keyed by id.
 *
 * - A tile whose product is live takes the live `slug` and `title` (the snapshot keeps its
 *   image and layout fields) and the computed price label.
 * - A tile whose product is no longer live (archived, draft, deleted) is DROPPED: a tile
 *   that would 404 is worse than one fewer tile.
 * - A tile with no product id behind it (a hand-written placeholder) is kept as saved.
 */
export function mergeFeaturedTiles(tiles: unknown, live: ReadonlyMap<string, LiveTileFacts>): FeaturedTile[] {
  if (!Array.isArray(tiles)) return []
  const merged: FeaturedTile[] = []
  for (const raw of tiles) {
    if (!raw || typeof raw !== 'object') continue
    const tile = raw as FeaturedTile
    const id = typeof tile.id === 'string' ? tile.id : ''
    if (!UUID_RE.test(id)) {
      merged.push({ ...tile, display_price_label: tile.display_price_label ?? 'View options' })
      continue
    }
    const facts = live.get(id)
    if (!facts) continue
    merged.push({
      ...tile,
      slug: facts.slug ?? tile.slug,
      title: facts.title ?? tile.title,
      display_price_label: facts.priceLabel,
    })
  }
  return merged
}
