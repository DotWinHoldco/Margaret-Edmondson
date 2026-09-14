import { describe, expect, it, vi } from 'vitest'
import { buildTaxReport, moneyCents, readAllReportPages, reportPeriod, type ReportOrder } from '@/lib/tax/reporting'
const now = new Date('2026-09-14T18:00:00Z')
const order = (value: Partial<ReportOrder> = {}): ReportOrder => ({ id: 'o1', order_number: 1, created_at: '2026-09-10T12:00:00Z', status: 'processing', total: 108.25, tax: 8.25, tax_included: false, shipping_address: { country: 'US', state: 'TX' }, stripe_mode: 'live', stripe_payment_intent_id: 'pi_fixture', stripe_checkout_session_id: null, ...value })

describe('Chicago report periods', () => {
  it('uses calendar days inclusive today and an exclusive next-day boundary', () => {
    expect(reportPeriod('30d', now)).toMatchObject({ startDate: '2026-08-16', endDate: '2026-09-14', startInclusive: '2026-08-16T05:00:00.000Z', endExclusive: '2026-09-15T05:00:00.000Z' })
    expect(reportPeriod('quarter', now).startDate).toBe('2026-07-01')
    expect(reportPeriod('year', now).startInclusive).toBe('2026-01-01T06:00:00.000Z')
  })
  it('handles spring and fall daylight-saving days with their actual 23/25-hour bounds', () => {
    const spring = reportPeriod('30d', new Date('2026-03-08T18:00:00Z'))
    expect(spring.endExclusive).toBe('2026-03-09T05:00:00.000Z')
    expect(reportPeriod('30d', new Date('2026-03-07T18:00:00Z')).endExclusive).toBe('2026-03-08T06:00:00.000Z')
    expect(reportPeriod('30d', new Date('2026-11-01T18:00:00Z')).endExclusive).toBe('2026-11-02T06:00:00.000Z')
  })
  it('uses Chicago date near UTC midnight, includes leap days, and keeps exact range boundaries', () => {
    expect(reportPeriod('year', new Date('2027-01-01T03:00:00Z')).startDate).toBe('2026-01-01')
    expect(reportPeriod('365d', new Date('2024-02-29T18:00:00Z')).startDate).toBe('2023-03-02')
    const result = buildTaxReport([order({ id: 'start', created_at: '2026-08-16T00:00:00-05:00' }), order({ id: 'end', created_at: '2026-09-15T05:00:00Z' })], [], [], '30d', now)
    expect(result.overview.paidOrderCount).toBe(1)
  })
})

describe('recorded sales and tax', () => {
  it('separates included/added tax, keeps historical states, and includes selected zero rows', () => {
    const report = buildTaxReport([order(), order({ id: 'ca', tax_included: true, shipping_address: { address: { country: 'US', state: 'ca' } } })], [], ['TX', 'FL'], '30d', now)
    expect(report.totals).toMatchObject({ orderCount: 2, includedTaxCents: 825, separateTaxCents: 825, recordedTaxCents: 1650, netRecordedTaxCents: 1650 })
    expect(report.rows.find(r => r.state === 'CA')).toMatchObject({ currentlySelected: false, recordedTaxCents: 825 })
    expect(report.rows.find(r => r.state === 'FL')).toMatchObject({ currentlySelected: true, orderCount: 0 })
    expect(report.overview).toMatchObject({ grossCollectedCents: 21650, salesBeforeTaxCents: 20000, averageOrderCents: 10825 })
  })
  it('subtracts tax from fully refunded orders, without inventing credits for partial refunds', () => {
    const report = buildTaxReport([order({ id: 'full', status: 'refunded', tax_included: true }), order({ id: 'partial' })], [
      { id: 'e1', order_id: 'partial', detail: { refund_id: 're_1', amount_cents: 2000, status: 'succeeded' } },
      { id: 'duplicate', order_id: 'partial', detail: { refund_id: 're_1', amount_cents: 2000, status: 'succeeded' } },
    ], ['TX'], '30d', now)
    expect(report.totals).toMatchObject({ recordedTaxCents: 1650, fullRefundTaxCents: 825, netRecordedTaxCents: 825, refundReviewOrderCount: 1 })
    expect(report.overview).toMatchObject({ fullyRefundedTotalCents: 10825, retainedTotalAfterFullRefundsCents: 10825 })
  })
  it('flags pending/unknown refunds but ignores failed refunds and does not deduct disputes', () => {
    const report = buildTaxReport([order({ id: 'pending' }), order({ id: 'failed' }), order({ id: 'disputed', status: 'disputed' })], [
      { id: 'r1', order_id: 'pending', detail: { status: 'pending' } },
      { id: 'r2', order_id: 'failed', detail: { status: 'failed' } },
    ], [], '30d', now)
    expect(report.totals.refundReviewOrderCount).toBe(1)
    expect(report.totals.fullRefundTaxCents).toBe(0)
    expect(report.notices.some(n => n.includes('1 disputed'))).toBe(true)
  })
  it('excludes test, unknown mode, unpaid, cancelled, and records without a payment reference', () => {
    const report = buildTaxReport([order({ stripe_mode: 'test' }), order({ stripe_mode: null }), order({ status: 'pending' }), order({ status: 'cancelled' }), order({ status: 'failed_payment' }), order({ stripe_payment_intent_id: null })], [], [], '30d', now)
    expect(report.overview.paidOrderCount).toBe(0)
    expect(report.excluded).toMatchObject({ testOrders: 1, unknownModeOrders: 1, unpaidOrders: 3, paidCancelledOrders: 1 })
    expect(report.notices.some(n => n.includes('Cancellation alone does not prove a refund'))).toBe(true)
  })
  it('does not turn missing tax into zero or pretend a missing state is Texas', () => {
    const report = buildTaxReport([order({ tax: null, shipping_address: {} }), order({ id: 'badTax', tax: 999 })], [], [], '30d', now)
    expect(report.totals.unknownTaxOrderCount).toBe(2)
    expect(report.overview.salesBeforeTaxCents).toBeNull()
    expect(report.rows.some(row => row.state === 'UNKNOWN')).toBe(true)
    expect(report.overview.grossCollectedCents).toBe(21650)
  })
  it('handles an empty store, preserves cents, and caps drill-down rows without truncating totals', () => {
    expect(buildTaxReport([], [], ['TX'], 'year', now).overview.averageOrderCents).toBeNull()
    expect(moneyCents('8.25')).toBe(825)
    expect(moneyCents(null)).toBeNull()
    expect(moneyCents('   ')).toBeNull()
    const report = buildTaxReport(Array.from({ length: 30 }, (_, index) => order({ id: `o${index}` })), [], [], '30d', now)
    expect(report.latestOrders).toHaveLength(25)
    expect(report.totals.orderCount).toBe(30)
  })
})

describe('report pagination', () => {
  it('reads beyond the 1000-row API default and never silently returns a partial total', async () => {
    const fetchPage = vi.fn(async (from: number, to: number) => ({ data: Array.from({ length: Math.min(1501 - from, to - from + 1) }, (_, i) => from + i), error: null }))
    expect(await readAllReportPages(fetchPage)).toHaveLength(1501)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999)
    await expect(readAllReportPages(async () => ({ data: null, error: new Error('RLS read failed') }))).rejects.toThrow('all order records')
  })
})
