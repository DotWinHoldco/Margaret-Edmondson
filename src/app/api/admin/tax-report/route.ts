import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail } from '@/lib/api/respond'
import { buildTaxReport, readAllReportPages, reportPeriod, REPORT_PERIODS, type ReportPeriodKey, type ReportOrder, type ReportRefundEvent } from '@/lib/tax/reporting'

// GET /api/admin/tax-report — report saved live sales and tax under the signed-in administrator's RLS identity.
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const value = new URL(request.url).searchParams.get('period') || '30d'
  if (!REPORT_PERIODS.includes(value as ReportPeriodKey)) return apiError('Choose a supported date range.', 400, 'INVALID_PERIOD')
  const key = value as ReportPeriodKey
  const now = new Date()
  const period = reportPeriod(key, now)
  try {
    const db = auth.supabase
    const [orders, settings] = await Promise.all([
      readAllReportPages<ReportOrder>((from, to) => db.from('orders').select('id,order_number,created_at,status,total,tax,tax_included,shipping_address,stripe_mode,stripe_payment_intent_id,stripe_checkout_session_id').gte('created_at', period.startInclusive).lt('created_at', period.endExclusive).order('created_at').order('id').range(from, to)),
      db.from('site_settings').select('tax_nexus_states').eq('id', true).maybeSingle(),
    ])
    const events: ReportRefundEvent[] = []
    // Current refund state belongs to these orders regardless of when the request occurred.
    for (let offset = 0; offset < orders.length; offset += 200) {
      const ids = orders.slice(offset, offset + 200).map(order => order.id)
      events.push(...await readAllReportPages<ReportRefundEvent>((from, to) => db.from('studio_order_events').select('id,order_id,detail').eq('event_type', 'refund_requested').in('order_id', ids).order('created_at').order('id').range(from, to)))
    }
    const report = buildTaxReport(orders, events, settings.data?.tax_nexus_states || [], key, now)
    if (settings.error) report.notices.push('The current nexus selection could not be read. Historical order amounts are still shown; selected-state markers may be missing.')
    return Response.json(report, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return apiFail(error, { context: 'admin/tax-report GET', publicMessage: 'We could not read the complete sales report. Please try again.', code: 'REPORT_UNAVAILABLE' })
  }
}
