import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { CV_SECTIONS, type CvEntry, type CvSection, sectionLabel } from '@/lib/cv'

export const metadata: Metadata = {
  title: 'Curriculum Vitae',
  description: 'Margaret Edmondson — selected exhibitions, education, and teaching experience.',
}

export const dynamic = 'force-dynamic'

async function loadCv() {
  const supabase = await createClient()
  const [entriesRes, settingsRes, productsRes] = await Promise.all([
    supabase
      .from('cv_entries')
      .select('id, section, year, sort_year_numeric, title, venue, institution, location, juror, award, notes, linked_artwork_slug, display_order, is_published, created_at, updated_at')
      .eq('is_published', true)
      .order('sort_year_numeric', { ascending: false })
      .order('display_order', { ascending: true })
      .order('title', { ascending: true }),
    supabase.from('cv_settings').select('intro, contact_email').eq('id', true).maybeSingle(),
    supabase.from('products').select('slug, is_published').eq('is_published', true),
  ])

  const entries = (entriesRes.data || []) as CvEntry[]
  const liveSlugs = new Set((productsRes.data || []).map((p) => p.slug))
  return {
    entries,
    intro: settingsRes.data?.intro || 'Selected exhibitions, education, and teaching experience.',
    contactEmail: settingsRes.data?.contact_email || 'margaret117art@gmail.com',
    liveSlugs,
  }
}

function lastUpdated(entries: CvEntry[]): string {
  if (entries.length === 0) return ''
  const max = entries.reduce((a, b) => (a > b.updated_at ? a : b.updated_at), entries[0].updated_at)
  return new Date(max).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function bySection(entries: CvEntry[]): Record<CvSection, CvEntry[]> {
  const out = { exhibitions: [], education: [], affiliations: [], experience: [] } as Record<CvSection, CvEntry[]>
  for (const e of entries) out[e.section].push(e)
  return out
}

export default async function CvPage() {
  const { entries, intro, contactEmail, liveSlugs } = await loadCv()
  const grouped = bySection(entries)
  const updated = lastUpdated(entries)

  return (
    <div className="bg-cream pt-12 sm:pt-20 pb-24 sm:pb-32">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <header className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-end mb-14">
          <div>
            <p className="font-hand text-base text-gold uppercase tracking-wider">Curriculum Vitae</p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl font-light text-charcoal leading-tight">
              Margaret Edmondson
            </h1>
            <div className="mt-4 w-16 h-px bg-gold" />
            <p className="mt-5 font-body text-base text-charcoal/70 max-w-xl">{intro}</p>
            {updated && (
              <p className="mt-3 font-body text-xs text-charcoal/40">Last updated {updated}.</p>
            )}
          </div>
          <div className="flex gap-3 print:hidden">
            <a
              href="/cv.pdf"
              className="inline-flex items-center gap-2 rounded-md border border-charcoal/20 px-4 py-2 font-body text-sm font-medium text-charcoal hover:bg-charcoal hover:text-cream transition-colors"
            >
              Download PDF
            </a>
          </div>
        </header>

        <div className="space-y-14">
          {CV_SECTIONS.map((section) => {
            const rows = grouped[section]
            if (rows.length === 0) return null
            return (
              <section key={section}>
                <h2 className="font-display text-2xl sm:text-3xl font-light text-charcoal">
                  {sectionLabel(section)}
                </h2>
                <div className="mt-3 w-12 h-px bg-gold" />
                <ul className="mt-6 space-y-6">
                  {rows.map((e) => (
                    <Entry key={e.id} entry={e} liveSlugs={liveSlugs} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>

        <footer className="mt-20 pt-8 border-t border-charcoal/10 text-center">
          <p className="font-body text-sm text-charcoal/70">
            Available for commissions and exhibitions.{' '}
            <a className="underline decoration-gold/60 hover:text-charcoal" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}

function Entry({ entry, liveSlugs }: { entry: CvEntry; liveSlugs: Set<string> }) {
  const linked = entry.linked_artwork_slug && liveSlugs.has(entry.linked_artwork_slug)
  const titleClass = 'font-display text-lg font-medium text-charcoal'
  return (
    <li className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-2 sm:gap-6">
      <div>
        <p className="font-display text-xl sm:text-2xl font-light text-charcoal/70">{entry.year}</p>
      </div>
      <div>
        {linked ? (
          <Link href={`/shop/art/${entry.linked_artwork_slug}`} className={`${titleClass} underline decoration-gold/40 hover:decoration-gold transition-colors`}>
            {entry.title}
          </Link>
        ) : (
          <p className={titleClass}>{entry.title}</p>
        )}
        {(entry.venue || entry.institution) && (
          <p className="font-body text-sm text-charcoal/70 mt-1">
            {[entry.venue, entry.institution].filter(Boolean).join(' · ')}
            {entry.location ? ` — ${entry.location}` : ''}
          </p>
        )}
        {entry.juror && (
          <p className="font-body text-sm text-charcoal/60 italic mt-1">Juror: {entry.juror}</p>
        )}
        {entry.award && (
          <p className="font-body text-sm italic mt-1 text-gold">
            {entry.award}
            {entry.linked_artwork_slug && !linked && (
              <span className="ml-2 not-italic text-charcoal/40">(artwork sold)</span>
            )}
          </p>
        )}
        {entry.notes && (
          <p className="font-body text-sm text-charcoal/60 mt-1">{entry.notes}</p>
        )}
      </div>
    </li>
  )
}
