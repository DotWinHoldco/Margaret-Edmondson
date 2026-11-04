import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { festiveClass, getFestiveOffer } from '@/sites/margaret-edmondson/festive-class'
import { FestiveOffer } from '@/sites/margaret-edmondson/FestiveOffer'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Art classes' }

/** Class overview leads into upcoming choices; unavailable workshops never imply open booking. */
export default function MargaretClassesPage() {
  return (
    <div id="class-overview" className="me-container me-catalog">
      <p className="me-eyebrow">Make a little time for art</p>
      <h1>Come paint <em>with me.</em></h1>
      <p className="me-intro">Make time to create something you love. Margaret’s classes bring people together around a canvas, with a project to make your own and guidance along the way.</p>
      <p className="me-catalog-about">Explore the classes below to find your next painting project. Each class page has the details, what’s included, and registration when dates are available.</p>
      <h2 className="me-catalog-heading">Find your next <em>creative moment.</em></h2>
      <article className="me-class-card">
        <Link className="me-catalog-art" href={festiveClass.path} aria-label="Explore Festive Paint at the Market"><Image src="/margaret-edmondson/paintings/santa.jpeg" alt="Santa, one of four festive projects to choose from" width={400} height={500} sizes="(max-width: 760px) 80vw, 250px" priority /></Link>
        <div>
          <p className="me-eyebrow">November 21 · 9 AM–12:30 PM</p>
          <h2>{festiveClass.title}</h2>
          <p>{festiveClass.marketAddress}</p>
          <p>{festiveClass.description}</p>
          <FestiveOffer initialOffer={getFestiveOffer()} />
          <Link className="me-button" href={festiveClass.path}>Class details & registration <span aria-hidden="true">↗</span></Link>
        </div>
      </article>
      <article className="me-class-card me-class-unavailable">
        <div className="me-catalog-art"><Image src="/margaret-edmondson/paintings/pet-class-example.png" alt="A past student's painting of a white dog wearing a red bandana" width={303} height={377} sizes="(max-width: 760px) 80vw, 250px" /></div>
        <div><p className="me-eyebrow">No upcoming dates</p><h2>Paint Your Pet</h2><p>Turn your favorite companion into a work of art with Margaret.</p><p className="me-unavailable-note">There are no Paint Your Pet classes available right now. New dates will appear here when they’re announced.</p><span className="me-status-label">Registration unavailable</span></div>
      </article>
    </div>
  )
}
