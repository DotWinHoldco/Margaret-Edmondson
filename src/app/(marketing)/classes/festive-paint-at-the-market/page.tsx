import type { Metadata } from 'next'
import Image from 'next/image'
import { ArrowDown, ArrowUpRight, Check, Clock3, MapPin, Sparkles } from '@/sites/margaret-edmondson/icons'
import { festiveClass, festivePaintings, getFestiveOffer } from '@/sites/margaret-edmondson/festive-class'
import { FestiveOffer } from '@/sites/margaret-edmondson/FestiveOffer'
import { FestiveSignup } from '@/sites/margaret-edmondson/FestiveSignup'
import { availableArtPaymentMode } from '@/lib/classes/festive/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: festiveClass.title,
  description: `Pick a festive project and paint at your own pace with Margaret Edmondson. Pre-drawn 8×10 canvas, all materials, and instruction included. ${festiveClass.priceScheduleLabel} Market hours: 9 AM–12:30 PM.`,
  alternates: { canonical: festiveClass.path },
  openGraph: {
    title: 'Festive Paint at the Market | Margaret Edmondson',
    description: `A festive project. Your own pace. All materials included. November 21 · 9 AM–12:30 PM · ${festiveClass.priceScheduleLabel}`,
    url: festiveClass.path,
    type: 'website',
    images: [{ url: '/margaret-edmondson/share.jpg', width: 1000, height: 661, alt: 'Art by Margaret Edmondson' }],
  },
}

const faqs = [
  ['What will I paint?', 'Choose a snowman, Christmas ornament, reindeer, or Santa. The image is already drawn on an 8×10 canvas, so you can begin adding color.'],
  ['Can I sign up more than one painter?', 'Yes! Enter the number of painters, choose a painting for each person, and pay for everyone in one checkout. Each painter can choose a different project.'],
  ['Is this a guided class?', 'You can paint at your own pace using the self-guided instruction and information sheet. On-site instruction is also provided.'],
  ['What do I need to bring?', 'All painting materials are provided, including your pre-drawn canvas.'],
  ['How does the early price work?', `Sign up by ${festiveClass.earlyPriceDeadlineLabel} to pay $20 per painter and save $5. The price changes to $25 on November 20.`],
  ['What are the market hours?', 'The market runs from 9 AM to 12:30 PM on November 21.'],
  ['Where is the market?', `The market is at ${festiveClass.marketAddress}.`],
]

/** Campaign landing page: offer, expectations, inclusions, and registration status. */
export default async function FestiveMarketPage() {
  const offer = getFestiveOffer()
  const paymentMode = await availableArtPaymentMode()
  return (
    <div id="festive-class">
      <div className="me-container me-back-link"><Link href="/classes">← All classes</Link></div>
      <section className="me-hero me-container" aria-labelledby="class-title">
        <div className="me-hero-copy">
          <p className="me-eyebrow"><Sparkles size={15} aria-hidden="true" /> A festive morning with Margaret</p>
          <h1 id="class-title">Make a little<br /><em>holiday magic.</em></h1>
          <p className="me-hero-subtitle">{festiveClass.title}</p>
          <p className="me-hero-location"><MapPin size={16} aria-hidden="true" />{festiveClass.marketAddress}</p>
          <p className="me-intro">Pick a festive project, settle in, and paint at your own pace. We’ll have the canvas, the materials, and a little guidance ready for you.</p>
          <a className="me-button" href="#signup-form">Choose your paintings <ArrowDown size={17} aria-hidden="true" /></a>
          <p className="me-hero-note">Pre-drawn 8×10 canvas · All materials included</p>
        </div>
        <div className="me-project-preview">
          <div className="me-project-grid">{festivePaintings.map((painting, index) => (
            <figure key={painting.id}>
              <Image src={painting.image} alt={painting.alt} width={400} height={500} sizes="(max-width: 760px) 44vw, 22vw" priority={index < 2} />
              <figcaption>{painting.name}</figcaption>
            </figure>
          ))}</div>
          <p>Four festive projects. Which one will you paint?</p>
        </div>
      </section>

      <div className="me-facts">
        <div className="me-container me-facts-inner">
          <div><span className="me-fact-label">The day</span><strong>November 21</strong></div>
          <div><span className="me-fact-label">Market hours</span><strong>9 AM – 12:30 PM</strong></div>
          <div><span className="me-fact-label">Your canvas</span><strong>8 × 10, pre-drawn</strong></div>
          <div><span className="me-fact-label">Your pace</span><strong>Relaxed & self-guided</strong></div>
        </div>
      </div>

      <section className="me-container me-included" aria-labelledby="included-title">
        <div className="me-section-heading"><p className="me-eyebrow">A canvas, some color, and you</p><h2 id="included-title">Everything you need.<br /><em>Room to make it yours.</em></h2></div>
        <div className="me-included-grid">{festiveClass.included.map((item, index) => <article key={item.title}><span className="me-number">0{index + 1}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
      </section>

      <section className="me-pace">
        <div className="me-container me-pace-inner"><p className="me-eyebrow">Permission to slow down</p><h2>A festive project.<br /><em>A pace that feels like you.</em></h2><p>Follow the sheet, ask a question, take your time with a color. With a pre-drawn canvas and on-site instruction, you have a starting point and support along the way.</p><a href="#registration">Make time to paint <ArrowUpRight size={18} aria-hidden="true" /></a></div>
      </section>

      <section id="registration" className="me-container me-registration" aria-labelledby="registration-title">
        <div>
          <p className="me-eyebrow">November 21 · At the market</p>
          <h2 id="registration-title">Your little<br /><em>creative escape.</em></h2>
          <p className="me-intro">A festive canvas to make your own, with all your materials and instruction included.</p>
          <ul className="me-checklist">{['Choose a festive project', 'Paint a pre-drawn 8×10 canvas', 'Use the self-guided instruction sheet', 'Get on-site instruction as you paint'].map(item => <li key={item}><Check size={17} aria-hidden="true" />{item}</li>)}</ul>
        </div>
        <aside className="me-booking-card" aria-label="Class price and registration">
          <p className="me-eyebrow">{offer.early && !offer.ended ? 'A little early-bird treat' : 'Festive Paint at the Market'}</p>
          <FestiveOffer initialOffer={offer} />
          <div className="me-booking-meta"><p><Clock3 size={18} aria-hidden="true" /><span>November 21<br /><strong>Market: 9 AM – 12:30 PM</strong></span></p><p><MapPin size={18} aria-hidden="true" /><span>{festiveClass.marketName && <>{festiveClass.marketName}<br /></>}{festiveClass.marketAddress}</span></p></div>
          <p className="me-small-note">With artist & instructor Margaret Edmondson</p>
        </aside>
      </section>

      <section id="signup-form" className="me-container me-signup-section" aria-labelledby="signup-title">
        <div className="me-section-heading"><p className="me-eyebrow">A little color, together</p><h2 id="signup-title">Choose your projects.<br /><em>Make a morning of it.</em></h2></div>
        <FestiveSignup initialOffer={offer} paymentMode={paymentMode} />
      </section>

      <section id="class-flyer" className="me-container me-flyer" aria-labelledby="flyer-title">
        <a className="me-flyer-preview" href={festiveClass.flyer} target="_blank" rel="noopener noreferrer" aria-label="View the Festive Paint at the Market flier full size (opens in a new tab)">
          <Image src={festiveClass.flyer} alt="Margaret’s Festive Paint at the Market flier, featuring Santa, a snowman, and a reindeer" width={1545} height={2000} sizes="(max-width: 760px) 280px, 320px" />
        </a>
        <div>
          <p className="me-eyebrow">Save the date · Share the fun</p>
          <h2 id="flyer-title">Take the<br /><em>details with you.</em></h2>
          <p className="me-intro">Save Margaret’s class flier or share it with a friend who’d love a morning of painting.</p>
          <div className="me-flyer-actions">
            <a className="me-button" href={festiveClass.flyer} download="Festive-Paint-at-the-Market.jpg">Download the flier <ArrowDown size={17} aria-hidden="true" /></a>
            <a className="me-flyer-view" href={festiveClass.flyer} target="_blank" rel="noopener noreferrer">View full size <ArrowUpRight size={17} aria-hidden="true" /></a>
          </div>
        </div>
      </section>

      <section className="me-container me-faq" aria-labelledby="faq-title"><div><p className="me-eyebrow">A few helpful details</p><h2 id="faq-title">Before you<br /><em>pick up a brush.</em></h2></div><div className="me-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
    </div>
  )
}
