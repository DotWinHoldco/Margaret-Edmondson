// dotwin-allow:public-write — public funnel analytics event (input validated + rate-limited). Authored by DotWin.
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { apiError, apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { funnelMetricInputSchema } from '@/lib/api/public-input'

// Public endpoint that the funnel landing page calls to increment the
// view / add_to_cart / purchase counters on artwork_funnels. The RLS
// policy on artwork_funnels gates UPDATE to admins, so we route through
// a SECURITY DEFINER RPC (increment_funnel_metric) that performs the
// narrow update without exposing UPDATE rights to the public. The RPC is
// EXECUTE-able only by service_role, so it is invoked with the service-role
// client; the route is the rate-limited trust boundary.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, keyPrefix: 'funnel-track' })
  if (!rl.ok) return rateLimitResponse(rl)

  const { id } = await params
  if (!id || !z.string().uuid().safeParse(id).success) {
    return apiError('A valid funnel id is required.', 400, 'VALIDATION_FAILED')
  }
  const parsed = await parseBody(request, funnelMetricInputSchema)
  if (!parsed.ok) return parsed.response

  const svc = await createServiceClient()
  const { error } = await svc.rpc('increment_funnel_metric', {
    p_funnel_id: id,
    p_metric: parsed.data.metric,
  })
  if (error) {
    return dbFail(error, 'funnels/[id]/track POST')
  }
  return apiOk({ ok: true })
}
