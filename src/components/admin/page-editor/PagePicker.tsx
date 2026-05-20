'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { PageSchema } from '@/lib/page-editor/types'

interface Props {
  schemas: PageSchema[]
  currentSlug: string
}

export default function PagePicker({ schemas, currentSlug }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const current = schemas.find((s) => s.slug === currentSlug) ?? schemas[0]

  // Group schemas by category for visual structure.
  const groups: Array<{ title: string; items: PageSchema[] }> = [
    { title: 'Site content', items: schemas.filter((s) => s.category === 'content') },
    { title: 'Legal', items: schemas.filter((s) => s.category === 'legal') },
    { title: 'Custom pages', items: schemas.filter((s) => s.category === 'custom' as PageSchema['category']) },
    { title: 'Other catalogs', items: schemas.filter((s) => s.category === 'external') },
  ].filter((g) => g.items.length > 0)

  function go(slug: string, schema: PageSchema) {
    setOpen(false)
    if (schema.category === 'external' && schema.externalHref) {
      router.push(schema.externalHref)
      return
    }
    const params = new URLSearchParams(searchParams.toString())
    params.set('slug', slug)
    router.replace(`/admin/pages?${params.toString()}`)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-sm border border-charcoal/15 bg-white px-4 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5"
      >
        <span className="font-body text-xs uppercase tracking-[0.18em] text-charcoal/50">Editing</span>
        <span className="font-display text-base text-charcoal">{current?.title ?? 'Pick a page'}</span>
        <svg className={`h-4 w-4 text-charcoal/40 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-sm border border-charcoal/15 bg-white shadow-xl">
          {groups.map((group, gi) => (
            <div key={group.title} className={gi > 0 ? 'border-t border-charcoal/10' : ''}>
              <p className="px-3 py-2 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-charcoal/40">
                {group.title}
              </p>
              <ul>
                {group.items.map((s) => {
                  const isCurrent = s.slug === currentSlug
                  return (
                    <li key={s.slug}>
                      <button
                        type="button"
                        onClick={() => go(s.slug, s)}
                        className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-teal/5 ${
                          isCurrent ? 'bg-teal/10' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`truncate font-body text-sm ${isCurrent ? 'font-semibold text-teal' : 'text-charcoal'}`}>
                            {s.title}
                          </p>
                          {s.hint && <p className="truncate font-body text-xs text-charcoal/45">{s.hint}</p>}
                        </div>
                        {s.category === 'external' && (
                          <svg className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-charcoal/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7-7 7M3 12h18" />
                          </svg>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
