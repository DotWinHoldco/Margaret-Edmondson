import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function ThankYouPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const supabase = await createClient()
  const { data: s } = await supabase
    .from('class_sessions')
    .select('title, starts_at, location_name, location_address, price_cents')
    .eq('slug', slug)
    .maybeSingle()

  return (
    <div className="bg-cream pt-24 pb-32 min-h-screen">
      <div className="mx-auto max-w-xl px-4 sm:px-6 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-teal/10 mb-6">
          <svg className="h-8 w-8 text-teal" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-display text-4xl font-light text-charcoal mb-3">You&rsquo;re reserved!</h1>
        <div className="mx-auto w-16 h-px bg-gold mb-6" />
        {s ? (
          <>
            <p className="font-body text-base text-charcoal/75 leading-relaxed">
              I&rsquo;ll see you at <strong>{s.title}</strong> on{' '}
              {new Date(s.starts_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' })} at{' '}
              <strong>{s.location_name}</strong>.
            </p>
            <p className="mt-4 font-body text-base text-charcoal/75">
              Check your inbox for payment instructions. Venmo or Zelle works — total due is{' '}
              <strong>${(s.price_cents / 100).toFixed(2)}</strong>. Photos and payment due at least 2 weeks before class.
            </p>
          </>
        ) : (
          <p className="font-body text-base text-charcoal/75">Check your inbox for payment instructions.</p>
        )}
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/classes" className="inline-flex items-center justify-center px-8 py-3 border-2 border-charcoal text-charcoal font-body text-sm font-medium tracking-wider uppercase hover:bg-charcoal hover:text-cream transition-colors">
            Back to classes
          </Link>
          <Link href="/shop" className="inline-flex items-center justify-center px-8 py-3 bg-charcoal text-cream font-body text-sm font-medium tracking-wider uppercase hover:bg-charcoal/90 transition-colors">
            Browse the shop
          </Link>
        </div>
      </div>
    </div>
  )
}
