import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, dbFail } from '@/lib/api/respond'

// B-25: let admins record shipping/tracking for self-ship (original artwork)
// items and mark them shipped/delivered from the order detail page.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params

  let body: {
    tracking_number?: string
    tracking_url?: string
    carrier?: string
    mark_shipped?: boolean
    mark_delivered?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return apiError('Please provide a valid request.', 400, 'INVALID_BODY')
  }

  const updates: Record<string, unknown> = {}
  if (typeof body.tracking_number === 'string') updates.tracking_number = body.tracking_number.trim() || null
  if (typeof body.tracking_url === 'string') updates.tracking_url = body.tracking_url.trim() || null
  if (typeof body.carrier === 'string') updates.carrier = body.carrier.trim() || null
  if (body.mark_shipped === true) {
    updates.shipped_at = new Date().toISOString()
    updates.fulfillment_status = 'shipped'
  }
  if (body.mark_delivered === true) {
    updates.delivered_at = new Date().toISOString()
    updates.fulfillment_status = 'delivered'
  }

  if (Object.keys(updates).length === 0) {
    return apiError('Please provide at least one field to update.', 400, 'VALIDATION_FAILED')
  }

  const { data, error } = await auth.supabase
    .from('order_items')
    .update(updates)
    .eq('id', id)
    .select('id, fulfillment_status, tracking_number, tracking_url, carrier, shipped_at, delivered_at')
    .single()

  if (error) {
    return dbFail(error, 'admin/order-items PATCH')
  }

  return Response.json({ success: true, item: data })
}
