import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import DiscoverCTA from '@/components/marketing/DiscoverCTA'

export async function generateMetadata(
  props: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await props.params
  const supabase = await createClient()
  const { data: post } = await supabase.from('blog_posts').select('title, seo_title, seo_description, excerpt').eq('slug', slug).single()
  if (!post) return { title: 'Post Not Found' }
  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt || '',
  }
}

export default async function BlogPostPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params
  const supabase = await createClient()
  const { data: post } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!post) notFound()

  return (
    <article className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <Link href="/blog" className="font-body text-sm text-teal hover:underline mb-4 block">
            &larr; Back to Blog
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal">
            {post.title}
          </h1>
          <div className="mt-4 flex items-center gap-3 text-xs font-body text-charcoal/40">
            {post.published_at && (
              <time>{new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            )}
            {post.tags?.map((tag: string) => (
              <span key={tag} className="px-2 py-0.5 bg-charcoal/5 rounded-sm">{tag}</span>
            ))}
          </div>
        </div>

        {/* Cover Image */}
        {post.cover_image_url && (
          <div className="relative aspect-[2/1] overflow-hidden rounded-sm mb-10">
            <Image src={post.cover_image_url} alt={post.title} fill className="object-cover" sizes="800px" priority />
          </div>
        )}

        {/* Content */}
        <div
          className="prose prose-lg max-w-none font-body text-charcoal/80 prose-headings:font-display prose-headings:font-light prose-headings:text-charcoal prose-a:text-teal"
          dangerouslySetInnerHTML={{ __html: post.content_html }}
        />

        <DiscoverCTA className="mt-24" />
      </div>
    </article>
  )
}
