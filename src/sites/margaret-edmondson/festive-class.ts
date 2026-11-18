/** Authored by DotWin. One source for the class, funnel, and campaign handoff.
 * Registration prices are also enforced by the ecommerce reservation RPC.
 */
export const festiveClass = {
  slug: 'festive-paint-at-the-market',
  title: 'Festive Paint at the Market',
  locationLabel: 'North Texas · Sanger, TX',
  dateLabel: 'Saturday, November 21, 2026',
  shortDateLabel: 'November 21',
  timeLabel: '9 AM–12:30 PM',
  timeOfDay: 'morning',
  regularPriceStartsLabel: 'November 20',
  instructor: 'Margaret Edmondson',
  status: 'registration',
  timeZone: 'America/Chicago',
  // Owner confirmed November 21, 2026 in the production release request.
  yearConfirmed: true,
  startsAt: '2026-11-21T09:00:00-06:00',
  endsAt: '2026-11-21T12:30:00-06:00',
  // Includes all of November 19 through 11:59 PM Central, matching Margaret's flier.
  earlyPriceEndsAt: '2026-11-20T00:00:00-06:00',
  earlyPriceDeadlineLabel: 'November 19 at 11:59 PM Central',
  priceScheduleLabel: '$20 through November 19 at 11:59 PM Central; $25 starting November 20.',
  flyer: '/margaret-edmondson/festive-paint-at-the-market-flyer.jpg',
  earlyPriceCents: 2000,
  regularPriceCents: 2500,
  marketName: null as string | null,
  marketAddress: '103 Freese Drive, Sanger, TX',
  capacity: null, // No class capacity limit, as requested by the owner.
  audience: null as string | null,
  canvas: '8 × 10 inches',
  path: '/classes/festive-paint-at-the-market',
  description: 'Pick a festive project and paint at your own pace. Your design is pre-drawn on an 8×10 canvas, with all materials, a self-guided instruction and information sheet, and on-site instruction included.',
  included: [
    { title: 'A festive project of your choice', body: 'Choose a festive design, then make it your own as you paint.' },
    { title: 'Your canvas, already started', body: 'The image is pre-drawn on an 8×10 canvas, ready for you to add color.' },
    { title: 'All materials provided', body: 'Your canvas and painting materials are included in the class price.' },
    { title: 'A little guidance, your own pace', body: 'Follow the self-guided instruction and information sheet, with on-site instruction available as you paint.' },
  ],
} as const

export type FestiveClass = Omit<typeof festiveClass, 'slug' | 'title' | 'description' | 'locationLabel' | 'dateLabel' | 'shortDateLabel' | 'timeLabel' | 'timeOfDay' | 'regularPriceStartsLabel' | 'startsAt' | 'endsAt' | 'earlyPriceEndsAt' | 'earlyPriceDeadlineLabel' | 'priceScheduleLabel' | 'flyer' | 'marketAddress' | 'path'> & {
  slug: string; title: string; locationLabel: string; dateLabel: string; shortDateLabel: string
  description: string
  timeLabel: string; timeOfDay: string; regularPriceStartsLabel: string
  startsAt: string; endsAt: string; earlyPriceEndsAt: string; earlyPriceDeadlineLabel: string
  priceScheduleLabel: string; flyer: string | null; marketAddress: string; path: string
}

export const illinoisClass: FestiveClass = {
  ...festiveClass,
  slug: 'festive-paint-marion-il',
  title: 'Festive Paint in Marion, IL',
  description: `The same Festive Paint class offered in North Texas, now in Marion, Illinois. ${festiveClass.description}`,
  locationLabel: 'Southern Illinois · Marion, IL',
  dateLabel: 'Tuesday, November 24, 2026',
  shortDateLabel: 'November 24',
  timeLabel: '5–8 PM',
  timeOfDay: 'evening',
  startsAt: '2026-11-24T17:00:00-06:00',
  endsAt: '2026-11-24T20:00:00-06:00',
  earlyPriceEndsAt: '2026-11-23T00:00:00-06:00',
  earlyPriceDeadlineLabel: 'November 22 at 11:59 PM Central',
  regularPriceStartsLabel: 'November 23',
  priceScheduleLabel: '$20 through November 22 at 11:59 PM Central; $25 starting November 23.',
  marketAddress: '401 S. Court St., Marion, IL',
  path: '/classes/festive-paint-marion-il',
  // The supplied flier advertises Texas; do not display it for Illinois.
  flyer: null,
}

export const festiveClasses: readonly FestiveClass[] = [festiveClass, illinoisClass]
/** Resolve only the published class definitions. */
export function findFestiveClass(slug: string): FestiveClass | undefined {
  return festiveClasses.find(item => item.slug === slug)
}

/** The owner's supplied examples, unchanged; each painter chooses independently. */
export const festivePaintings = [
  { id: 'snowman', name: 'Snowman', image: '/margaret-edmondson/paintings/snowman.jpeg', alt: 'Snowman with a red scarf against a blue background' },
  { id: 'ornament', name: 'Christmas Ornament', image: '/margaret-edmondson/paintings/ornament.jpeg', alt: 'Red Christmas ornament wrapped in colorful lights' },
  { id: 'reindeer', name: 'Reindeer', image: '/margaret-edmondson/paintings/reindeer.jpeg', alt: 'Smiling reindeer with a red scarf in falling snow' },
  { id: 'santa', name: 'Santa', image: '/margaret-edmondson/paintings/santa.jpeg', alt: 'Santa with a cardinal and holly on his red hat' },
] as const

/** Resolve the advertised price using the market timezone, including its end. */
export function getFestiveOffer(now: Date = new Date(), event: FestiveClass = festiveClass) {
  const timestamp = now.getTime()
  if (!Number.isFinite(timestamp)) throw new RangeError('A valid date is required')
  const early = timestamp < Date.parse(event.earlyPriceEndsAt)
  const ended = timestamp >= Date.parse(event.endsAt)
  return {
    early,
    ended,
    priceCents: early ? event.earlyPriceCents : event.regularPriceCents,
    priceLabel: early ? '$20' : '$25',
    savingsLabel: ended ? 'This class has ended' : early ? `Save $5 when you sign up by ${event.earlyPriceDeadlineLabel}` : `${event.shortDateLabel} class price`,
  }
}

/** Keep campaign attribution consistent across the prepared promotional links. */
export function festiveCampaignUrl(source: 'facebook' | 'instagram' | 'email' | 'flyer', medium: 'social' | 'email' | 'qr') {
  const url = new URL(festiveClass.path, 'https://artbyme.studio')
  url.searchParams.set('utm_source', source)
  url.searchParams.set('utm_medium', medium)
  url.searchParams.set('utm_campaign', 'margaret_festive_market_2026')
  return url.toString()
}
