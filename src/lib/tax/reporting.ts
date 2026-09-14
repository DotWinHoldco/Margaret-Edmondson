import { US_STATE_CODES } from './config'

export const REPORT_PERIODS = ['30d', '90d', '365d', 'quarter', 'year'] as const
export type ReportPeriodKey = typeof REPORT_PERIODS[number]
const ZONE = 'America/Chicago'
const paidStatuses = new Set(['processing', 'shipped', 'delivered', 'refunded', 'disputed'])
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
function dateKey(date: Date) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
function addDays(day: string, count: number) {
  const value = new Date(`${day}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + count)
  return value.toISOString().slice(0, 10)
}
/** Resolve local midnight, including the day a daylight-saving offset changes. */
function midnight(day: string) {
  const target = Date.parse(`${day}T00:00:00Z`)
  const clock = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  let candidate = target + 6 * 3600000
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(clock.formatToParts(candidate).map(part => [part.type, part.value]))
    const localAsUtc = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)
    candidate += target - localAsUtc
  }
  return new Date(candidate).toISOString()
}
export function reportPeriod(key: ReportPeriodKey, now = new Date()) {
  const today = dateKey(now)
  const [year, month] = today.split('-').map(Number)
  const startDate = key === 'year' ? `${year}-01-01` : key === 'quarter' ? `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01` : addDays(today, -(Number(key.slice(0, -1)) - 1))
  const labels = { '30d': 'Last 30 days', '90d': 'Last 90 days', '365d': 'Last 365 days', quarter: 'This calendar quarter', year: 'This calendar year' }
  return { key, label: labels[key], startDate, endDate: today, startInclusive: midnight(startDate), endExclusive: midnight(addDays(today, 1)), timeZone: ZONE, basis: 'Orders created on these dates, using their current refund status. Refund dates and payments to states are not selected by this filter.' }
}
export interface ReportOrder {
  id: string
  order_number: number
  created_at: string | null
  status: string | null
  total: number | string | null
  tax: number | string | null
  tax_included: boolean | null
  shipping_address: unknown
  stripe_mode: string | null
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
}
export interface ReportRefundEvent { id: string; order_id: string; detail: unknown }
export function moneyCents(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && value.trim() === '') || !['number', 'string'].includes(typeof value)) return null
  const number = Number(value)
  const cents = Math.round((number + Number.EPSILON) * 100)
  return Number.isFinite(number) && number >= 0 && Number.isSafeInteger(cents) ? cents : null
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function stateFor(value: unknown) {
  const outer = object(value)
  const address = typeof outer.state === 'string' ? outer : object(outer.address)
  if (typeof address.country === 'string' && address.country.toUpperCase() !== 'US') return 'UNKNOWN'
  const state = typeof address.state === 'string' ? address.state.trim().toUpperCase() : ''
  return US_STATE_CODES.has(state) ? state : 'UNKNOWN'
}
function blankTotals() {
  return { orderCount: 0, taxedOrderCount: 0, includedTaxCents: 0, separateTaxCents: 0, recordedTaxCents: 0, fullRefundTaxCents: 0, netRecordedTaxCents: 0, refundReviewOrderCount: 0, unknownTaxOrderCount: 0 }
}
export function buildTaxReport(orders: ReportOrder[], refunds: ReportRefundEvent[], selectedStates: string[], key: ReportPeriodKey, now = new Date()) {
  const period = reportPeriod(key, now)
  const selected = new Set(selectedStates.filter(state => US_STATE_CODES.has(state)))
  const rows = new Map<string, ReturnType<typeof blankTotals> & { state: string; currentlySelected: boolean }>()
  const rowFor = (state: string) => {
    if (!rows.has(state)) rows.set(state, { state, currentlySelected: selected.has(state), ...blankTotals() })
    return rows.get(state)!
  }
  for (const state of selected) rowFor(state)
  const reviewOrders = new Set<string>()
  const seenRefunds = new Set<string>()
  for (const event of refunds) {
    const detail = object(event.detail)
    const ref = typeof detail.refund_id === 'string' ? detail.refund_id : event.id
    if (seenRefunds.has(ref) || ['failed', 'canceled', 'cancelled'].includes(String(detail.status))) continue
    seenRefunds.add(ref)
    reviewOrders.add(event.order_id)
  }
  const excluded = { testOrders: 0, unknownModeOrders: 0, unpaidOrders: 0, paidCancelledOrders: 0, invalidAmountOrders: 0 }
  const overview = { paidOrderCount: 0, grossCollectedCents: 0, salesBeforeTaxCents: 0 as number | null, fullyRefundedTotalCents: 0, retainedTotalAfterFullRefundsCents: 0, refundReviewOrderCount: 0, unknownTaxOrderCount: 0, averageOrderCents: null as number | null }
  const latestOrders: { id: string; orderNumber: number; createdAt: string; status: string; totalCents: number; taxCents: number | null; state: string; taxIncluded: boolean }[] = []
  let disputes = 0
  for (const order of orders) {
    const created = order.created_at ? Date.parse(order.created_at) : NaN
    if (!Number.isFinite(created) || created < Date.parse(period.startInclusive) || created >= Date.parse(period.endExclusive)) continue
    if (order.stripe_mode === 'test') { excluded.testOrders++; continue }
    if (order.stripe_mode !== 'live') { excluded.unknownModeOrders++; continue }
    if (!paidStatuses.has(order.status || '') || (!order.stripe_payment_intent_id && !order.stripe_checkout_session_id)) {
      if (order.status === 'cancelled' && (order.stripe_payment_intent_id || order.stripe_checkout_session_id)) excluded.paidCancelledOrders++
      else excluded.unpaidOrders++
      continue
    }
    const total = moneyCents(order.total)
    if (total === null) { excluded.invalidAmountOrders++; continue }
    const savedTax = moneyCents(order.tax)
    const tax = savedTax !== null && savedTax <= total ? savedTax : null
    const state = stateFor(order.shipping_address)
    const row = rowFor(state)
    row.orderCount++
    overview.paidOrderCount++
    overview.grossCollectedCents += total
    if (tax === null) { row.unknownTaxOrderCount++; overview.unknownTaxOrderCount++; overview.salesBeforeTaxCents = null }
    else {
      row.recordedTaxCents += tax
      if (tax > 0) row.taxedOrderCount++
      if (order.tax_included === true) row.includedTaxCents += tax
      else row.separateTaxCents += tax
      if (overview.salesBeforeTaxCents !== null) overview.salesBeforeTaxCents += total - tax
      if (order.status === 'refunded') row.fullRefundTaxCents += tax
    }
    if (order.status === 'refunded') overview.fullyRefundedTotalCents += total
    else if (reviewOrders.has(order.id)) { row.refundReviewOrderCount++; overview.refundReviewOrderCount++ }
    if (order.status === 'disputed') disputes++
    latestOrders.push({ id: order.id, orderNumber: order.order_number, createdAt: new Date(created).toISOString(), status: order.status!, totalCents: total, taxCents: tax, state, taxIncluded: order.tax_included === true })
  }
  const totals = blankTotals()
  for (const row of rows.values()) {
    row.netRecordedTaxCents = row.recordedTaxCents - row.fullRefundTaxCents
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += row[key]
  }
  overview.retainedTotalAfterFullRefundsCents = overview.grossCollectedCents - overview.fullyRefundedTotalCents
  overview.averageOrderCents = overview.paidOrderCount ? Math.round(overview.grossCollectedCents / overview.paidOrderCount) : null
  const notices = [
    'Amounts come from saved live orders, not today’s tax settings. Sales before tax includes shipping and discounts; it is not profit.',
    'Refund deductions use the current fully refunded order status, even if the refund happened after this order period. They are not filing-period tax credits.',
    'Partial refund tax, refunds made directly in Stripe, fees, disputes, and payments sent to a state are not fully tracked here. Net recorded tax is not the amount still owed to a state. Compare Stripe and state records before filing.',
    'Orders without a creation date cannot be placed in a date range. Test orders, unknown payment modes, unpaid, failed, and cancelled orders are excluded.',
  ]
  if (overview.refundReviewOrderCount) notices.push(`${overview.refundReviewOrderCount} order(s) have refund requests without a final tax allocation. No partial tax credit has been guessed or deducted.`)
  if (overview.unknownTaxOrderCount) notices.push(`${overview.unknownTaxOrderCount} order(s) have no usable saved tax amount. Tax totals are incomplete and sales before tax is unavailable.`)
  if (rows.get('UNKNOWN')?.orderCount) notices.push(`${rows.get('UNKNOWN')!.orderCount} order(s) have no usable US delivery state. Their amounts are shown under Unknown state.`)
  if (excluded.unknownModeOrders) notices.push(`${excluded.unknownModeOrders} order(s) have an unknown live/test payment mode and are excluded until reviewed.`)
  if (excluded.paidCancelledOrders) notices.push(`${excluded.paidCancelledOrders} cancelled order(s) still have payment references and are excluded. Cancellation alone does not prove a refund. Review Stripe so captured sales and tax are not missed.`)
  if (excluded.invalidAmountOrders) notices.push(`${excluded.invalidAmountOrders} order(s) have unusable saved totals and are excluded. Review their payment records.`)
  if (disputes) notices.push(`${disputes} disputed order(s) remain in recorded sales and tax until a confirmed full refund is recorded. Review those payments.`)
  return { period, rows: [...rows.values()].sort((a, b) => a.state.localeCompare(b.state)), totals, overview, latestOrders: latestOrders.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, 25), notices, excluded, generatedAt: now.toISOString() }
}

/** Read every page; a database error must never become a partial financial total. */
export async function readAllReportPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await fetchPage(offset, offset + 999)
    if (error || !data) throw new Error('The report could not read all order records. Please try again.')
    all.push(...data)
    if (data.length < 1000) return all
  }
}
