import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Paint Your Pet Art Classes',
  description:
    'Bring a photo of your pet, leave with a finished painting. Adult, teen, and kids Paint Your Pet classes taught by Margaret Edmondson at The Farmhouse coffee shop in Harvest.',
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
  })
}

function priceLabel(cents: number) {
  return `$${(cents / 100).toFixed(0)}`
}

const AUDIENCE_LABEL: Record<SessionRow['audience'], string> = {
  adult: 'Adult', teen: 'Teen', kids: 'Kids', family: 'Family',
}

const STUDENT_PETS = [
  { src: '/Margaret Edmondson/extracted_pets/pet_00_white_cat.png', alt: 'Student painting of a white cat' },
  { src: '/Margaret Edmondson/extracted_pets/pet_01_tan_pitbull.png', alt: 'Student painting of a tan pitbull' },
  { src: '/Margaret Edmondson/extracted_pets/pet_02_bulldog.png', alt: 'Student painting of a bulldog' },
  { src: '/Margaret Edmondson/extracted_pets/pet_03_golden_dog_center.png', alt: 'Student painting of a golden dog' },
  { src: '/Margaret Edmondson/extracted_pets/pet_04_hamster_cora.png', alt: 'Student painting of Cora the hamster' },
  { src: '/Margaret Edmondson/extracted_pets/pet_05_red_retriever.png', alt: 'Student painting of a red retriever' },
  { src: '/Margaret Edmondson/extracted_pets/pet_06_gray_cat_arya.png', alt: 'Student painting of Arya the gray cat' },
  { src: '/Margaret Edmondson/extracted_pets/pet_07_maltese_bandana.png', alt: 'Student painting of a maltese in a bandana' },
  { src: '/Margaret Edmondson/extracted_pets/pet_08_black_white_dog.png', alt: 'Student painting of a black-and-white dog' },
  { src: '/Margaret Edmondson/extracted_pets/pet_09_lizard_gecko.png', alt: 'Student painting of a gecko' },
  { src: '/Margaret Edmondson/extracted_pets/pet_10_brown_boxer_dog.png', alt: 'Student painting of a brown boxer dog' },
]

export default async function ClassesPage() {
  const { sessions, reserved } = await loadSessions()
  const visibleSessions = sessions.slice(0, 9)

  return (
    <div className="bg-cream">
      {/* HERO */}
      <section className="pt-12 sm:pt-20 pb-12 sm:pb-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 items-center">
            <div>
              <p className="font-hand text-xl sm:text-2xl text-gold tracking-wide">Paint Your Pet</p>
              <h1 className="mt-2 font-display text-5xl sm:text-6xl lg:text-7xl font-light text-charcoal leading-[0.95]">
                Walk in with a <span className="text-teal italic">photo</span>.<br />
                Walk out with a <span className="text-gold italic">painting</span>.
              </h1>
              <div className="mt-6 w-20 h-px bg-gold" />
              <p className="mt-6 font-body text-lg text-charcoal/75 leading-relaxed max-w-xl">
                A relaxed two-hour class. Bring a reference photo of your pet, and I&rsquo;ll guide you, brush by brush, to a finished canvas portrait you&rsquo;ll be proud to hang.
              </p>
              <ul className="mt-6 grid grid-cols-2 gap-y-2 gap-x-4 font-body text-sm text-charcoal/70 max-w-md">
                <li>· All supplies included</li>
                <li>· 10 people max</li>
                <li>· Adult, teen, kids</li>
                <li>· Pay online with card</li>
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="#sessions"
                  className="inline-flex items-center justify-center px-6 py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-deep-teal transition-colors"
                >
                  See upcoming classes
                </Link>
                <Link
                  href="/contact?subject=class"
                  className="inline-flex items-center justify-center px-6 py-3 border border-charcoal/20 text-charcoal font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-charcoal hover:text-cream transition-colors"
                >
                  Got questions?
                </Link>
              </div>
            </div>
            <div className="relative">
              <Image
                src="/Margaret Edmondson/1.png"
                alt="Paint Your Pet class — finished pet portraits"
                width={1200}
                height={1500}
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="block w-full h-auto rounded-sm shadow-[0_24px_60px_-30px_rgba(28,28,28,0.45)]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-12 sm:py-16 bg-white/40 border-y border-charcoal/5">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <p className="font-hand text-lg text-gold uppercase tracking-wider text-center">How it works</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-light text-charcoal text-center">Three steps. One painting.</h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { n: '01', t: 'Pick a class', d: 'Adult, teen, or kids — and the day that works for you. Reserve your seat in under a minute.' },
              { n: '02', t: 'Send your pet photo', d: 'Upload a clear, well-lit photo when you reserve, at least two weeks before class. Margaret preps a custom outline so your portrait starts strong.' },
              { n: '03', t: 'Paint with me', d: 'Two relaxed hours, all supplies included. I teach the steps; you bring the heart. You leave with the finished canvas.' },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <p className="font-display text-5xl font-light text-gold">{s.n}</p>
                <h3 className="mt-2 font-display text-2xl font-light text-charcoal">{s.t}</h3>
                <p className="mt-2 font-body text-sm text-charcoal/70 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SESSIONS */}
      <section id="sessions" className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <p className="font-hand text-lg text-gold uppercase tracking-wider text-center">Upcoming sessions</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-light text-charcoal text-center">Reserve your seat</h2>

          {sessions.length === 0 ? (
            <div className="mt-10 text-center py-16 rounded-sm border border-dashed border-charcoal/15">
              <p className="font-body text-lg text-charcoal/70 max-w-xl mx-auto">
                No upcoming classes right now. Send a note and we&rsquo;ll add you to the next-session list.
              </p>
              <Link
                href="/contact?subject=class"
                className="mt-6 inline-flex items-center justify-center px-6 py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-deep-teal transition-colors"
              >
                Notify me
              </Link>
            </div>
          ) : (
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleSessions.map((s) => {
                const taken = reserved[s.id] || 0
                const soldOut = s.status === 'sold_out' || taken >= s.capacity
                const left = Math.max(0, s.capacity - taken)
                return (
                  <article key={s.id} className="rounded-sm border border-charcoal/10 bg-white p-5 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-block rounded-full bg-teal/10 px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider text-teal">
                        {AUDIENCE_LABEL[s.audience]}
                      </span>
                      <span className="font-display text-xl text-charcoal">{priceLabel(s.price_cents)}</span>
                    </div>
                    <h3 className="font-display text-lg font-light text-charcoal">{s.title.replace(/—.*$/, '').trim()}</h3>
                    <p className="mt-1 font-body text-sm text-charcoal/70">{formatDate(s.starts_at)}</p>
                    <p className="font-body text-xs text-charcoal/50">{s.location_name}</p>
                    <p className="mt-3 font-body text-xs text-charcoal/50">
                      {left === 0 ? 'Full' : left <= 3 ? `Only ${left} ${left === 1 ? 'seat' : 'seats'} left` : `${left} of ${s.capacity} seats open`}
                    </p>
                    <div className="mt-4">
                      {soldOut ? (
                        <span className="block w-full text-center px-4 py-2.5 bg-charcoal/5 text-charcoal/50 font-body text-xs font-medium tracking-wider uppercase rounded-sm">
                          Sold out
                        </span>
                      ) : (
                        <Link
                          href={`/classes/${s.slug}`}
                          className="block w-full text-center px-4 py-2.5 bg-teal text-white font-body text-xs font-medium tracking-wider uppercase rounded-sm hover:bg-deep-teal transition-colors"
                        >
                          Reserve
                        </Link>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
          {sessions.length > visibleSessions.length && (
            <p className="mt-6 text-center font-body text-xs text-charcoal/50">
              {sessions.length - visibleSessions.length} more sessions scheduled — email if you don&rsquo;t see a day that works.
            </p>
          )}
        </div>
      </section>

      {/* STUDENT WORK GALLERY */}
      <section className="py-16 sm:py-20 bg-white/40 border-y border-charcoal/5">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <p className="font-hand text-lg text-gold uppercase tracking-wider text-center">From past students</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-light text-charcoal text-center">
            Real pets. Real students. Real paintings.
          </h2>
          <p className="mt-3 text-center font-body text-sm text-charcoal/60 max-w-2xl mx-auto">
            Every painting below was made in one of these classes. No previous experience required — just bring the photo.
          </p>
          <div className="mt-10 columns-2 md:columns-4 [column-gap:0.75rem]">
            {STUDENT_PETS.map((p) => (
              <div key={p.src} className="break-inside-avoid mb-3">
                <Image
                  src={p.src}
                  alt={p.alt}
                  width={700}
                  height={900}
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="block w-full h-auto rounded-sm shadow-[0_8px_24px_-12px_rgba(28,28,28,0.3)]"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT TO EXPECT */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="lg:order-2">
              <Image
                src="/Margaret Edmondson/2.png"
                alt="Inside a Paint Your Pet class"
                width={1200}
                height={1500}
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="block w-full h-auto rounded-sm shadow-[0_24px_60px_-30px_rgba(28,28,28,0.45)]"
              />
            </div>
            <div>
              <p className="font-hand text-lg text-gold uppercase tracking-wider">What to expect</p>
              <h2 className="mt-2 font-display text-3xl sm:text-4xl font-light text-charcoal leading-tight">
                Relaxed, guided, and surprisingly good.
              </h2>
              <ul className="mt-6 space-y-3 font-body text-base text-charcoal/75 leading-relaxed">
                <li><strong className="text-charcoal">Two hours, start to finish.</strong> You leave with a complete canvas — not a half-painted promise.</li>
                <li><strong className="text-charcoal">All supplies included.</strong> Canvas, paint, brushes, easels, aprons. Just show up.</li>
                <li><strong className="text-charcoal">A custom outline.</strong> I prep your canvas with a light pencil outline of your pet so you start with a guide.</li>
                <li><strong className="text-charcoal">Adult, teen, and kids.</strong> Different sessions for different ages and paces.</li>
                <li><strong className="text-charcoal">Small group.</strong> 10 seats per class, max. You&rsquo;ll get individual attention.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* INSTRUCTOR + FINAL CTA */}
      <section className="py-16 sm:py-20 bg-white/40 border-t border-charcoal/5">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="font-hand text-lg text-gold uppercase tracking-wider">About your instructor</p>
          <h3 className="mt-2 font-display text-3xl font-light text-charcoal">Margaret Edmondson</h3>
          <p className="mt-4 font-body text-base text-charcoal/75 leading-relaxed">
            BS Art Education, Murray State University. MFA in Painting, Savannah College of Art and Design. Margaret has taught art to all ages across several states. Classes are hosted at The Farmhouse coffee shop in Harvest.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="#sessions"
              className="inline-flex items-center justify-center px-6 py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-deep-teal transition-colors"
            >
              Reserve a seat
            </Link>
            <Link
              href="/commissions"
              className="inline-flex items-center justify-center px-6 py-3 border border-charcoal/20 text-charcoal font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-charcoal hover:text-cream transition-colors"
            >
              Or commission a portrait
            </Link>
          </div>
          <p className="mt-6 font-body text-xs text-charcoal/50">
            Questions? <Link href="/contact?subject=class" className="text-teal underline hover:text-deep-teal">Send a note through the contact form</Link>.
          </p>
        </div>
      </section>
    </div>
  )
}
