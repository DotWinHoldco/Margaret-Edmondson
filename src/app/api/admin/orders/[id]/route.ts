import { createClient } from '@/lib/supabase/server'

const VALID_STATUSES = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const

type OrderStatus = typeof VALID_STATUSES[number]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: { status?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { status } = body

  if (!status || !VALID_STATUSES.includes(status as OrderStatus)) {
    return Response.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  // Verify the order exists
  const { data: existing, error: fetchError } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return Response.json({ error: 'Order not found' }, { status: 404 })
  }

  // Update the order status
  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    console.error('Failed to update order status:', updateError)
    return Response.json({ error: 'Failed to update order status' }, { status: 500 })
  }

  return Response.json({
    success: true,
    order: updated,
    previous_status: existing.status,
  })
}
