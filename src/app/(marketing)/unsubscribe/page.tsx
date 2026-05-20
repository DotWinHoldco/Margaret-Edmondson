import Link from 'next/link'

export const metadata = {
  title: 'Unsubscribed',
  robots: { index: false, follow: false },
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams
  const ok = params.ok === '1'
  const error = typeof params.error === 'string' ? params.error : null

  return (
    <div className="py-20 sm:py-28">
      <div className="mx-auto max-w-xl px-4 sm:px-6 text-center">
        {ok ? (
          <>
            <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">You&apos;re unsubscribed.</h1>
            <div className="mt-3 mx-auto w-16 h-px bg-gold" />
            <p className="mt-4 font-body text-charcoal/60">
              You will no longer receive studio updates. Order receipts and shipping notices still come through.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">Something went wrong</h1>
            <div className="mt-3 mx-auto w-16 h-px bg-gold" />
            <p className="mt-4 font-body text-charcoal/60">
              {error === 'missing' && 'No unsubscribe token found in the link.'}
              {error === 'not_found' && 'We could not find a matching contact.'}
              {error === 'expired' && 'That unsubscribe link has expired. Please reach out and we will remove you manually.'}
              {error === 'bad_signature' && 'That unsubscribe link is invalid.'}
              {!error && 'Please use the unsubscribe link in any recent ArtByME email, or reply asking us to remove you.'}
            </p>
            <p className="mt-3 font-body text-sm text-charcoal/50">
              Email <a href="mailto:hello@artbyme.studio" className="text-teal underline-offset-2 hover:underline">hello@artbyme.studio</a> and we will take care of it.
            </p>
          </>
        )}

        <div className="mt-10">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-sm border border-charcoal/15 bg-white px-6 py-3 font-body text-sm font-medium text-charcoal hover:bg-charcoal/5"
          >
            Back to the studio
          </Link>
        </div>
      </div>
    </div>
  )
}
