'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { helpArticles } from '@/lib/help/articles'

export default function HelpIndex() {
  const [query, setQuery] = useState('')
  const articles = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    return helpArticles.filter((article) => {
      const haystack = JSON.stringify(article).toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
  }, [query])
  const groups = [...new Set(articles.map((article) => article.group))]
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12 font-body text-charcoal">
      <header className="rounded-xl bg-charcoal px-6 py-9 text-cream sm:px-9">
        <p className="text-xs uppercase tracking-[0.2em] text-cream/65">Your studio handbook</p>
        <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">A clear next step for your art business.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-cream/80">20 practical guides, from your first product to a well-run studio. Follow them in order or find the job you need. Each guide has real screen examples, simple steps, and a way to check your work.</p>
        <Link href="/admin/help/01-start-here" className="mt-6 inline-flex rounded-lg bg-teal px-5 py-3 text-sm font-semibold text-white hover:bg-deep-teal">Start with guide 1 →</Link>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { title: 'Understand your profit', detail: 'Studio prices, markup, and gross margin', href: '/admin/help/09-understand-margins' },
          { title: 'Set up sales tax', detail: 'Nexus, Texas, and both tax modes', href: '/admin/help/12-sales-tax-and-nexus' },
          { title: 'Change a few words', detail: 'Edit a section and check the live page', href: '/admin/help/14-edit-page-words' },
        ].map((item) => <Link key={item.href} href={item.href} className="rounded-xl border border-teal/20 bg-white p-5 transition-colors hover:bg-teal/5"><span className="block font-semibold text-teal">{item.title} →</span><span className="mt-1 block text-sm text-charcoal/65">{item.detail}</span></Link>)}
      </div>
      <div>
        <label htmlFor="help-search" className="mb-2 block text-sm font-semibold">Find an answer</label>
        <input id="help-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try sales tax, shipping, margin, or edit a page" className="w-full rounded-lg border border-charcoal/20 bg-white px-4 py-3 text-base outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
        <p className="mt-2 text-sm text-charcoal/60" role="status">{articles.length} of 20 guides{query.trim() ? ' match your search' : ' · about one task per guide'}</p>
      </div>
      {groups.map((group) => <section key={group} aria-label={group}>
        <h2 className="mb-4 font-display text-xl font-semibold">{group}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {articles.filter((article) => article.group === group).map((article) => <Link key={article.slug} href={`/admin/help/${article.slug}`} className="group flex gap-4 rounded-xl border border-charcoal/10 bg-white p-5 transition-colors hover:border-teal/40 hover:bg-teal/[0.03]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream text-sm font-semibold text-teal">{article.slug.slice(0, 2)}</span>
            <div><h3 className="font-semibold leading-6 group-hover:text-teal">{article.title}</h3><p className="mt-1 text-sm leading-6 text-charcoal/65">{article.summary}</p></div>
          </Link>)}
        </div>
      </section>)}
      {articles.length === 0 && <div className="rounded-xl border border-charcoal/10 bg-white p-6"><p>No guide matches those words. Try a shorter search, such as “tax” or “product.”</p><button type="button" onClick={() => setQuery('')} className="mt-3 text-sm font-semibold text-teal underline">Show all 20 guides</button></div>}
    </div>
  )
}
