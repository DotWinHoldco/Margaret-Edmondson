import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import ContactFormClient from '@/components/marketing/ContactFormClient'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Margaret Edmondson about artwork, commissions, or classes.',
}

export const dynamic = 'force-dynamic'

const DEFAULT_HEADING = 'Get in Touch'
const DEFAULT_INTRO =
  "Questions about artwork, commissions, classes, or anything else? We'd love to hear from you."

export default async function ContactPage() {
  const supabase = await createClient()
  const { data: page } = await supabase
    .from('pages')
    .select('title, content_html')
    .eq('slug', 'contact')
    .maybeSingle()

  const heading = page?.title || DEFAULT_HEADING
  const introHtml = page?.content_html && page.content_html.trim().length > 0 ? page.content_html : null

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl sm:text-5xl font-light text-charcoal">{heading}</h1>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
          {introHtml ? (
            <div
              className="mt-4 font-body text-charcoal/60 [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: introHtml }}
            />
          ) : (
            <p className="mt-4 font-body text-charcoal/60">{DEFAULT_INTRO}</p>
          )}
        </div>

        <Suspense fallback={<p className="font-body text-sm text-charcoal/45 text-center">Loading…</p>}>
          <ContactFormClient />
        </Suspense>

        <div className="mt-16 text-center font-body text-sm text-charcoal/50">
          <p>We typically respond within 24 hours.</p>
        </div>
      </div>
    </div>
  )
}
