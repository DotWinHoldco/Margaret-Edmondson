'use client'

import { useState } from 'react'
import { customerPriceCents, grossMarginPct } from '@/lib/pricing/variant-pricing'

const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
export default function MarginCalculator() {
  const [print, setPrint] = useState('15')
  const [shipping, setShipping] = useState('5')
  const [markup, setMarkup] = useState('100')
  const [manual, setManual] = useState(false)
  const [manualPrice, setManualPrice] = useState('50')
  const values = [print, shipping, markup, ...(manual ? [manualPrice] : [])]
  const valid = values.every((value) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1000000)
  const cost = Math.round(Number(print) * 100)
  const ship = Math.round(Number(shipping) * 100)
  const price = valid ? customerPriceCents({ lumaprints_cost_cents: cost, shipping_cost_cents: ship, margin_override_pct: null, manual_price_override_cents: manual ? Math.round(Number(manualPrice) * 100) : null }, Number(markup)) : 0
  const gross = grossMarginPct(price, cost, ship)
  return (
    <section className="rounded-xl border border-teal/25 bg-teal/5 p-5 sm:p-7" aria-labelledby="margin-calculator-title">
      <h2 id="margin-calculator-title" className="font-display text-2xl font-semibold">Try the math with your own numbers</h2>
      <p className="mt-2 text-sm leading-6 text-charcoal/70">This learning calculator changes no shop settings. It uses the same cost-plus math as automatic Lumaprints prices. It does not subtract tax, discounts, payment fees, or your other expenses.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {[{ id: 'help-print-cost', label: 'Print cost ($)', value: print, set: setPrint }, { id: 'help-shipping-cost', label: 'Stored shipping cost ($)', value: shipping, set: setShipping }, { id: 'help-markup', label: 'Markup (%)', value: markup, set: setMarkup }].map((field) => <label key={field.id} htmlFor={field.id} className="text-sm font-medium">{field.label}<input id={field.id} type="number" min="0" max="1000000" step="0.01" disabled={manual && field.id === 'help-markup'} value={field.value} onChange={(event) => field.set(event.target.value)} className="mt-2 block w-full rounded-lg border border-charcoal/20 bg-white px-3 py-2 disabled:opacity-40" /></label>)}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={manual} onChange={(event) => setManual(event.target.checked)} className="h-4 w-4 accent-teal" />Try a manual selling price instead</label>
      {manual && <label htmlFor="help-manual-price" className="mt-4 block text-sm">Manual price ($)<input id="help-manual-price" type="number" min="0" max="1000000" step="0.01" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} className="mt-2 block w-full max-w-xs rounded-lg border border-charcoal/20 bg-white px-3 py-2" /></label>}
      <div className="mt-5" aria-live="polite" aria-atomic="true">
        {valid ? <><dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
          ['Landed cost', money(cost + ship)], ['Selling price', money(price)], ['Gross profit', money(price - cost - ship)], ['Gross margin', price > 0 ? `${gross.toFixed(1)}%` : '—'],
        ].map(([label, value]) => <div key={label} className="rounded-lg bg-white p-3"><dt className="text-xs text-charcoal/65">{label}</dt><dd className="mt-1 text-xl font-semibold text-teal">{value}</dd></div>)}</dl><p className="mt-3 text-sm leading-6">{money(price)} selling price − {money(cost)} printing − {money(ship)} shipping = {money(price - cost - ship)} before other expenses.{price <= 0 ? ' Gross margin needs a selling price above zero.' : ` That is ${gross.toFixed(1)}% of the selling price.`}</p></> : <p className="rounded-lg bg-white p-4 text-sm">Enter a number from 0 to 1,000,000 in each field to see the example.</p>}
      </div>
    </section>
  )
}
