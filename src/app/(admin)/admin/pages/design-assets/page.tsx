import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import DesignAssetsView, { type DesignFunnel } from './DesignAssetsView'

export const metadata: Metadata = { title: 'Design Assets | ArtByME' }

export default async function DesignAssetsPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('artwork_funnels')
    .select('id, slug, template, is_published, views_count, add_to_cart_count, purchase_count, products(title)')
    .order('created_at', { ascending: false })

  const funnels: DesignFunnel[] = (data || []).map((funnel) => ({
    id: funnel.id,
    slug: funnel.slug,
    template: funnel.template,
    isPublished: funnel.is_published ?? false,
    views: funnel.views_count ?? 0,
    carts: funnel.add_to_cart_count ?? 0,
    purchases: funnel.purchase_count ?? 0,
    title: ((funnel.products as unknown as { title: string } | null)?.title) || 'Untitled artwork',
  }))

  return <DesignAssetsView funnels={funnels} loadError={!!error} />
}
