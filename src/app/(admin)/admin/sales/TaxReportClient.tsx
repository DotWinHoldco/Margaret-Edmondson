'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { apiFetch, errorMessage } from '@/lib/api/client'

const PERIODS = [
  ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['quarter', 'This quarter'],
  ['365d', 'Last 365 days'], ['year', 'This year'],
] as const

type PeriodKey = typeof PERIODS[number][0]
interface TaxAmounts {
  orderCount: number
  taxedOrderCount: number
  includedTaxCents: number
  separateTaxCents: number
  recordedTaxCents: number
  fullRefundTaxCents: number
  netRecordedTaxCents: number
  refundReviewOrderCount: number
  unknownTaxOrderCount: number
}
interface TaxRow extends TaxAmounts {
  state: string
  currentlySelected: boolean
}
interface TaxReport {
  period: { key: PeriodKey; label: string; startDate: string; endDate: string; startInclusive: string; endExclusive: string; timeZone: string; basis: string }
  rows: TaxRow[]
  totals: TaxAmounts
  notices: string[]
  excluded: { testOrders: number; unknownModeOrders: number; unpaidOrders: number; paidCancelledOrders: number; invalidAmountOrders: number }
  generatedAt: string
  overview: { paidOrderCount: number; grossCollectedCents: number; salesBeforeTaxCents: number | null; fullyRefundedTotalCents: number; retainedTotalAfterFullRefundsCents: number; refundReviewOrderCount: number; unknownTaxOrderCount: number; averageOrderCents: number | null }
  latestOrders: Array<{ id: string; orderNumber: number; createdAt: string; status: string; totalCents: number; taxCents: number | null; state: string; taxIncluded: boolean }>
}

const dollars = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const linkClass = 'font-medium text-teal underline decoration-teal/40 underline-offset-4 hover:text-deep-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal'
const buttonClass = 'rounded-lg border border-charcoal/20 bg-white px-4 py-2.5 text-sm font-medium text-charcoal hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-50'
const STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
] as const
const stateLabel = (state: string) => state === 'UNKNOWN' ? 'State needs review' : `${STATES.find(([code]) => code === state)?.[1] ?? state} (${state})`

function displayDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function downloadCsv(report: TaxReport) {
  const headers = ['State', 'Currently selected', 'Orders', 'Orders with recorded tax', 'Included tax USD', 'Added tax USD', 'Recorded tax USD', 'Full refund tax USD', 'Net recorded tax USD', 'Refunds to review', 'Orders with unknown tax']
  const cells = (row: TaxAmounts, state: string, selected: string) => [state, selected, row.orderCount, row.taxedOrderCount, (row.includedTaxCents / 100).toFixed(2), (row.separateTaxCents / 100).toFixed(2), (row.recordedTaxCents / 100).toFixed(2), (row.fullRefundTaxCents / 100).toFixed(2), (row.netRecordedTaxCents / 100).toFixed(2), row.refundReviewOrderCount, row.unknownTaxOrderCount]
  const rows = [
    ['Sales tax tracker', report.period.label],
    ['Start date', report.period.startDate, 'End date (inclusive)', report.period.endDate, 'Time zone', report.period.timeZone],
    ['Report basis', report.period.basis],
    ['Note', 'State payments and unrecorded refunds are not subtracted. This is not a filing-period transaction ledger.'],
    [], headers,
    ...report.rows.map((row) => cells(row, stateLabel(row.state), row.currentlySelected ? 'Yes' : 'No')),
    cells(report.totals, 'TOTAL', ''),
  ]
  const escape = (cell: string | number) => {
    let text = String(cell)
    if (typeof cell === 'string' && /^[=+@\-\t\r]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  const csv = '\uFEFF' + rows.map((row) => row.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `artbyme-sales-tax-${report.period.startDate}-to-${report.period.endDate}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function TaxReportClient({ children }: { children?: ReactNode }) {
  const scrolledToSection = useRef(false)
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [refresh, setRefresh] = useState(0)
  const [report, setReport] = useState<TaxReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await apiFetch<TaxReport>(`/api/admin/tax-report?period=${period}`)
        if (!cancelled) setReport(data)
      } catch (err) {
        if (!cancelled) setError(errorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [period, refresh])

  useEffect(() => {
    if (!loading && !error && report && !scrolledToSection.current && ['#sales-tax', '#feedback', '#quick-links', '#sales-overview'].includes(window.location.hash)) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' })
      scrolledToSection.current = true
    }
  }, [loading, error, report])

  return (
    <div className="space-y-6 pb-8 font-sans text-charcoal">
      <header id="sales-overview" className="flex scroll-mt-8 flex-wrap items-end justify-between gap-3 pt-3">
        <div><h2 className="font-serif text-3xl font-semibold sm:text-4xl">Your sales at a glance</h2><p className="mt-2 text-sm leading-6 text-charcoal/65">Real order records. One period for your sales and state tax totals.</p></div>
        <Link href="/admin/help/20-daily-business-routine" className={`${linkClass} text-sm`}>Help reading your numbers</Link>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-charcoal/10 bg-white p-5">
        <div>
          <label htmlFor="tax-report-period" className="mb-2 block text-sm font-semibold">Reporting period</label>
          <select id="tax-report-period" value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)} className="min-w-48 rounded-lg border border-charcoal/20 bg-cream px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20">
            {PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)} className={buttonClass}>Refresh report</button>
          <button type="button" disabled={loading || !!error || !report} onClick={() => report && downloadCsv(report)} className={buttonClass}>Download CSV</button>
          <Link className={`${linkClass} text-sm`} href="/admin/orders?view=all">View all orders</Link>
          <Link className={`${linkClass} text-sm`} href="/admin/settings#sales-tax">Sales tax settings</Link>
        </div>
      </div>

      {(loading || error || !report) && children}

      {loading ? <div className="rounded-xl border border-charcoal/10 bg-white p-8" role="status">Loading your sales dashboard…</div> : error ? (
        <div className="rounded-xl border border-coral/30 bg-white p-6"><p role="alert" className="text-coral">{error}</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className={`${buttonClass} mt-4`}>Try again</button></div>
      ) : report && (
        <>
          <div className="text-sm leading-6 text-charcoal/70">
            <p className="font-semibold text-charcoal">{displayDate(report.period.startDate)} – {displayDate(report.period.endDate)} · America/Chicago time</p>
            <p>{report.period.basis}</p>
          </div>
          <section aria-label="Sales overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Paid orders', value: String(report.overview.paidOrderCount), detail: 'Paid live orders created in this period.' },
              { label: 'Recorded sales before tax', value: report.overview.salesBeforeTaxCents == null ? 'Needs review' : dollars(report.overview.salesBeforeTaxCents), detail: 'Recorded order totals minus known tax, before refunds. Includes shipping.' },
              { label: 'Recorded order totals', value: dollars(report.overview.grossCollectedCents), detail: 'Order amounts including shipping and tax, before refunds.' },
              { label: 'Average order total', value: report.overview.averageOrderCents == null ? '—' : dollars(report.overview.averageOrderCents), detail: 'Average recorded amount per paid order, before refunds.' },
            ].map((card) => <div key={card.label} className="rounded-2xl border border-charcoal/10 bg-white p-5 shadow-[0_2px_12px_rgba(44,44,44,0.025)]"><h3 className="text-sm font-semibold">{card.label}</h3><p className="mt-3 text-3xl font-semibold text-teal">{card.value}</p><p className="mt-3 text-sm leading-6 text-charcoal/65">{card.detail}</p></div>)}
          </section>
          <div className="rounded-xl border border-charcoal/10 bg-white p-5 text-sm leading-6">
            <p><strong>Full refunds recorded:</strong> {dollars(report.overview.fullyRefundedTotalCents)}. <strong>Order totals after those full refunds:</strong> {dollars(report.overview.retainedTotalAfterFullRefundsCents)}.</p>
            <p className="mt-1 text-charcoal/65">These are sales records, not profit or your bank balance. Costs, payment fees, state tax payments, and partial refunds are not subtracted from this sales overview.</p>
          </div>
          {children}
          <section id="sales-tax" className="scroll-mt-8" aria-labelledby="sales-tax-tracker-title"><h2 id="sales-tax-tracker-title" className="font-serif text-3xl font-semibold">Sales tax tracker</h2><p className="mt-2 text-sm leading-6 text-charcoal/65">Tax included in your prices and tax added at checkout both belong in the money you set aside.</p></section>
          <section aria-label="Sales tax totals" className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-teal/25 bg-teal/10 p-5">
              <h2 className="text-sm font-semibold text-deep-teal">Recorded tax to set aside</h2>
              <p className="mt-3 text-3xl font-semibold text-deep-teal">{dollars(report.totals.netRecordedTaxCents)}</p>
              <p className="mt-3 text-sm leading-6 text-charcoal/70">Recorded tax minus tax on orders marked fully refunded.</p>
            </div>
            <div className="rounded-xl border border-charcoal/10 bg-white p-5">
              <h2 className="text-sm font-semibold">Tax included in prices</h2>
              <p className="mt-3 text-3xl font-semibold text-teal">{dollars(report.totals.includedTaxCents)}</p>
              <p className="mt-3 text-sm leading-6 text-charcoal/65">This tax came out of the listed prices. It is part of the recorded tax total.</p>
            </div>
            <div className="rounded-xl border border-charcoal/10 bg-white p-5">
              <h2 className="text-sm font-semibold">Tax added at checkout</h2>
              <p className="mt-3 text-3xl font-semibold text-teal">{dollars(report.totals.separateTaxCents)}</p>
              <p className="mt-3 text-sm leading-6 text-charcoal/65">This tax was added on top of prices. It is part of the recorded tax total.</p>
            </div>
          </section>
          <div className="rounded-xl border border-charcoal/15 bg-cream p-5 text-sm leading-6">
            <p className="font-semibold">This is a money reminder, not your final tax bill.</p>
            <p className="mt-1">Payments you already sent to a state are not tracked or subtracted here. Refunds made outside the recorded order data may also be missing. Compare this report with your payment records and Stripe tax reports before filing.</p>
          </div>
          {(report.totals.refundReviewOrderCount > 0 || report.totals.unknownTaxOrderCount > 0 || report.excluded.paidCancelledOrders > 0 || report.excluded.invalidAmountOrders > 0) && (
            <div className="rounded-xl border border-coral/30 bg-white p-5 text-sm leading-6" role="status">
              <p className="font-semibold text-coral">Some records need a closer look.</p>
              {report.excluded.paidCancelledOrders > 0 && <p className="mt-1">{report.excluded.paidCancelledOrders} cancelled order(s) still have payment references. Their amounts are excluded; review the payments in Stripe.</p>}
              {report.excluded.invalidAmountOrders > 0 && <p className="mt-1">{report.excluded.invalidAmountOrders} order(s) have amounts that cannot be read reliably and are excluded. The totals may be incomplete.</p>}
              {report.totals.refundReviewOrderCount > 0 && <p className="mt-1">{report.totals.refundReviewOrderCount} order(s) have refunds to review. The refunded tax amount is not known, so it has not been guessed or subtracted.</p>}
              {report.totals.unknownTaxOrderCount > 0 && <p className="mt-1">{report.totals.unknownTaxOrderCount} order(s) do not have a reliable tax amount. The totals may be incomplete.</p>}
            </div>
          )}

          <section aria-labelledby="tax-state-totals-title" className="overflow-hidden rounded-xl border border-charcoal/10 bg-white">
            <div className="p-5"><h2 id="tax-state-totals-title" className="font-serif text-2xl font-semibold">Tax by state</h2><p className="mt-2 text-sm leading-6 text-charcoal/65">Included tax + added tax = recorded tax. Subtract full-refund tax to get the net recorded amount. All amounts are in US dollars.</p></div>
            {report.rows.length === 0 ? <div className="border-t border-charcoal/10 p-6 text-sm leading-6"><p className="font-semibold">No state tax records for this period.</p><p className="mt-1 text-charcoal/65">Try a longer period or review your sales tax settings. This report will fill in as paid live orders record their tax details.</p></div> : (
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="State tax table, scroll sideways on smaller screens">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="border-y border-charcoal/10 bg-cream text-xs text-charcoal/65"><tr>{['State', 'Orders', 'Included tax', 'Added tax', 'Recorded tax', 'Full-refund tax', 'Net recorded tax', 'Review'].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
                  <tbody>{report.rows.map((row) => <tr key={row.state} className="border-b border-charcoal/10 align-top last:border-b-0">
                    <th scope="row" className="px-4 py-4 font-semibold">{stateLabel(row.state)}{!row.currentlySelected && row.state !== 'UNKNOWN' && <span className="mt-1 block whitespace-nowrap text-xs font-normal text-charcoal/50">Not selected now</span>}</th>
                    <td className="px-4 py-4 tabular-nums">{row.orderCount}<span className="mt-1 block whitespace-nowrap text-xs text-charcoal/50">{row.taxedOrderCount} with tax</span></td>
                    <td className="px-4 py-4 tabular-nums">{dollars(row.includedTaxCents)}</td><td className="px-4 py-4 tabular-nums">{dollars(row.separateTaxCents)}</td><td className="px-4 py-4 tabular-nums">{dollars(row.recordedTaxCents)}</td><td className="px-4 py-4 tabular-nums">{dollars(row.fullRefundTaxCents)}</td><td className="px-4 py-4 font-semibold tabular-nums text-teal">{dollars(row.netRecordedTaxCents)}</td>
                    <td className="px-4 py-4 text-xs leading-5 text-charcoal/65">{row.refundReviewOrderCount > 0 && <p>{row.refundReviewOrderCount} refund(s)</p>}{row.unknownTaxOrderCount > 0 && <p>{row.unknownTaxOrderCount} unknown tax</p>}{row.refundReviewOrderCount === 0 && row.unknownTaxOrderCount === 0 && <span>—</span>}</td>
                  </tr>)}</tbody>
                  <tfoot className="border-t border-charcoal/15 bg-cream font-semibold"><tr><th scope="row" className="px-4 py-4">Total</th><td className="px-4 py-4">{report.totals.orderCount}</td><td className="px-4 py-4">{dollars(report.totals.includedTaxCents)}</td><td className="px-4 py-4">{dollars(report.totals.separateTaxCents)}</td><td className="px-4 py-4">{dollars(report.totals.recordedTaxCents)}</td><td className="px-4 py-4">{dollars(report.totals.fullRefundTaxCents)}</td><td className="px-4 py-4 text-teal">{dollars(report.totals.netRecordedTaxCents)}</td><td className="px-4 py-4">—</td></tr></tfoot>
                </table>
              </div>
            )}
          </section>
          <section aria-labelledby="recent-sales-title" className="overflow-hidden rounded-xl border border-charcoal/10 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 id="recent-sales-title" className="font-serif text-2xl font-semibold">Recent orders in this period</h2><p className="mt-2 text-sm text-charcoal/65">The latest 25 paid live orders. Open an order to see its details.</p></div><Link className={`${linkClass} text-sm`} href="/admin/orders?view=all">View all orders</Link></div>
            {report.latestOrders.length === 0 ? <p className="border-t border-charcoal/10 p-5 text-sm text-charcoal/65">No paid live orders in this period yet. Try a longer reporting period.</p> : <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Recent orders table, scroll sideways on smaller screens"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-y border-charcoal/10 bg-cream text-xs text-charcoal/65"><tr>{['Order', 'Created', 'State', 'Status', 'Order total', 'Tax'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{report.latestOrders.map((order) => <tr key={order.id} className="border-b border-charcoal/10 last:border-b-0"><th scope="row" className="px-4 py-4"><Link href={`/admin/orders/${order.id}`} className={linkClass}>{order.orderNumber || order.id.slice(0, 8)}</Link></th><td className="whitespace-nowrap px-4 py-4">{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })}</td><td className="px-4 py-4">{stateLabel(order.state)}</td><td className="px-4 py-4 capitalize">{order.status.replaceAll('_', ' ')}</td><td className="px-4 py-4 tabular-nums">{dollars(order.totalCents)}</td><td className="px-4 py-4 tabular-nums">{order.taxCents == null ? 'Needs review' : dollars(order.taxCents)}{order.taxCents != null && order.taxCents > 0 && <span className="mt-1 block text-xs text-charcoal/55">{order.taxIncluded ? 'Included' : 'Added'}</span>}</td></tr>)}</tbody></table></div>}
          </section>
          <section aria-labelledby="tax-report-reading-title" className="rounded-xl border border-charcoal/10 bg-white p-5 text-sm leading-6">
            <h2 id="tax-report-reading-title" className="font-serif text-2xl font-semibold">How to read this report</h2>
            <p className="mt-3">Think of tax as money in a jar with the state’s name on it. If one order includes $8 in tax and another adds $2, you have $10 in recorded tax. A fully refunded order can lower that amount.</p>
            <p className="mt-3">Dates choose when orders were created. A refund recorded later can still change the figures for that older order. Changing your nexus selections does not erase past sales.</p>
            <p className="mt-3 text-charcoal/65">Orders left out: {report.excluded.testOrders} test, {report.excluded.unknownModeOrders} unknown payment mode, {report.excluded.unpaidOrders} unpaid or ineligible, and {report.excluded.invalidAmountOrders} with unusable totals. {report.excluded.paidCancelledOrders > 0 ? `${report.excluded.paidCancelledOrders} cancelled orders with payment references need review.` : ''}</p>
            {report.notices.length > 0 && <details className="mt-4 rounded-lg border border-charcoal/10 p-4"><summary className="cursor-pointer font-semibold text-teal">Data notes for this report</summary><ul className="mt-3 list-disc space-y-2 pl-5">{report.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul></details>}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2"><Link href="/admin/help/12-sales-tax-and-nexus" className={linkClass}>Understand sales tax and nexus</Link><Link href="/admin/help/13-texas-sales-tax-setup" className={linkClass}>Texas setup guide</Link><a href="https://dashboard.stripe.com/tax/reports" target="_blank" rel="noopener noreferrer" className={linkClass}>Open Stripe tax reports ↗</a></div>
            <p className="mt-4 text-xs text-charcoal/50">Report updated {new Date(report.generatedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} · America/Chicago.</p>
          </section>
        </>
      )}
    </div>
  )
}
