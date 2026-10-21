import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import ReviewForm from '@/components/marketing/ReviewForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Reviews', description: 'Stories from Margaret Edmondson’s collectors and students. Share your experience and a photo of your artwork at home.' }

export default async function ReviewsPage() {
  const db = await createClient()
  const { data, error } = await db.from('testimonials').select('id,name,role,quote,content,title,image_url,event_context')
    .eq('status', 'approved').order('sort_order', { ascending: true }).order('created_at', { ascending: false })
  return <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
    <header className="max-w-2xl"><h1 className="font-display text-5xl font-light text-charcoal sm:text-6xl">Art, in your life.</h1><p className="mt-6 font-body text-lg leading-relaxed text-charcoal/70">Notes from collectors and students—about the pieces they live with and the things they have learned along the way.</p><a href="#share" className="mt-6 inline-block font-body text-teal underline underline-offset-4">Share your experience</a></header>
    {error ? <p role="status" className="mt-12 font-body text-charcoal/65">Reviews are temporarily unavailable. Please check back shortly.</p> : <div className="mt-12 columns-1 gap-10 md:columns-2">{(data ?? []).map(review => <figure key={review.id} className="mb-10 break-inside-avoid border-t border-charcoal/15 pt-6">
      {review.image_url && <img src={review.image_url} alt={review.event_context ? `Collector photo: ${review.event_context}` : 'Artwork in a collector’s home'} loading="lazy" className="mb-6 max-h-96 w-full rounded-sm object-contain" />}
      <blockquote className="whitespace-pre-line font-display text-2xl leading-relaxed text-charcoal">{review.quote || review.content}</blockquote>
      <figcaption className="mt-5 font-body text-sm"><span className="font-medium">{review.name}</span>{review.role && <span className="block mt-1 text-charcoal/60">{review.role}</span>}</figcaption>
    </figure>)}</div>}
    <section id="share" className="mt-16 grid scroll-mt-24 gap-10 border-t border-charcoal/20 pt-12 lg:grid-cols-[1fr_1.2fr]">
      <div><h2 className="font-display text-3xl">Make yourself at home.</h2><p className="mt-4 max-w-sm font-body leading-relaxed text-charcoal/70">Tell me about your artwork or class. I’d love to see a photo of the piece in your home, too.</p><p className="mt-4 max-w-sm font-body text-sm leading-relaxed text-charcoal/60">Each submission is reviewed before it appears on the website. Your display name, review, and any photo you choose to share may be published.</p></div>
      <ReviewForm />
    </section>
  </div>
}
