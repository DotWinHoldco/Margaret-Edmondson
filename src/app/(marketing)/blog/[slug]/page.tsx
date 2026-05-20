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
  const { data: post } = await supabase
    .from('blog_posts')
    .select('title, seo_title, seo_description, excerpt, cover_image_url')
    .eq('slug', slug)
    .single()
  if (!post) return { title: 'Post Not Found' }
  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt || '',
    openGraph: post.cover_image_url ? { images: [post.cover_image_url] } : undefined,
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

  // Pull a few related posts (same primary tag, exclude self).
  const primaryTag: string | null = post.tags?.[0] ?? null
  const { data: relatedRows } = primaryTag
    ? await supabase
        .from('blog_posts')
        .select('slug, title, excerpt, cover_image_url, published_at')
        .eq('status', 'published')
        .neq('slug', slug)
        .contains('tags', [primaryTag])
        .order('published_at', { ascending: false })
        .limit(3)
    : { data: [] }
  const related = relatedRows || []

  const readingMinutes = estimateReadingMinutes(post.content_html)

  return (
    <article className="bg-cream pb-20">
      {/* Hero / cover */}
      {post.cover_image_url ? (
        <header className="relative">
          <div className="relative h-[44vh] min-h-[280px] w-full overflow-hidden bg-charcoal/10">
            <Image
              src={post.cover_image_url}
              alt={post.title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/55 via-charcoal/15 to-transparent" />
          </div>
          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 pb-10 sm:pb-14">
              <Link
                href="/blog"
                className="inline-flex items-center gap-1.5 font-body text-xs uppercase tracking-[0.2em] text-cream/85 hover:text-cream"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0 7-7m-7 7 7 7" />
                </svg>
                Back to the blog
              </Link>
              <h1 className="mt-4 font-display text-3xl sm:text-5xl lg:text-6xl font-light leading-tight text-cream drop-shadow-sm">
                {post.title}
              </h1>
              <p className="mt-4 font-body text-sm text-cream/80">
                {formatDate(post.published_at)} · {readingMinutes} min read
              </p>
            </div>
          </div>
        </header>
      ) : (
        <header className="border-b border-charcoal/10 bg-white">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-16">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 font-body text-xs uppercase tracking-[0.2em] text-charcoal/55 hover:text-teal"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0 7-7m-7 7 7 7" />
              </svg>
              Back to the blog
            </Link>
            <h1 className="mt-5 font-display text-3xl sm:text-5xl lg:text-6xl font-light leading-tight text-charcoal">
              {post.title}
            </h1>
            <div className="mt-3 w-16 h-px bg-gold" />
            <p className="mt-5 font-body text-sm text-charcoal/55">
              {formatDate(post.published_at)} · {readingMinutes} min read
            </p>
          </div>
        </header>
      )}

      {/* Tags row */}
      {Array.isArray(post.tags) && post.tags.length > 0 && (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8">
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag: string) => (
              <span
                key={tag}
                className="rounded-full bg-charcoal/5 px-3 py-1 font-body text-[11px] uppercase tracking-wider text-charcoal/55"
              >
                {tag.replace(/-/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Excerpt as a lead-in */}
      {post.excerpt && (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-6">
          <p className="border-l-2 border-gold/60 pl-5 font-body text-lg leading-relaxed text-charcoal/75 italic">
            {post.excerpt}
          </p>
        </div>
      )}

      {/* Body */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-10">
        <div
          className="
            font-body text-[17px] leading-[1.75] text-charcoal/85
            [&_p]:my-5
            [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:font-display [&_h2]:text-2xl sm:[&_h2]:text-3xl [&_h2]:font-light [&_h2]:text-charcoal [&_h2]:leading-tight
            [&_h2+p]:mt-0
            [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-medium [&_h3]:text-charcoal
            [&_ul]:my-5 [&_ul]:pl-6 [&_ul]:list-disc [&_ul]:space-y-2
            [&_ol]:my-5 [&_ol]:pl-6 [&_ol]:list-decimal [&_ol]:space-y-2
            [&_li]:pl-1
            [&_strong]:font-semibold [&_strong]:text-charcoal
            [&_em]:italic
            [&_a]:text-teal [&_a]:underline-offset-4 [&_a]:decoration-teal/30 hover:[&_a]:decoration-teal
            [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-gold/60 [&_blockquote]:pl-5 [&_blockquote]:italic [&_blockquote]:text-charcoal/70
            [&_img]:my-8 [&_img]:rounded-sm
            [&_hr]:my-12 [&_hr]:border-charcoal/15
            [&_code]:rounded-sm [&_code]:bg-charcoal/[0.05] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.95em] [&_code]:font-mono
          "
          dangerouslySetInnerHTML={{ __html: post.content_html }}
        />

        {/* End rule + share-ish footer */}
        <div className="mt-16 border-t border-charcoal/10 pt-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="font-body text-sm text-charcoal/55">
              Published {formatDate(post.published_at)} on <Link href="/" className="text-teal hover:underline">artbyme.studio</Link>
            </p>
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 font-body text-sm font-medium text-teal hover:text-deep-teal"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0 7-7m-7 7 7 7" />
              </svg>
              More from the studio
            </Link>
          </div>
        </div>
      </div>

      {/* Related posts */}
      {related.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 sm:px-6 mt-20">
          <h2 className="font-display text-2xl font-light text-charcoal">Keep reading</h2>
          <div className="mt-2 w-12 h-px bg-gold" />
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/blog/${r.slug}`}
                className="group flex flex-col rounded-sm border border-charcoal/10 bg-white overflow-hidden hover:border-teal/40 hover:shadow-sm transition"
              >
                {r.cover_image_url ? (
                  <div className="relative aspect-[16/10] overflow-hidden bg-charcoal/5">
                    <Image
                      src={r.cover_image_url}
                      alt={r.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/10] bg-gradient-to-br from-cream to-charcoal/[0.06]" />
                )}
                <div className="flex flex-1 flex-col p-5">
                  <p className="font-body text-[11px] uppercase tracking-wider text-charcoal/45">
                    {formatDate(r.published_at)}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-light text-charcoal group-hover:text-teal transition-colors">
                    {r.title}
                  </h3>
                  {r.excerpt && (
                    <p className="mt-2 font-body text-sm text-charcoal/60 leading-relaxed line-clamp-3">
                      {r.excerpt}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <DiscoverCTA className="mt-20" />
      </div>
    </article>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return ''
  }
}

function estimateReadingMinutes(html: string | null | undefined): number {
  if (!html) return 1
  const text = html.replace(/<[^>]+>/g, ' ')
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220))
}
