import { getPublishedBlogPosts } from '@/lib/supabase/queries'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import DiscoverCTA from '@/components/marketing/DiscoverCTA'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Studio updates, art process insights, and creative inspiration from ArtByME.',
}

export default async function BlogPage() {
  const posts = await getPublishedBlogPosts()

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl sm:text-5xl font-light text-charcoal">Blog</h1>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
        </div>

        <div className="space-y-12">
          {posts.map((post) => (
            <article key={post.id} className="group">
              <Link href={`/blog/${post.slug}`} className="block">
                {post.cover_image_url && (
                  <div className="relative aspect-[2/1] overflow-hidden rounded-sm mb-4">
                    <Image
                      src={post.cover_image_url}
                      alt={post.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 800px"
                    />
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs font-body text-charcoal/40 mb-2">
                  {post.published_at && (
                    <time>{new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
                  )}
                  {post.tags?.map((tag: string) => (
                    <span key={tag} className="px-2 py-0.5 bg-charcoal/5 rounded-sm">{tag}</span>
                  ))}
                </div>
                <h2 className="font-display text-2xl font-light text-charcoal group-hover:text-teal transition-colors">
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p className="mt-2 font-body text-sm text-charcoal/60 line-clamp-2">{post.excerpt}</p>
                )}
              </Link>
            </article>
          ))}
        </div>

        {posts.length === 0 && (
          <p className="text-center font-body text-charcoal/50 py-20">Blog posts coming soon.</p>
        )}

        <DiscoverCTA className="mt-24" />
      </div>
    </div>
  )
}
