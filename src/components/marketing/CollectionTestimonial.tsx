import { getFeaturedTestimonials } from '@/lib/supabase/queries'

interface T {
  id: string
  name: string
  role?: string | null
  quote: string
}

// A single on-brand testimonial highlight for the bottom of a collection page.
// `seed` (the category slug) picks a deterministic testimonial so each
// collection shows a different quote, but the same one on every visit.
export default async function CollectionTestimonial({ seed = '' }: { seed?: string }) {
  const rows = (await getFeaturedTestimonials()) as T[]
  if (!rows || rows.length === 0) return null

  let idx = 0
  for (const ch of seed) idx = (idx + ch.charCodeAt(0)) % rows.length
  const t = rows[idx] || rows[0]
  if (!t?.quote) return null

  return (
    <section className="mt-24 border-t border-charcoal/10 pt-20 sm:pt-24" aria-label="Collector testimonial">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <p className="font-hand text-2xl sm:text-3xl text-gold tracking-wide">Kind Words</p>
        <div className="mt-5 mx-auto w-12 h-px bg-gold/60" />
        <blockquote className="mt-9">
          <p className="font-display text-2xl sm:text-[2rem] font-light italic leading-relaxed text-charcoal/85">
            &ldquo;{t.quote}&rdquo;
          </p>
          <footer className="mt-8">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.22em] text-charcoal/80">
              {t.name}
            </p>
            {t.role && <p className="font-hand text-lg text-teal mt-1.5">{t.role}</p>}
          </footer>
        </blockquote>
      </div>
    </section>
  )
}
