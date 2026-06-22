import { requireAdmin } from '@/lib/auth/require-admin'
import { type NextRequest } from 'next/server'

// GET /api/fulfillment/status/[orderId] — return an order's items and derived fulfillment status; admin only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  // Admin-only: this returns the buyer's email + carrier + tracking numbers,
  // which an unauthenticated caller could otherwise harvest by enumerating
  // order UUIDs. (A-4)
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { orderId } = await params

  if (!orderId) {
    return Response.json({ error: 'orderId is required' }, { status: 400 })
  }

  const supabase = auth.supabase

  // Fetch order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, email, created_at')
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    return Response.json({ error: 'Order not found' }, { status: 404 })
  }

  // Fetch all order items with product info
  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select(`
      id,
      product_id,
      variant_id,
      quantity,
      fulfillment_type,
      fulfillment_status,
      external_order_id,
      tracking_number,
      tracking_url,
      carrier,
      shipped_at,
      delivered_at,
      product:products ( name )
    `)
    .eq('order_id', orderId)

  if (itemsError) {
    return Response.json(
      { error: 'Failed to fetch order items' },
      { status: 500 },
    )
  }

  // Derive overall status from individual items
  const statuses = (items || []).map((i) => i.fulfillment_status)
  let overallStatus: string

  if (statuses.length === 0) {
    overallStatus = 'no_items'
  } else if (statuses.every((s) => s === 'delivered')) {
    overallStatus = 'delivered'
  } else if (statuses.every((s) => s === 'shipped' || s === 'delivered')) {
    overallStatus = 'shipped'
  } else if (statuses.every((s) => s === 'submitted' || s === 'in_production' || s === 'shipped' || s === 'delivered')) {
    overallStatus = 'in_production'
  } else if (statuses.some((s) => s === 'submitted' || s === 'in_production')) {
    overallStatus = 'partially_submitted'
  } else {
    overallStatus = 'pending'
  }

  return Response.json({
    orderId: order.id,
    orderStatus: order.status,
    fulfillmentStatus: overallStatus,
    email: order.email,
    createdAt: order.created_at,
    items: items || [],
  })
}
