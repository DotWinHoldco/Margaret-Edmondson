import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getHelpArticle, helpArticles } from '@/lib/help/articles'
import MarginCalculator from '../MarginCalculator'

type Props = { params: Promise<{ slug: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = getHelpArticle(slug)
  return { title: article ? `${article.title} | ArtByME Help` : 'Guide not found', robots: { index: false, follow: false } }
}

export default async function HelpArticlePage({ params }: Props) {
  const { slug } = await params
  const article = getHelpArticle(slug)
  if (!article) notFound()
  const index = helpArticles.findIndex((item) => item.slug === slug)
  const previous = helpArticles[index - 1]
  const next = helpArticles[index + 1]
  return (
    <div className="mx-auto max-w-5xl pb-12 font-body text-charcoal">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-charcoal/60"><Link href="/admin/help" className="text-teal hover:underline">Help & Guides</Link><span aria-hidden="true" className="mx-2">/</span>Guide {index + 1} of 20</nav>
      <article>
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal">{article.group}</p>
          <h1 className="mt-3 max-w-4xl font-display text-3xl font-semibold leading-tight sm:text-4xl">{article.title}</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-charcoal/70">{article.summary}</p>
          <Link href={article.tool.href} className="mt-5 inline-flex rounded-lg bg-teal px-5 py-3 text-sm font-semibold text-white hover:bg-deep-teal">{article.tool.label} ↗</Link>
        </header>
        <nav aria-label="On this page" className="mb-8 flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-charcoal/10 bg-white px-5 py-4 text-sm text-teal">
          <a href="#before-you-start" className="hover:underline">Before you start</a><a href="#steps" className="hover:underline">Step by step</a><a href="#example" className="hover:underline">Examples</a><a href="#check" className="hover:underline">Check your work</a><a href="#troubleshooting" className="hover:underline">If something goes wrong</a>
        </nav>
        <div className="space-y-8">
          <section id="before-you-start" className="scroll-mt-6 rounded-xl border border-charcoal/10 bg-white p-6 sm:p-8"><h2 className="font-display text-2xl font-semibold">Before you start</h2><p className="mt-3 max-w-3xl text-base leading-8 text-charcoal/80">{article.before}</p></section>
          <figure className="overflow-hidden rounded-xl border border-charcoal/15 bg-white">
            <a href={`/help/screenshots/${article.screen}`} target="_blank" rel="noreferrer" aria-label={`Open full-size screenshot: ${article.screenAlt}`}><Image src={`/help/screenshots/${article.screen}`} alt={article.screenAlt} width={1600} height={1000} unoptimized className="h-auto w-full" /></a>
            <figcaption className="border-t border-charcoal/10 px-5 py-4 text-sm leading-6 text-charcoal/65">{article.screen === 'sales-tax.png' ? 'Sales tax controls shown with sample Texas settings; your live setup status may differ.' : article.screenAlt} Select the image to see it full size.</figcaption>
          </figure>
          <section id="steps" className="scroll-mt-6 rounded-xl border border-charcoal/10 bg-white p-6 sm:p-8">
            <h2 className="font-display text-2xl font-semibold">Step by step</h2>
            <ol className="mt-6 space-y-6">{article.steps.map((step, stepIndex) => <li key={stepIndex} className="flex gap-4"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal/10 text-sm font-semibold text-teal">{stepIndex + 1}</span><p className="max-w-3xl pt-0.5 text-base leading-8 text-charcoal/85"><span className="sr-only">Step {stepIndex + 1}. </span>{step}</p></li>)}</ol>
          </section>
          <section id="example" className="scroll-mt-6 rounded-xl border border-gold/30 bg-gold/10 p-6 sm:p-8"><h2 className="font-display text-2xl font-semibold">Let’s use a simple example</h2><div className="mt-4 space-y-4">{article.example.map((paragraph, i) => <p key={i} className="max-w-3xl text-base leading-8">{paragraph}</p>)}</div></section>
          {article.extra?.map((section) => <section key={section.title} className="rounded-xl border border-charcoal/10 bg-white p-6 sm:p-8"><h2 className="font-display text-2xl font-semibold">{section.title}</h2><div className="mt-4 space-y-4">{section.paragraphs.map((paragraph, i) => <p key={i} className="max-w-3xl text-base leading-8 text-charcoal/80">{paragraph}</p>)}</div></section>)}
          {slug === '09-understand-margins' && <MarginCalculator />}
          <section id="check" className="scroll-mt-6 rounded-xl border border-teal/20 bg-teal/5 p-6 sm:p-8"><h2 className="font-display text-2xl font-semibold">How to know it worked</h2><ul className="mt-4 list-disc space-y-3 pl-5 text-base leading-7">{article.check.map((check) => <li key={check}>{check}</li>)}</ul></section>
          <section id="troubleshooting" className="scroll-mt-6 rounded-xl border border-charcoal/10 bg-white p-6 sm:p-8"><h2 className="font-display text-2xl font-semibold">If something goes wrong</h2><p className="mt-3 max-w-3xl text-base leading-8 text-charcoal/80">{article.troubleshoot}</p></section>
          {article.sources && <section className="rounded-xl border border-charcoal/10 bg-white p-6 sm:p-8"><h2 className="font-display text-xl font-semibold">Official resources</h2><p className="mt-2 text-sm leading-6 text-charcoal/65">Use these official guides for current registration and tax rules. Reviewed September 14, 2026.</p><ul className="mt-4 space-y-3">{article.sources.map((source) => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer" className="text-teal underline underline-offset-4">{source.label} ↗</a></li>)}</ul></section>}
        </div>
      </article>
      <nav aria-label="Continue learning" className="mt-9 grid gap-4 sm:grid-cols-2">
        {previous ? <Link href={`/admin/help/${previous.slug}`} className="rounded-xl border border-charcoal/15 bg-white p-5 hover:border-teal"><span className="text-xs uppercase tracking-wider text-charcoal/50">← Previous guide</span><span className="mt-2 block font-semibold text-teal">{previous.title}</span></Link> : <Link href="/admin/help" className="rounded-xl border border-charcoal/15 bg-white p-5 font-semibold text-teal">← All 20 guides</Link>}
        {next ? <Link href={`/admin/help/${next.slug}`} className="rounded-xl border border-teal/20 bg-teal/5 p-5 hover:border-teal"><span className="text-xs uppercase tracking-wider text-charcoal/50">Next step →</span><span className="mt-2 block font-semibold text-teal">{next.title}</span></Link> : <Link href="/admin/help" className="rounded-xl border border-teal/20 bg-teal/5 p-5 font-semibold text-teal">Return to all 20 guides →</Link>}
      </nav>
    </div>
  )
}
