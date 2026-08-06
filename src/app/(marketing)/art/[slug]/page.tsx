import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import GallerySpotlightTemplate from '@/components/funnels/GallerySpotlightTemplate'
import IntimateJournalTemplate from '@/components/funnels/IntimateJournalTemplate'
import BoldShowcaseTemplate from '@/components/funnels/BoldShowcaseTemplate'
import FunnelViewTracker from '@/components/funnels/FunnelViewTracker'
import { loadPublicPrintReadiness, storefrontMaster } from '@/lib/products/print-readiness'

type Props = {
  params: Promise<{ slug: string }>
}

async function getFunnelBySlug(slug: string) {
  const supabase = await createClient()

  const { data: funnel, error } = await supabase
    .from('artwork_funnels')
    .select(`
      *,
      products:product_id (
        id, title, slug, description_html, story_html,
        medium, dimensions, base_price, is_original, prints_enabled, status,
        product_images ( id, url, alt_text, sort_order ),
        product_variants ( id, name, price, variant_type, inventory_count, sort_order, is_active, is_lumaprints_available, medium )
      )
    `)
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (error || !funnel) return null
  const product = funnel.products as { id?: string } | null
  if (!product?.id) return funnel
  const readiness = await loadPublicPrintReadiness(supabase, [product.id])
  if (readiness.error) console.error('Funnel print readiness lookup failed', readiness.error)
  return {
    ...funnel,
    products: {
      ...product,
      master_artwork: storefrontMaster(readiness.data.get(product.id)),
    },
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params
  const funnel = await getFunnelBySlug(slug)

  if (!funnel) {
    return { title: 'Artwork Not Found' }
  }

  const product = funnel.products as Record<string, unknown>
  const productTitle = product?.title as string || 'Artwork'

  return {
    title: funnel.seo_title || `${productTitle} — Original Art by Margaret Edmondson`,
    description: funnel.seo_description || `Discover "${productTitle}" — a one-of-a-kind artwork by Margaret Edmondson. View the story behind this piece and bring it home.`,
    openGraph: {
      title: funnel.seo_title || `${productTitle} — Art by Margaret Edmondson`,
      description: funnel.seo_description || `Discover "${productTitle}" by Margaret Edmondson.`,
      images: funnel.og_image_url ? [{ url: funnel.og_image_url }] : [],
    },
  }
}

export default async function ArtFunnelPage(props: Props) {
  const { slug } = await props.params
  const funnel = await getFunnelBySlug(slug)

  if (!funnel) notFound()

  const product = funnel.products as Record<string, unknown>
  if (!product) notFound()

  // Sort images and variants
  const images = ((product.product_images as Array<Record<string, unknown>>) || [])
    .sort((a, b) => ((a.sort_order as number) || 0) - ((b.sort_order as number) || 0))
  const variants = ((product.product_variants as Array<Record<string, unknown>>) || [])
    .sort((a, b) => ((a.sort_order as number) || 0) - ((b.sort_order as number) || 0))

  // Mirror the storefront ProductDetail print gate: only offer prints when the
  // product's master file is print-ready, otherwise a print order would 406 at
  // LumaPrints. The join returns a row or an array depending on cardinality.
  const masterRaw = product.master_artwork as
    | { print_status: string | null; print_storage_path: string | null }
    | { print_status: string | null; print_storage_path: string | null }[]
    | null
  const master = Array.isArray(masterRaw) ? masterRaw[0] : masterRaw
  const masterReady = master?.print_status === 'ready' && !!master?.print_storage_path

  const templateData = {
    funnel: {
      id: funnel.id as string,
      slug: funnel.slug as string,
      template: funnel.template as string,
      problem_heading: funnel.problem_heading as string | null,
      problem_body: funnel.problem_body as string | null,
      amplify_heading: funnel.amplify_heading as string | null,
      amplify_body: funnel.amplify_body as string | null,
      story_heading: funnel.story_heading as string | null,
      story_body_html: funnel.story_body_html as string | null,
      transformation_heading: funnel.transformation_heading as string | null,
      transformation_body: funnel.transformation_body as string | null,
      offer_heading: funnel.offer_heading as string | null,
      offer_original_description: funnel.offer_original_description as string | null,
      offer_print_description: funnel.offer_print_description as string | null,
      risk_reversal_heading: funnel.risk_reversal_heading as string | null,
      risk_reversal_body: funnel.risk_reversal_body as string | null,
      final_cta_text: funnel.final_cta_text as string | null,
    },
    product: {
      id: product.id as string,
      title: product.title as string,
      slug: product.slug as string,
      description_html: product.description_html as string | null,
      story_html: product.story_html as string | null,
      medium: product.medium as string | null,
      dimensions: product.dimensions as string | null,
      base_price: product.base_price as number,
      is_original: product.is_original as boolean,
      prints_enabled: product.prints_enabled as boolean,
    },
    images: images.map((img) => ({
      id: img.id as string,
      url: img.url as string,
      alt_text: img.alt_text as string | null,
    })),
    variants: variants.map((v) => ({
      id: v.id as string,
      name: v.name as string,
      price: v.price as number,
      variant_type: v.variant_type as string,
      inventory_count: v.inventory_count as number,
      is_active: v.is_active as boolean | undefined,
      is_lumaprints_available: v.is_lumaprints_available as boolean | undefined,
      medium: v.medium as string | null | undefined,
    })),
    masterReady,
  }

  const TemplateComponent =
    funnel.template === 'intimate_journal'
      ? IntimateJournalTemplate
      : funnel.template === 'bold_showcase'
        ? BoldShowcaseTemplate
        : GallerySpotlightTemplate

  return (
    <>
      <FunnelViewTracker funnelId={funnel.id as string} productId={product.id as string} productTitle={product.title as string} basePrice={product.base_price as number} />
      <TemplateComponent {...templateData} />
    </>
  )
}
