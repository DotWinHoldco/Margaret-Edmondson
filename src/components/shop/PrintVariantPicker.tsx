'use client'

import { useEffect, useId, useRef, useState } from 'react'

export interface PrintChoice { id: string; title: string; actualNote: string | null; price: number }
interface ChoiceGroup { label: string; options: PrintChoice[] }

export default function PrintVariantPicker({ groups, value, onSelect, inlineMenu = false }: {
  groups: ChoiceGroup[]; value: string | undefined; onSelect: (id: string) => void; inlineMenu?: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const options = groups.flatMap((group) => group.options)
  const selected = options.find((option) => option.id === value)
  const selectedGroup = groups.find((group) => group.options.some((option) => option.id === value))
  function close() { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')
    const index = options.findIndex((option) => option.id === value)
    buttons?.[Math.max(0, index)]?.focus()
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
    // Focus on opening, without stealing focus during keyboard navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  function lines(option: PrintChoice) {
    return <><span className="block">{option.title} <span className="whitespace-nowrap">— ${option.price.toFixed(2)}</span></span>{option.actualNote && <span className="block text-[9px] leading-4 text-charcoal/70">{option.actualNote}</span>}</>
  }
  return <div ref={root} className="relative" onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false)
  }}>
    <span id={`${id}-label`} className="mb-1.5 block font-body text-xs text-charcoal/70">Choose artwork or print size</span>
    <button ref={trigger} type="button" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`}
      onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}
      className="flex w-full items-center justify-between gap-3 rounded-sm border border-charcoal/15 bg-white px-4 py-3 text-left font-body text-sm text-charcoal focus-visible:outline-2 focus-visible:outline-teal">
      <span id={`${id}-value`}>{selectedGroup && <span className="block text-[10px] text-charcoal/65">{selectedGroup.label}</span>}{selected ? lines(selected) : 'Choose an option'}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div id={`${id}-options`} role="listbox" aria-labelledby={`${id}-label`} className={`${inlineMenu ? 'relative' : 'absolute'} z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-sm border border-charcoal/15 bg-white p-1 shadow-lg`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return }
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : null
        if (next !== null) { event.preventDefault(); buttons[next]?.focus() }
      }}>
      {groups.map((group) => <div key={group.label} role="group" aria-label={group.label}>
        <div aria-hidden="true" className="px-3 pb-1 pt-3 font-body text-[10px] font-semibold uppercase tracking-wide text-charcoal/55">{group.label}</div>
        {group.options.map((option) => <button key={option.id} type="button" role="option" aria-selected={option.id === value} tabIndex={option.id === value ? 0 : -1}
          onClick={() => { onSelect(option.id); close() }} className={`block w-full rounded-sm px-3 py-2 text-left font-body text-sm text-charcoal hover:bg-teal/5 focus:bg-teal/10 focus:outline-none ${option.id === value ? 'bg-teal/5' : ''}`}>
          {lines(option)}
        </button>)}
      </div>)}
    </div>}
  </div>
}
