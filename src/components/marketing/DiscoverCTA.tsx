import Link from 'next/link'

/**
 * Three-card funnel that closes most marketing pages: Browse the shop /
 * Learn (classes) / Connect (commissions). Drop into the foot of any
 * page that isn't itself a dedicated funnel (classes, commissions
 * already serve that purpose — don't render this there).
 */
export default function DiscoverCTA({ className = '' }: { className?: string }) {
  return (
    <section className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${className}`}>
      <Link href="/shop" className="group rounded-sm border border-charcoal/10 bg-white p-6 text-center hover:border-charcoal transition-colors">
        <p className="font-hand text-base text-gold uppercase tracking-wider">Browse</p>
        <h3 className="mt-1 font-display text-2xl font-light text-charcoal group-hover:text-teal transition-colors">My Work</h3>
        <p className="mt-2 font-body text-sm text-charcoal/60">Originals, prints, and recent series.</p>
      </Link>
      <Link href="/classes" className="group rounded-sm border border-charcoal/10 bg-white p-6 text-center hover:border-charcoal transition-colors">
        <p className="font-hand text-base text-gold uppercase tracking-wider">Learn</p>
        <h3 className="mt-1 font-display text-2xl font-light text-charcoal group-hover:text-teal transition-colors">Join a class</h3>
        <p className="mt-2 font-body text-sm text-charcoal/60">Paint Your Pet sessions for kids, teens, and adults.</p>
      </Link>
      <Link href="/commissions" className="group rounded-sm border border-charcoal/10 bg-white p-6 text-center hover:border-charcoal transition-colors">
        <p className="font-hand text-base text-gold uppercase tracking-wider">Connect</p>
        <h3 className="mt-1 font-display text-2xl font-light text-charcoal group-hover:text-teal transition-colors">Commission or say hi</h3>
        <p className="mt-2 font-body text-sm text-charcoal/60">Custom portraits, questions, anything.</p>
      </Link>
    </section>
  )
}
