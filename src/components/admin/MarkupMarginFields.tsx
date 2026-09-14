'use client'

import { useEffect, useId, useState } from 'react'
import { displayPercent, markupToGrossMargin, parsePricingInput, pricingRelationship } from '@/lib/pricing/markup-margin'

export interface MarkupMarginFieldsProps {
  value: string
  inheritedMarkup?: number
  onChange: (markup: string) => void
  onCommit?: (markup: string) => void
  onValidityChange?: (valid: boolean) => void
  disabled?: boolean
  readOnly?: boolean
  labelPrefix?: string
  compact?: boolean
  maxMarkup?: number
}

const grossDisplay = (markup: number) => {
  const gross = markupToGrossMargin(markup)
  return gross !== null && gross < 100 && Number(displayPercent(gross)) >= 100 ? '99.9999' : displayPercent(gross)
}

export function MarkupMarginFields({ value, inheritedMarkup, onChange, onCommit, onValidityChange, disabled = false, readOnly = false, labelPrefix = '', compact = false, maxMarkup = Infinity }: MarkupMarginFieldsProps) {
  const id = useId()
  // Retain the field being typed, including incomplete input. Parent updates
  // from a different record/reset supersede this draft without an effect reset.
  const [draft, setDraft] = useState<{ kind: 'markup' | 'gross'; text: string; parentValue: string } | null>(null)
  const activeDraft = draft?.parentValue === value ? draft : null
  const parsed = readOnly ? { valid: true as const, markup: value, error: null } : parsePricingInput(activeDraft?.text ?? value, activeDraft?.kind ?? 'markup', maxMarkup)
  const valid = parsed.valid
  useEffect(() => { onValidityChange?.(valid) }, [onValidityChange, valid])

  const markupText = activeDraft?.kind === 'markup' ? activeDraft.text : value === '' ? '' : displayPercent(Number(value))
  const grossText = activeDraft?.kind === 'gross' ? activeDraft.text : value === '' ? '' : grossDisplay(Number(value))
  function change(kind: 'markup' | 'gross', text: string) {
    const result = parsePricingInput(text, kind, maxMarkup)
    setDraft({ kind, text, parentValue: result.valid ? result.markup : value })
    onValidityChange?.(result.valid)
    if (result.valid) onChange(result.markup)
  }
  function commit() {
    if (!disabled && !readOnly && parsed.valid) onCommit?.(parsed.markup)
  }
  const inputClass = `mt-1 w-full min-w-0 rounded border border-charcoal/20 bg-white font-body text-sm disabled:opacity-50 read-only:bg-cream ${compact ? 'px-2 py-1' : 'px-3 py-2'}`
  const prefix = labelPrefix ? `${labelPrefix} ` : ''
  return <div className="min-w-0">
    <div className={`grid grid-cols-2 ${compact ? 'gap-2' : 'gap-3'}`}>
      <label htmlFor={`${id}-markup`} className="min-w-0 font-body text-xs text-charcoal/70">Markup (%)
        <input id={`${id}-markup`} aria-label={`${prefix}Markup (%)`} type="text" inputMode="decimal" value={markupText} placeholder={displayPercent(inheritedMarkup)} disabled={disabled} readOnly={readOnly} aria-invalid={!valid || undefined} aria-describedby={!valid ? `${id}-error` : undefined} onChange={event => change('markup', event.target.value)} onBlur={commit} className={inputClass} />
      </label>
      <label htmlFor={`${id}-gross`} className="min-w-0 font-body text-xs text-charcoal/70">Gross margin (%)
        <input id={`${id}-gross`} aria-label={`${prefix}Gross margin (%)`} type="text" inputMode="decimal" value={grossText} placeholder={inheritedMarkup == null ? '' : grossDisplay(inheritedMarkup)} disabled={disabled} readOnly={readOnly} aria-invalid={!valid || undefined} aria-describedby={!valid ? `${id}-error` : undefined} onChange={event => change('gross', event.target.value)} onBlur={commit} className={inputClass} />
      </label>
    </div>
    {!valid && <p id={`${id}-error`} role="alert" className="mt-1 font-body text-xs text-coral">{parsed.error}</p>}
    {readOnly && value !== '' && Number(value) <= -100 && <p className="mt-1 font-body text-xs text-charcoal/60">Gross margin is unavailable when the selling price is zero.</p>}
  </div>
}

export default MarkupMarginFields

const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
export function PricingRelationship({ landedCostCents, priceCents, markupPct }: { landedCostCents?: number; priceCents?: number; markupPct?: number }) {
  const example = landedCostCents == null || !Number.isFinite(landedCostCents)
  const result = pricingRelationship(example ? { landedCostCents: 2000, markupPct: markupPct ?? 100 } : { landedCostCents, priceCents, markupPct: markupPct ?? 100 })
  if (!result) return <p className="font-body text-xs text-charcoal/60">Enter valid costs and a selling price to see this calculation.</p>
  const cost = money(result.landedCostCents)
  const price = money(result.priceCents)
  const profit = money(result.grossProfitCents)
  return <div className="space-y-1 font-body text-xs leading-5 text-charcoal/70">
    {example && <p className="font-semibold">Example using a $20 cost</p>}
    {result.markupPct !== null ? <><p>Landed cost × (1 + markup % ÷ 100) = selling price.</p><p>{cost} × (1 + {displayPercent(result.markupPct)} ÷ 100) = {price}.</p></> : <p>Markup cannot be calculated from a $0 cost. Add your costs to compare prices.</p>}
    <p>{price} price − {cost} cost = {profit} gross profit.</p>
    {result.grossMarginPct !== null ? <p>{profit} profit ÷ {price} price × 100 = {displayPercent(result.grossMarginPct)}% gross margin.</p> : <p>Gross margin cannot be calculated from a $0 selling price.</p>}
    <p>These numbers come before other expenses, discounts, and any tax included in the price.</p>
  </div>
}
