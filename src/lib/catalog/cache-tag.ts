// Authored by DotWin
// One cache tag for the whole catalog tree. Sync (ADR-7) and every admin toggle
// (ADR-5, F7) call `invalidateCatalogCache()` so the storefront never serves a stale
// tree after a change; the loader reads the tree under this tag.

import { revalidateTag } from 'next/cache'

export const CATALOG_CACHE_TAG = 'lumaprints-catalog'

export function invalidateCatalogCache(): void {
  try {
    revalidateTag(CATALOG_CACHE_TAG, 'max')
  } catch {
    // Outside a Next request scope (scripts, tests) there is nothing to invalidate.
  }
}
