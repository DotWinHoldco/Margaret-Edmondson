import { getProductBySlug, getProducts } from '@/lib/supabase/queries'
import { notFound } from 'next/navigation'
import ProductDetail from '@/components/shop/ProductDetail'
import { createServiceClient } from '@/lib/supabase/server'
import { isConfiguratorOpen } from '@/lib/catalog/door'
import { getPublicCatalog } from '@/lib/catalog/load'
import { storefrontCatalogFor, type ConfiguratorProp } from '@/lib/catalog/storefront'
import type { Metadata } from 'next'

export async function generateMetadata(
  props: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await props.params
  const product = await getProductBySlug(slug)
  if (!product) return { title: 'Product Not Found' }

  return {
    title: product.seo_title || product.title,
    description: product.seo_description || `${product.title} — ${product.medium || 'Fine Art'} by Margaret Edmondson`,
  }
}

/**
 * The configurator door for this page (ADR-8).
 *
 * Both reads are server-side on purpose: the flag lives in `site_settings`, which has
 * no anonymous read policy, and the catalog tree carries operator rows that never
 * belong in a browser. What crosses to the client is the allow-listed subset for the
 * mediums this artwork is actually sold in.
 *
 * A failure here is a CLOSED door, never a 500. The legacy size picker is a complete
 * purchase path, so a database the page could not read costs the store a feature flag,
 * not a product page.
 */
async function readConfiguratorDoor(mediums: string[]): Promise<ConfiguratorProp> {
  if (mediums.length === 0) return { open: false }
  try {
    const service = await createServiceClient()
    if (!(await isConfiguratorOpen(service))) return { open: false }
    const tree = await getPublicCatalog()
    return { open: true, catalog: storefrontCatalogFor(tree, mediums) }
  } catch (err) {
    console.error('configurator door read failed', err)
    return { open: false }
  }
}

export default async function ProductPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params
  const product = await getProductBySlug(slug)

  if (!product) notFound()

  const { products: related } = await getProducts({ limit: 4 })
  const relatedProducts = related.filter((p) => p.id !== product.id).slice(0, 4)

  const variantRows = (product.product_variants ?? []) as Array<{ medium?: string | null }>
  const mediums = [...new Set(variantRows.map((row) => row.medium).filter((m): m is string => !!m))]
  const configurator = await readConfiguratorDoor(mediums)

  return <ProductDetail product={product} relatedProducts={relatedProducts} configurator={configurator} />
}
