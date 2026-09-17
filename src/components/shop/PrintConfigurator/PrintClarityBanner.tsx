// Authored by DotWin
// The one sentence that keeps a print from being mistaken for the original. The legacy
// size picker and the configurator both render it, from here, so the reassurance a
// shopper reads does not depend on which purchase panel the store has switched on.

export default function PrintClarityBanner({ title }: { title: string }) {
  return (
    <div className="mt-3 flex items-start gap-3 px-4 py-3 bg-teal/5 border border-teal/15 rounded-sm">
      <svg className="w-5 h-5 text-teal flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
      </svg>
      <div>
        <p className="font-body text-sm text-charcoal/80">
          You&apos;re purchasing a <strong>print reproduction</strong>
        </p>
        <p className="font-body text-xs text-charcoal/50 mt-0.5">
          Gallery-quality stretched canvas of &ldquo;{title}&rdquo; by Margaret Edmondson
        </p>
      </div>
    </div>
  )
}
