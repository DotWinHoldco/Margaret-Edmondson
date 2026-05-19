import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { renderMarkdown } from '@/lib/markdown'

export const metadata: Metadata = {
  title: 'About',
  description: 'Meet Margaret Edmondson — mixed media artist, painter, and art educator with a BS in Art Education from Murray State and an MFA in Painting from SCAD.',
}

export const dynamic = 'force-dynamic'

interface SectionRow {
  section_key: string
  heading: string
  body_markdown: string
  display_order: number
  image_url: string | null
  image_alt: string | null
  updated_at: string
}

interface CalloutRow {
  id: string
  kind: 'motto' | 'quote' | 'list'
  label: string
  body_markdown: string
  display_order: number
  updated_at: string
}

interface Degree { year: string; degree: string; institution: string; location: string; honors?: string }

interface CredentialsRow {
  full_name: string
  degrees: Degree[]
  hero_image_url: string | null
  contact_email: string
  updated_at: string
}

async function loadAbout() {
  const supabase = await createClient()
  const [sectionsRes, calloutsRes, credsRes] = await Promise.all([
    supabase.from('bio_sections').select('section_key, heading, body_markdown, display_order, image_url, image_alt, updated_at').eq('is_published', true).order('display_order', { ascending: true }),
    supabase.from('bio_callouts').select('id, kind, label, body_markdown, display_order, updated_at').eq('is_published', true).order('display_order', { ascending: true }),
    supabase.from('bio_credentials_block').select('full_name, degrees, hero_image_url, contact_email, updated_at').eq('id', true).maybeSingle(),
  ])
  return {
    sections: (sectionsRes.data || []) as SectionRow[],
    callouts: (calloutsRes.data || []) as CalloutRow[],
    credentials: (credsRes.data as CredentialsRow | null),
  }
}

function lastUpdated(s: SectionRow[], c: CalloutRow[], cr: CredentialsRow | null): string {
  const dates = [...s.map((x) => x.updated_at), ...c.map((x) => x.updated_at)]
  if (cr) dates.push(cr.updated_at)
  if (dates.length === 0) return ''
  const max = dates.reduce((a, b) => (a > b ? a : b))
  return new Date(max).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function AboutPage() {
  const { sections, callouts, credentials } = await loadAbout()

  if (sections.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="font-body text-charcoal/60">This page is being updated — check back soon.</p>
      </div>
    )
  }

  const mottosAndQuotes = callouts.filter((c) => c.kind !== 'list')
  const lists = callouts.filter((c) => c.kind === 'list')
  const updated = lastUpdated(sections, callouts, credentials)

  return (
    <div className="bg-cream pt-12 sm:pt-20 pb-24 sm:pb-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {credentials && (
          <header className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10 lg:gap-14 items-center mb-20">
            <div>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-light text-charcoal leading-tight">
                {credentials.full_name}
              </h1>
              <div className="mt-4 w-16 h-px bg-gold" />
              <ul className="mt-6 space-y-2 font-body text-sm sm:text-base text-charcoal/70 uppercase tracking-wide">
                {credentials.degrees.map((d) => (
                  <li key={`${d.year}-${d.degree}`}>
                    <strong className="text-charcoal">{d.degree}</strong> · {d.year} · {d.institution}, {d.location}
                    {d.honors && <span className="ml-2 normal-case text-charcoal/60 italic">({d.honors})</span>}
                  </li>
                ))}
              </ul>
            </div>
            {credentials.hero_image_url && (
              <div className="lg:order-2">
                <Image
                  src={credentials.hero_image_url}
                  alt={credentials.full_name}
                  width={800}
                  height={1000}
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="block w-full h-auto rounded-sm shadow-[0_18px_45px_-22px_rgba(28,28,28,0.35)]"
                />
              </div>
            )}
          </header>
        )}

        <div className="space-y-20">
          {sections.map((s, idx) => {
            const hasImage = Boolean(s.image_url)
            const imageRight = hasImage && idx % 2 === 0
            const imageLeft = hasImage && idx % 2 === 1
            return (
              <article key={s.section_key} className={hasImage ? 'max-w-4xl mx-auto' : 'max-w-2xl mx-auto'}>
                <h2 className="font-display text-3xl sm:text-4xl font-light text-charcoal text-center">
                  {s.heading}
                </h2>
                <div className="mt-3 mx-auto w-12 h-px bg-gold" />
                <div className={`mt-6 ${hasImage ? 'grid grid-cols-1 md:grid-cols-2 gap-10 items-center' : ''}`}>
                  {imageLeft && (
                    <Image
                      src={s.image_url!}
                      alt={s.image_alt || s.heading}
                      width={900}
                      height={1100}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="block w-full h-auto rounded-sm shadow-[0_18px_45px_-22px_rgba(28,28,28,0.35)]"
                    />
                  )}
                  <div
                    className="font-body text-base sm:text-lg text-charcoal/75 leading-relaxed prose prose-sm sm:prose-base max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(s.body_markdown) }}
                  />
                  {imageRight && (
                    <Image
                      src={s.image_url!}
                      alt={s.image_alt || s.heading}
                      width={900}
                      height={1100}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="block w-full h-auto rounded-sm shadow-[0_18px_45px_-22px_rgba(28,28,28,0.35)]"
                    />
                  )}
                </div>
                {mottosAndQuotes[idx] && (
                  <aside className="mt-10 rounded-sm border-l-4 border-gold bg-white/60 px-6 py-5 max-w-xl mx-auto">
                    <p className="font-hand text-xs uppercase tracking-widest text-charcoal/50">{mottosAndQuotes[idx].label}</p>
                    <p className="mt-2 font-display text-xl sm:text-2xl font-light text-charcoal italic">
                      &ldquo;{mottosAndQuotes[idx].body_markdown}&rdquo;
                    </p>
                  </aside>
                )}
              </article>
            )
          })}
        </div>

        {lists.length > 0 && (
          <section className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
            {lists.map((l) => (
              <div key={l.id} className="rounded-sm border border-charcoal/10 bg-white p-6">
                <h3 className="font-hand text-base text-gold uppercase tracking-wider mb-3">{l.label}</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {l.body_markdown.split('\n').filter(Boolean).map((item, i) => (
                    <li key={i} className="rounded-full bg-charcoal/[0.04] px-3 py-1 font-body text-xs text-charcoal/70">
                      {item.trim()}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        <section className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/shop" className="group rounded-sm border border-charcoal/10 bg-white p-6 text-center hover:border-charcoal transition-colors">
            <p className="font-hand text-base text-gold uppercase tracking-wider">Browse</p>
            <h3 className="mt-1 font-display text-2xl font-light text-charcoal group-hover:text-teal transition-colors">The work</h3>
            <p className="mt-2 font-body text-sm text-charcoal/60">Originals, prints, and recent series.</p>
          </Link>
          <Link href="/classes" className="group rounded-sm border border-charcoal/10 bg-white p-6 text-center hover:border-charcoal transition-colors">
            <p className="font-hand text-base text-gold uppercase tracking-wider">Learn</p>
            <h3 className="mt-1 font-display text-2xl font-light text-charcoal group-hover:text-teal transition-colors">Join a class</h3>
            <p className="mt-2 font-body text-sm text-charcoal/60">Paint Your Pet sessions for kids, teens, and adults.</p>
          </Link>
          <a
            href={`mailto:${credentials?.contact_email || 'margaret117art@gmail.com'}?subject=Commission%20inquiry`}
            className="group rounded-sm border border-charcoal/10 bg-white p-6 text-center hover:border-charcoal transition-colors"
          >
            <p className="font-hand text-base text-gold uppercase tracking-wider">Connect</p>
            <h3 className="mt-1 font-display text-2xl font-light text-charcoal group-hover:text-teal transition-colors">Commission or say hi</h3>
            <p className="mt-2 font-body text-sm text-charcoal/60">Custom portraits, questions, anything.</p>
          </a>
        </section>

        {updated && (
          <p className="mt-16 text-center font-body text-xs text-charcoal/40">
            Page last updated {updated}.
          </p>
        )}
      </div>
    </div>
  )
}
