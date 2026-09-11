import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, dbFail, parseBody } from '@/lib/api/respond'
import { STUDIO_STAGES } from '@/lib/fulfillment/studio'

const Action = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    job_id: z.string().uuid(),
    revision: z.number().int().positive(),
    status: z.enum(STUDIO_STAGES),
    assignee: z.string().trim().min(1).max(120),
    notes: z.string().max(10000),
    due_at: z.string().datetime(),
    hold_reason: z.string().max(1000).nullable(),
  }),
  z.object({
    action: z.literal('ship'),
    request_id: z.string().uuid(),
    carrier: z.string().trim().min(1).max(80),
    tracking_number: z.string().trim().min(1).max(160),
    tracking_url: z.string().url().startsWith('https://').max(2000).nullable(),
    postage_cents: z.number().int().min(0).max(1000000).nullable(),
    items: z
      .array(
        z.object({
          job_id: z.string().uuid(),
          quantity: z.number().int().min(1).max(99),
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({
    action: z.literal('retry_email'),
    shipment_id: z.string().uuid(),
  }),
  z.object({ action: z.literal('deliver'), shipment_id: z.string().uuid() }),
  z.object({
    action: z.literal('replace'),
    job_id: z.string().uuid(),
    request_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal('release_hold'),
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal('receive_return'),
    item_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal('resume_provider'),
    item_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal('transfer'),
    item_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
  }),
])

// Load private production work, package allocations, reviews, and delivery failures for one order.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const results = await Promise.all([
    auth.supabase
      .from('studio_jobs')
      .select(
        '*,item:order_items(purchase_spec,quantity,unit_price,fulfillment_status,shipped_at,returned_at)',
      )
      .eq('order_id', id)
      .order('created_at'),
    auth.supabase
      .from('order_shipments')
      .select('*,order_shipment_items(studio_job_id,quantity)')
      .eq('order_id', id)
      .order('created_at'),
    auth.supabase
      .from('studio_order_events')
      .select('id,event_type,detail,created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    auth.supabase
      .from('order_items')
      .select('id,purchase_spec,fulfillment_status,external_order_id')
      .eq('order_id', id)
      .eq('fulfillment_type', 'lumaprints')
      .eq('fulfillment_status', 'paused'),
    auth.supabase
      .from('orders')
      .select('fulfillment_hold_reason')
      .eq('id', id)
      .single(),
    auth.supabase
      .from('order_shipments')
      .select('id,studio_notifications(status,last_error)')
      .eq('order_id', id),
  ])
  const error = results.find((r) => r.error)?.error
  if (error) return dbFail(error)
  return Response.json({
    jobs: results[0].data,
    shipments: results[1].data,
    events: results[2].data,
    paused: results[3].data,
    review: results[4].data,
    notifications: results[5].data?.map((n) => ({
      ...n,
      studio_notifications: Array.isArray(n.studio_notifications)
        ? n.studio_notifications
        : n.studio_notifications
          ? [n.studio_notifications]
          : [],
    })),
  })
}

// Bind each operation to this order and let database transactions enforce quantity and workflow invariants.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Action)
  if (!parsed.ok) return parsed.response
  const a = parsed.data
  if (a.action === 'release_hold') {
    const { error } = await auth.supabase.rpc('release_studio_order_hold', {
      p_order_id: id,
      p_reason: a.reason,
    })
    if (error) return apiError(error.message, 409, 'WORK_CONFLICT')
    return Response.json({ success: true })
  }
  // Bind every resource to the order named in the URL before invoking its transaction.
  const table =
    a.action === 'deliver' || a.action === 'retry_email'
      ? 'order_shipments'
      : a.action === 'transfer' ||
          a.action === 'receive_return' ||
          a.action === 'resume_provider'
        ? 'order_items'
        : 'studio_jobs'
  const ids =
    a.action === 'ship'
      ? a.items.map((i) => i.job_id)
      : [
          a.action === 'deliver' || a.action === 'retry_email'
            ? a.shipment_id
            : a.action === 'transfer' ||
                a.action === 'receive_return' ||
                a.action === 'resume_provider'
              ? a.item_id
              : a.job_id,
        ]
  const { data: owned, error: readError } = await auth.supabase
    .from(table)
    .select('id')
    .eq('order_id', id)
    .in('id', ids)
  if (readError) return dbFail(readError)
  if (owned?.length !== new Set(ids).size)
    return apiError('Work item not found on this order.', 404, 'NOT_FOUND')
  let result
  if (a.action === 'update')
    result = await auth.supabase.rpc('update_studio_job', {
      p_job_id: a.job_id,
      p_revision: a.revision,
      p_status: a.status,
      p_assignee: a.assignee,
      p_notes: a.notes,
      p_due_at: a.due_at,
      p_hold_reason: a.hold_reason,
    })
  else if (a.action === 'ship')
    result = await auth.supabase.rpc('record_studio_shipment', {
      p_id: a.request_id,
      p_order_id: id,
      p_carrier: a.carrier,
      p_tracking_number: a.tracking_number,
      p_tracking_url: a.tracking_url,
      p_postage_cents: a.postage_cents,
      p_items: a.items,
    })
  else if (a.action === 'retry_email')
    result = await auth.supabase.rpc('retry_studio_notification', {
      p_shipment_id: a.shipment_id,
    })
  else if (a.action === 'deliver')
    result = await auth.supabase.rpc('deliver_studio_shipment', {
      p_id: a.shipment_id,
    })
  else if (a.action === 'replace')
    result = await auth.supabase.rpc('replace_studio_job', {
      p_id: a.request_id,
      p_job_id: a.job_id,
      p_reason: a.reason,
    })
  else if (a.action === 'resume_provider')
    result = await auth.supabase.rpc('resume_lumaprints_item', {
      p_item_id: a.item_id,
      p_reason: a.reason,
    })
  else if (a.action === 'receive_return')
    result = await auth.supabase.rpc('receive_studio_original_return', {
      p_item_id: a.item_id,
      p_reason: a.reason,
    })
  else
    result = await auth.supabase.rpc('transfer_to_studio', {
      p_item_id: a.item_id,
      p_reason: a.reason,
    })
  if (result.error)
    return apiError(
      result.error.code === 'P0001'
        ? result.error.message
        : 'Could not save this change. Refresh the order and try again.',
      409,
      'WORK_CONFLICT',
    )
  return Response.json({ success: true })
}
