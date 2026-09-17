// Authored by DotWin
// Old product URLs keep working. `product_slug_redirects` holds every slug a product has
// been published under (written by a trigger on `products.slug`, backfilled from the audit
// log), so a link in a newsletter, a search result or a saved bookmark resolves to the
// product's CURRENT slug and the page redirects permanently instead of answering 404.

import type { SupabaseClient } from '@supabase/supabase-js'

/** The storefront sells these; anything else is not a page to redirect to. */
const LIVE_STATUSES = ['active', 'sold'] as const
/**
 * The only shape a slug may have on either side of a redirect. A value with a slash, a
 * dot or a query character would build a path that is not the product's page, and the
 * browser caches a 308 for good.
 */
export const PRODUCT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The current slug a retired slug should redirect to, or null when there is nothing to
 * redirect to: no record, the product is no longer live, or the slug IS the current one
 * (in which case the product page simply did not find it, and a redirect would loop).
 */
export async function findProductSlugRedirect(client: SupabaseClient, slug: string): Promise<string | null> {
  const wanted = slug.trim().toLowerCase()
  if (!wanted || !PRODUCT_SLUG_RE.test(wanted)) return null

  const redirect = await client
    .from('product_slug_redirects')
    .select('product_id')
    .eq('old_slug', wanted)
    .maybeSingle()
  const productId = (redirect.data as { product_id?: string } | null)?.product_id
  if (redirect.error || !productId) return null

  const product = await client
    .from('products')
    .select('slug, status')
    .eq('id', productId)
    .in('status', [...LIVE_STATUSES])
    .maybeSingle()
  const current = (product.data as { slug?: string | null } | null)?.slug
  if (product.error || !current || current === wanted || !PRODUCT_SLUG_RE.test(current)) return null
  return current
}
