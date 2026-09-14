import Link from 'next/link'

const HOMEPAGE_VARIANTS = [
  {
    number: 1,
    name: 'Gallery Immersion',
    path: '/',
    accent: 'bg-[#F5F0E8]',
    accentBorder: 'border-[#F5F0E8]',
    description: 'Warm minimalism with parallax hero, featured grid, and block-based CMS.',
  },
  {
    number: 2,
    name: 'Studio Energy',
    path: '/v2',
    accent: 'bg-coral',
    accentBorder: 'border-coral',
    description: 'Bold editorial magazine layout with torn-edge dividers and coral accents.',
  },
  {
    number: 3,
    name: 'Immersive Collage',
    path: '/v3',
    accent: 'bg-olive',
    accentBorder: 'border-olive',
    description: 'Textured maximalism with stamp frames, washi tape, and collage aesthetics.',
  },
  {
    number: 4,
    name: 'Kinetic Gallery',
    path: '/v4',
    accent: 'bg-charcoal',
    accentBorder: 'border-charcoal',
    description: 'Dark cinematic experience with horizontal scroll gallery and spotlit artwork.',
  },
  {
    number: 5,
    name: 'Editorial Canvas',
    path: '/v5',
    accent: 'bg-gold',
    accentBorder: 'border-gold',
    description: 'Magazine masthead with oversized typography and clip-path image reveals.',
  },
  {
    number: 6,
    name: 'Living Studio',
    path: '/v6',
    accent: 'bg-teal',
    accentBorder: 'border-teal',
    description: 'Playful paint splashes, polaroid cards, draggable carousel, and sketchbook sections.',
  },
]


const FUNNEL_TEMPLATES = [
  { id: 'gallery_spotlight', name: 'Gallery Spotlight', accent: 'bg-charcoal', description: 'A dark gallery setting that gives one artwork the full spotlight. A good fit for large pieces with a strong visual impact.' },
  { id: 'intimate_journal', name: 'Intimate Journal', accent: 'bg-gold', description: 'A warm, personal page that reads like a letter from the artist. A good fit when the story behind a piece matters.' },
  { id: 'bold_showcase', name: 'Bold Showcase', accent: 'bg-coral', description: 'A bright, energetic page with large type and strong blocks of color. A good fit for colorful, lively artwork.' },
]

export interface DesignFunnel {
  id: string
  slug: string
  template: string
  isPublished: boolean
  views: number
  carts: number
  purchases: number
  title: string
}

const actionClass = 'inline-flex items-center justify-center rounded-lg border border-charcoal/15 px-4 py-2.5 text-sm font-medium text-charcoal transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal'

export default function DesignAssetsView({ funnels, loadError = false }: { funnels: DesignFunnel[]; loadError?: boolean }) {
  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-12 font-body text-charcoal">
      <header className="rounded-2xl border border-teal/15 bg-white p-6 sm:p-9">
        <Link href="/admin/pages" className="text-sm font-medium text-teal hover:underline">← Back to Pages</Link>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-teal">Your website design library</p>
        <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Design Assets</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-charcoal/65">Explore the look of your homepage and the pages that tell each artwork’s story. Preview a design, leave feedback, or keep working on a saved sales page.</p>
        <nav aria-label="Design asset sections" className="mt-6 flex flex-wrap gap-3"><a href="#homepages" className={actionClass}>Homepage designs · 6</a><a href="#funnels" className={actionClass}>Sales funnels · 3 templates</a><Link href="/admin/pages" className={actionClass}>Edit page wording</Link></nav>
      </header>

      <section id="homepages" aria-labelledby="homepage-designs-title" className="scroll-mt-8">
        <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-widest text-teal">01 · Homepage designs</p><h2 id="homepage-designs-title" className="mt-2 font-display text-2xl font-semibold">Find the look that feels like your art.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-charcoal/65">View Live opens a design in a new tab. Give Feedback opens the dashboard’s feedback form with that design selected. A preview does not change your live homepage.</p></div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {HOMEPAGE_VARIANTS.map((variant) => <article key={variant.number} className="flex flex-col overflow-hidden rounded-xl border border-charcoal/10 bg-white shadow-sm">
            <div className={`h-2 ${variant.accent}`} />
            <div className="flex flex-1 flex-col p-5"><p className="text-xs font-semibold uppercase tracking-widest text-charcoal/45">Design {variant.number}</p><h3 className="mt-2 font-display text-xl font-semibold">{variant.name}</h3><p className="mb-5 mt-3 flex-1 text-sm leading-6 text-charcoal/60">{variant.description}</p><div className="flex flex-wrap gap-2"><a href={variant.path} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-teal px-3 py-2.5 text-sm font-medium text-white hover:bg-deep-teal">View Live ↗</a><Link href={`/admin?feedbackPage=${encodeURIComponent(`Homepage V${variant.number}`)}#feedback`} className={actionClass}>Give Feedback</Link></div></div>
          </article>)}
        </div>
      </section>

      <section id="funnels" aria-labelledby="sales-funnels-title" className="scroll-mt-8 space-y-6">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-teal">02 · Sales funnels</p><h2 id="sales-funnels-title" className="mt-2 font-display text-2xl font-semibold">Give one artwork a page of its own.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-charcoal/65">A funnel is a sales page focused on one piece of art. These three templates help tell its story, show its value, and guide the buyer toward a purchase. Choose your template in the existing funnel editor.</p></div>
        <div className="grid gap-5 lg:grid-cols-3">{FUNNEL_TEMPLATES.map((template) => <article key={template.id} className="overflow-hidden rounded-xl border border-charcoal/10 bg-white"><div className={`h-2 ${template.accent}`} /><div className="p-5"><h3 className="font-display text-xl font-semibold">{template.name}</h3><p className="mt-3 text-sm leading-6 text-charcoal/60">{template.description}</p></div></article>)}</div>
        <div className="flex flex-wrap gap-3"><Link href="/admin/funnels" className={actionClass}>Manage Funnels</Link><Link href="/admin/funnels/new" className="rounded-lg bg-teal px-4 py-2.5 text-sm font-medium text-white hover:bg-deep-teal">Create New Funnel</Link></div>
        <div className="rounded-xl border border-charcoal/10 bg-white p-5 sm:p-6">
          <h3 className="font-display text-xl font-semibold">Your saved sales funnels</h3><p className="mt-2 text-sm leading-6 text-charcoal/60">Edit a draft or view a published page. Views, carts, and purchases are the existing totals recorded for each funnel.</p>
          {loadError ? <div role="alert" className="mt-5 rounded-lg border border-coral/25 p-4 text-sm"><p>We could not load your saved funnels. Your designs are still available above.</p><Link href="/admin/funnels" className="mt-2 inline-block font-medium text-teal underline">Open Manage Funnels to try again</Link></div> : funnels.length === 0 ? <p className="mt-5 rounded-lg bg-cream p-4 text-sm text-charcoal/65">No saved funnels yet. Choose Create New Funnel to build your first artwork sales page.</p> : <div className="mt-5 space-y-3">{funnels.map((funnel) => <article key={funnel.id} className="rounded-lg border border-charcoal/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{funnel.title}</h4><span className={`rounded-full px-2 py-1 text-xs font-medium ${funnel.isPublished ? 'bg-teal/10 text-teal' : 'bg-charcoal/5 text-charcoal/60'}`}>{funnel.isPublished ? 'Live' : 'Draft'}</span></div><p className="mt-1 break-all text-xs leading-5 text-charcoal/55">{FUNNEL_TEMPLATES.find((template) => template.id === funnel.template)?.name ?? funnel.template} · /art/{funnel.slug}</p></div><div className="flex flex-wrap gap-2">{funnel.isPublished && <a href={`/art/${funnel.slug}`} target="_blank" rel="noopener noreferrer" className={actionClass}>View ↗</a>}<Link href={`/admin/funnels/${funnel.id}`} className={actionClass}>Edit</Link></div></div>
            <dl className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-cream p-3">{[['Views', funnel.views], ['Carts', funnel.carts], ['Purchases', funnel.purchases]].map(([label, value]) => <div key={label}><dt className="text-xs text-charcoal/55">{label}</dt><dd className="mt-1 text-lg font-semibold text-teal">{Number(value).toLocaleString()}</dd></div>)}</dl>
          </article>)}</div>}
        </div>
      </section>
    </div>
  )
}
