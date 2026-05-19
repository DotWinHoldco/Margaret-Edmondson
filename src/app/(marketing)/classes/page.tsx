import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Paint Your Pet Art Classes',
  description:
    'Bring a photo of your pet — leave with a painting. Adult, teen, and kids classes taught by Margaret Edmondson.',
}

export const dynamic = 'force-dynamic'

interface SessionRow {
  id: string
  slug: string
  audience: 'adult' | 'teen' | 'kids' | 'family'
  title: string
  starts_at: string
  ends_at: string
  price_cents: number
  capacity: number
  location_name: string
  location_address: string
  status: 'draft' | 'published' | 'sold_out' | 'completed' | 'cancelled'
}

async function loadSessions(): Promise<{ sessions: SessionRow[]; reserved: Record<string, number> }> {
  const supabase = await createClient()
  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('id, slug, audience, title, starts_at, ends_at, price_cents, capacity, location_name, location_address, status')
    .in('status', ['published', 'sold_out'])
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })

  const rows = (sessions || []) as SessionRow[]
  const reserved: Record<string, number> = {}
  if (rows.length > 0) {
    const { data: bookings } = await supabase
      .from('class_bookings')
      .select('session_id, status')
      .in('session_id', rows.map((s) => s.id))
      .in('status', ['awaiting_payment', 'paid'])
    for (const row of (bookings || []) as { session_id: string }[]) {
      reserved[row.session_id] = (reserved[row.session_id] || 0) + 1
    }
  }
  return { sessions: rows, reserved }
}

const GALLERY_BASE = 'https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/public/product-images/web/custom-portrait-options'
const GALLERY_IMAGES = [
  { src: `${GALLERY_BASE}/custom-pet-portrait-example_1.webp`, alt: 'Student pet portrait, watercolor' },
  { src: `${GALLERY_BASE}/custom-pet-portrait-example_2.webp`, alt: 'Student pet portrait, mixed media' },
  { src: `${GALLERY_BASE}/custom-pet-portrait-example_3.webp`, alt: 'Student pet portrait, acrylic' },
  { src: `${GALLERY_BASE}/dog-and-daughter-drawing_1.webp`, alt: 'Kids class — daughter painting her dog' },
  { src: `${GALLERY_BASE}/dog-and-daughter-drawing_2.webp`, alt: 'Kids class — finished painting' },
  { src: `${GALLERY_BASE}/family-gift-painting.webp`, alt: 'Family portrait gift painting' },
  { src: `${GALLERY_BASE}/stylized-color-portrait-example.webp`, alt: 'Stylized portrait class example' },
  { src: `${GALLERY_BASE}/custom-house-portrait-example_1.webp`, alt: 'House portrait class example' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
  })
}

function priceLabel(cents: number) {
  return `$${(cents / 100).toFixed(0)}`
}

const AUDIENCE_LABEL: Record<SessionRow['audience'], string> = {
  adult: 'Adult', teen: 'Teen', kids: 'Kids', family: 'Family',
}

export default async function ClassesPage() {
  const { sessions, reserved } = await loadSessions()

  return (
    <div className="bg-cream pt-12 sm:pt-20 pb-24 sm:pb-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="text-center max-w-3xl mx-auto mb-12">
          <p className="font-hand text-xl sm:text-2xl text-gold tracking-wide">Paint Your Pet</p>
          <h1 className="mt-2 font-display text-5xl sm:text-6xl lg:text-7xl font-light text-charcoal leading-[0.95]">
            <span className="text-teal">ART</span> Classes
          </h1>
          <div className="mt-6 mx-auto w-20 h-px bg-gold" />
          <p className="mt-6 font-body text-base sm:text-lg text-charcoal/70 leading-relaxed">
            Bring a photo of your pet — leave with a painting.
          </p>
          <p className="mt-3 font-body text-sm text-charcoal/60">
            All supplies included. Taught by Margaret Edmondson — Harvest resident, BS Art Education, MFA in Painting.
          </p>
          <p className="mt-4 inline-block rounded-full bg-teal/10 px-4 py-1 font-body text-xs font-semibold uppercase tracking-wider text-teal">
            10 people max per class
          </p>
        </header>

        {sessions.length === 0 ? (
          <section className="text-center py-20 border-y border-charcoal/10">
            <p className="font-body text-lg text-charcoal/70 max-w-xl mx-auto">
              No upcoming classes right now. Email me to be notified about the next session.
            </p>
            <a
              href="mailto:margaret117art@gmail.com?subject=Notify%20me%20about%20the%20next%20class"
              className="mt-6 inline-flex items-center justify-center px-8 py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-deep-teal transition-colors"
            >
              Notify me
            </a>
          </section>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-20">
            {sessions.map((s) => {
              const taken = reserved[s.id] || 0
              const soldOut = s.status === 'sold_out' || taken >= s.capacity
              return (
                <article key={s.id} className="rounded-sm border border-charcoal/10 bg-white p-6 flex flex-col">
                  <div className="mb-4">
                    <span className="inline-block rounded-full bg-charcoal/[0.04] px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/70">
                      {AUDIENCE_LABEL[s.audience]}
                    </span>
                  </div>
                  <h2 className="font-display text-2xl font-light text-charcoal mb-2">{s.title.replace(/—.*$/, '').trim()}</h2>
                  <p className="font-body text-sm text-charcoal/70 mb-1">{formatDate(s.starts_at)}</p>
                  <p className="font-body text-sm text-charcoal/60 mb-4">{s.location_name}</p>
                  <p className="font-body text-2xl font-semibold text-charcoal mb-1">{priceLabel(s.price_cents)}</p>
                  <p className="font-body text-xs text-charcoal/50 mb-6">{Math.max(0, s.capacity - taken)} of {s.capacity} spots left</p>
                  <div className="mt-auto">
                    {soldOut ? (
                      <span className="block w-full text-center px-4 py-3 bg-charcoal/5 text-charcoal/50 font-body text-sm font-medium tracking-wider uppercase rounded-sm">
                        Sold out
                      </span>
                    ) : (
                      <Link
                        href={`/classes/${s.slug}`}
                        className="block w-full text-center px-4 py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-deep-teal transition-colors"
                      >
                        Sign up
                      </Link>
                    )}
                  </div>
                </article>
              )
            })}
          </section>
        )}

        <section className="mb-20 max-w-3xl mx-auto">
          <h3 className="font-display text-2xl font-light text-charcoal mb-4 text-center">Logistics</h3>
          <ul className="space-y-2 font-body text-base text-charcoal/75 list-disc list-inside">
            <li>All supplies are included — just bring yourself and a photo of your pet.</li>
            <li>Venmo or Zelle accepted.</li>
            <li><strong>Send payment and your pet photo at least 2 weeks before class.</strong></li>
            <li>10 people max per class. Sign up early.</li>
          </ul>
        </section>

        <section className="mb-20">
          <h3 className="font-display text-2xl font-light text-charcoal mb-6 text-center">Past student work</h3>
          <div className="columns-2 md:columns-4 [column-gap:1rem]">
            {GALLERY_IMAGES.map((img) => (
              <div key={img.src} className="break-inside-avoid mb-4">
                <Image
                  src={img.src}
                  alt={img.alt}
                  width={800}
                  height={1000}
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="block w-full h-auto rounded-sm shadow-[0_8px_24px_-12px_rgba(28,28,28,0.3)]"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="text-center max-w-2xl mx-auto">
          <h3 className="font-display text-2xl font-light text-charcoal mb-3">About your instructor</h3>
          <p className="font-body text-base text-charcoal/75 leading-relaxed">
            <strong>Margaret Edmondson</strong>, Harvest resident. BS Art Education (Murray State University), MFA in Painting (Savannah College of Art and Design). Questions? Email{' '}
            <a href="mailto:margaret117art@gmail.com" className="text-teal underline hover:text-deep-teal">margaret117art@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
