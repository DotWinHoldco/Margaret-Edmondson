import { createClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

// Public endpoint that the funnel landing page calls to increment the
// view / add_to_cart / purchase counters on artwork_funnels. The RLS
// policy on artwork_funnels gates UPDATE to admins, so we route through
// a SECURITY DEFINER RPC (increment_funnel_metric) that performs the
// narrow update without exposing UPDATE rights to the public.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, keyPrefix: 'funnel-track' })
  if (!rl.ok) return rateLimitResponse(rl)

  const { id } = await params
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  let body: { metric?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.metric || !['views', 'add_to_cart', 'purchase'].includes(body.metric)) {
    return Response.json({ error: 'metric must be views|add_to_cart|purchase' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('increment_funnel_metric', {
    p_funnel_id: id,
    p_metric: body.metric,
  })
  if (error) {
    console.error('Funnel metric RPC error:', error)
    return Response.json({ error: 'Failed to track' }, { status: 500 })
  }
  return Response.json({ ok: true })
}
