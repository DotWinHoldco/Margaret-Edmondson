import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'

// Static public routes that always exist.
const STATIC_PATHS = [
  '',
  '/shop',
  '/about',
  '/contact',
  '/blog',
  '/classes',
  '/commissions',
  '/commissions/request',
  '/privacy',
  '/terms',
  '/shipping',
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: now,
    changeFrequency: p === '' ? 'weekly' : 'monthly',
    priority: p === '' ? 1 : 0.7,
  }))

  try {
    // Cookieless anon client (published content is publicly readable) so the
    // sitemap doesn't depend on request cookies.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const [{ data: posts }, { data: products }, { data: funnels }] = await Promise.all([
      supabase.from('blog_posts').select('slug, updated_at').eq('status', 'published'),
      supabase.from('products').select('slug, updated_at').in('status', ['active', 'sold']),
      supabase.from('artwork_funnels').select('slug, updated_at').eq('status', 'published'),
    ])

    for (const post of posts || []) {
      if (!post.slug) continue
      entries.push({
        url: `${SITE_URL}/blog/${post.slug}`,
        lastModified: post.updated_at ? new Date(post.updated_at) : now,
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    }
    for (const product of products || []) {
      if (!product.slug) continue
      entries.push({
        url: `${SITE_URL}/shop/art/${product.slug}`,
        lastModified: product.updated_at ? new Date(product.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }
    for (const funnel of funnels || []) {
      if (!funnel.slug) continue
      entries.push({
        url: `${SITE_URL}/art/${funnel.slug}`,
        lastModified: funnel.updated_at ? new Date(funnel.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  } catch {
    // Fall back to static entries if the DB is unreachable at build time.
  }

  return entries
}
