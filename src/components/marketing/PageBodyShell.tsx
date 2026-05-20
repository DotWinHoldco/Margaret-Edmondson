// Public render shell for pages that pull body content from the
// pages table (Privacy, Terms, Shipping, Commissions, Contact intro).
// Matches the typographic chrome of the existing legal/marketing
// pages so DB-driven content looks identical to the hardcoded copy.

import Image from 'next/image'

interface Props {
  title: string
  bodyHtml: string
  heroImageUrl?: string | null
  lastUpdated?: string | null
}

export default function PageBodyShell({ title, bodyHtml, heroImageUrl, lastUpdated }: Props) {
  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl sm:text-5xl font-light text-charcoal text-center">
          {title}
        </h1>
        <div className="mt-3 mx-auto w-16 h-px bg-gold" />
        {lastUpdated && (
          <p className="mt-6 text-center text-sm text-charcoal/60">
            Last updated: {lastUpdated}
          </p>
        )}
        {heroImageUrl && (
          <div className="mx-auto mt-10 max-w-2xl">
            <Image
              src={heroImageUrl}
              alt={title}
              width={1200}
              height={800}
              className="block w-full h-auto rounded-sm"
            />
          </div>
        )}
        <div
          className="prose prose-charcoal mt-12 max-w-none space-y-6 font-body text-charcoal/80 leading-relaxed
            [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-light [&_h2]:text-charcoal [&_h2]:mt-10
            [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-light [&_h3]:text-charcoal [&_h3]:mt-6
            [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1
            [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1
            [&_p]:my-3
            [&_a]:text-gold [&_a]:underline-offset-2 hover:[&_a]:underline"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </div>
    </div>
  )
}
