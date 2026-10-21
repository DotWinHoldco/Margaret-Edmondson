import { sanitizeHtml } from '@/lib/sanitize'

interface CollectionStoryProps {
  title: string
  contentHtml: string
}

/** The first paragraph is the introduction; the rest remains available on demand. */
export default function CollectionStory({ title, contentHtml }: CollectionStoryProps) {
  const html = sanitizeHtml(contentHtml).trim()
  if (!html) return null

  const firstParagraph = /^(<p(?:\s[^>]*)?>[\s\S]*?<\/p>)([\s\S]*)$/i.exec(html)
  const introduction = firstParagraph?.[1] || ''
  const story = firstParagraph ? firstParagraph[2].trim() : html

  return (
    <section aria-labelledby="collection-story-title" className="mx-auto mb-12 max-w-3xl sm:mb-16">
      <h2 id="collection-story-title" className="font-display text-3xl font-light text-charcoal sm:text-4xl">
        {title}
      </h2>
      {introduction && (
        <div
          className="rich-content mt-4 font-body text-base leading-relaxed text-charcoal/75"
          dangerouslySetInnerHTML={{ __html: introduction }}
        />
      )}
      {story && (
        <details className="group mt-5 border-b border-charcoal/15 pb-5">
          <summary className="flex w-fit list-none items-center gap-3 rounded-sm py-2 font-body text-sm font-medium text-teal underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal [&::-webkit-details-marker]:hidden">
            Read the series story and reflections
            <svg aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div
            className="rich-content mt-5 font-body text-base leading-relaxed text-charcoal/75 [&_li]:mb-5 [&_p]:mb-5"
            dangerouslySetInnerHTML={{ __html: story }}
          />
        </details>
      )}
    </section>
  )
}
