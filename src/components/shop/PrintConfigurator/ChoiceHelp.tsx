'use client'

import { useId, useState, type ReactNode } from 'react'

/** Reveal short explanations beside unfamiliar print choices without adding a long page section. */
export default function ChoiceHelp({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return <div className="mt-2">
    <button type="button" aria-label={`About ${label}`} aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)} className="inline-flex min-h-9 items-center gap-2 text-left font-body text-xs text-teal focus-visible:outline-2 focus-visible:outline-teal">
      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full border border-current font-semibold">?</span>
      {label}
    </button>
    {open && <div id={id} className="mt-1 rounded-sm border border-teal/20 bg-teal/5 p-3 font-body text-sm leading-relaxed text-charcoal/80">{children}</div>}
  </div>
}
