// Authored by DotWin
// Only artist-supplied year tags establish chronology; upload dates are not artwork dates.
/** Read an explicitly assigned artwork year without substituting its upload date. */
export function artworkYear(tags: readonly string[] | null | undefined): number | null {
  const years = (tags ?? []).filter((tag) => /^(19|20)\d{2}$/.test(tag.trim())).map(Number)
  return years.length ? Math.max(...years) : null
}

/** Undated pieces follow the dated work, in stable title order until the artist dates them. */
export function orderGallery<T extends { title: string; tags?: string[] | null }>(products: readonly T[]): T[] {
  return [...products].sort((a, b) =>
    (artworkYear(b.tags) ?? 0) - (artworkYear(a.tags) ?? 0) || a.title.localeCompare(b.title),
  )
}
