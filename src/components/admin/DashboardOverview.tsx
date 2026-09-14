import Link from 'next/link'
import FulfillmentSettings from './FulfillmentSettings'
import TaxReportClient from '@/app/(admin)/admin/sales/TaxReportClient'

const shortcuts = [
  { title: 'Products', href: '/admin/products', description: 'Your art, ready to sell.', icon: 'M4 4h16v16H4z M4 15l5-5 4 4 3-3 4 4', links: [['Add a product', '/admin/products/new'], ['Manage products', '/admin/products']] },
  { title: 'Orders', href: '/admin/orders?view=all', description: 'Keep every delivery moving.', icon: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10', links: [['All orders', '/admin/orders?view=all'], ['Studio queue', '/admin/orders?view=studio']] },
  { title: 'Pages', href: '/admin/pages', description: 'Make your website feel like you.', icon: 'M4 4h16v16H4z M4 9h16 M9 9v11', links: [['Edit wording', '/admin/pages'], ['Design assets', '/admin/pages/design-assets']] },
  { title: 'Settings', href: '/admin/settings', description: 'Set the rules for your business.', icon: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6', links: [['Sales tax', '/admin/settings#sales-tax'], ['Markup & gross margin', '/admin/settings#pricing']] },
  { title: 'Documentation', href: '/admin/help', description: 'Clear steps, from setup to your next sale.', icon: 'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1z M12 6v14', links: [['Read the guides', '/admin/help'], ['Markup & gross margin', '/admin/help/09-understand-margins']] },
  { title: 'Customers', href: '/admin/customers', description: 'Stay close to your collectors.', icon: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2', links: [['Customer directory', '/admin/customers'], ['Email tools', '/admin/email']] },
] as const

export function DashboardQuickLinks() {
  return (
    <section id="quick-links" aria-labelledby="quick-links-title" className="scroll-mt-8 py-3">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="quick-links-title" className="font-serif text-3xl font-semibold">Your studio, within reach</h2>
        <p className="text-sm text-charcoal/65">Quick links for the work you do most.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts.map((card) => (
          <article key={card.title} className={`group flex flex-col rounded-2xl border p-5 transition-colors ${card.title === 'Settings' ? 'border-teal/25 bg-teal/[0.06]' : card.title === 'Documentation' ? 'border-gold/30 bg-gold/[0.07]' : 'border-charcoal/10 bg-white hover:border-teal/30'}`}>
            <Link href={card.href} className="flex items-center justify-between gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal">
              <h3 className="font-serif text-2xl font-semibold">{card.title}</h3>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 shrink-0 text-teal"><path d={card.icon}/></svg>
            </Link>
            <p className="mt-2 text-sm leading-6 text-charcoal/65">{card.description}</p>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-3 border-t border-charcoal/10 pt-4">
              {card.links.map(([label, href]) => <Link key={label} href={href} className="text-sm font-medium text-teal underline decoration-teal/30 underline-offset-4 hover:text-deep-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal">{label}</Link>)}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function DashboardOverview() {
  return (
    <div className="space-y-6 font-sans text-charcoal">
      <header className="relative overflow-hidden rounded-2xl border border-teal/15 bg-deep-teal px-6 py-8 text-cream sm:px-9 sm:py-9">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[40px] border-cream/[0.035]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-cream/75">ArtByME · Your studio dashboard</p>
            <h1 className="mt-2 font-serif text-4xl font-medium leading-tight sm:text-5xl">A little clarity.<br className="sm:hidden" /> More room to create.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-cream/80">Your sales, orders, and tax records in one place. Everything you need to keep your art business moving.</p>
          </div>
          <Link href="/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-3 rounded-lg border border-cream/30 px-5 py-2 text-sm text-cream transition-colors hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream">Visit your website <span aria-hidden="true">↗</span></Link>
        </div>
        <nav aria-label="Dashboard sections" className="relative mt-7 flex flex-wrap gap-x-6 gap-y-3 border-t border-cream/20 pt-5 text-sm">
          {[['Sales overview', '#sales-overview'], ['Sales tax tracker', '#sales-tax'], ['Quick links', '#quick-links'], ['Feedback & communication', '#feedback']].map(([label, href]) => <a key={href} href={href} className="text-cream/85 underline decoration-cream/25 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream">{label}</a>)}
        </nav>
      </header>
      <FulfillmentSettings compact />
      <TaxReportClient><DashboardQuickLinks /></TaxReportClient>
    </div>
  )
}
