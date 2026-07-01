import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { createServiceClient } from '@/lib/supabase/server'
// GET /api/admin/funnels/[id] — fetch a funnel with its product, images, and variants; admin only.
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { data: funnel, error } = await supabase
      .from('artwork_funnels')
      .select(`
        *,
        products:product_id (
          id, title, slug, description_html, story_html,
          medium, dimensions, base_price, is_original, prints_enabled, status,
          product_images ( id, url, alt_text, sort_order ),
          product_variants ( id, name, price, variant_type, inventory_count, sort_order )
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      return dbFail(error, 'admin/funnels/[id] GET')
    }

    if (!funnel) {
      return apiError('That funnel could not be found.', 404, 'NOT_FOUND')
    }

    return Response.json({ funnel })
  } catch (err) {
    return apiFail(err, { context: 'admin/funnels/[id] GET' })
  }
}

// PATCH /api/admin/funnels/[id] — update funnel fields or increment its view count; admin only.
export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params
    const body = await request.json()
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    // Handle view count increment separately via RPC-style. increment_funnel_metric
    // is EXECUTE-able only by service_role, so the privileged increment runs on the
    // service-role client; this route is already requireAdmin-gated.
    if (body.views_count_increment) {
      const svc = await createServiceClient()
      const { error: rpcError } = await svc.rpc('increment_funnel_metric', { p_funnel_id: id, p_metric: 'views' })
      if (rpcError) {
        // Fallback: fetch current count and increment
        const { data: current } = await supabase
          .from('artwork_funnels')
          .select('views_count')
          .eq('id', id)
          .single()
        await supabase
          .from('artwork_funnels')
          .update({ views_count: ((current?.views_count as number) || 0) + 1 })
          .eq('id', id)
      }
      return Response.json({ success: true })
    }

    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'product_id', 'template', 'slug', 'is_published',
      'seo_title', 'seo_description', 'og_image_url',
      'problem_heading', 'problem_body',
      'amplify_heading', 'amplify_body',
      'story_heading', 'story_body_json', 'story_body_html',
      'transformation_heading', 'transformation_body',
      'offer_heading', 'offer_original_description', 'offer_print_description',
      'risk_reversal_heading', 'risk_reversal_body',
      'final_cta_text',
    ]

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return apiError('No fields to update.', 400, 'BAD_REQUEST')
    }

    updateData.updated_at = new Date().toISOString()

    const { data: funnel, error } = await supabase
      .from('artwork_funnels')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return apiError('That slug already exists. Please use a different slug.', 409, 'CONFLICT')
      }
      return dbFail(error, 'admin/funnels/[id] PATCH')
    }

    return Response.json({ funnel })
  } catch (err) {
    return apiFail(err, { context: 'admin/funnels/[id] PATCH' })
  }
}

// DELETE /api/admin/funnels/[id] — delete a funnel by id; admin only.
export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { error } = await supabase
      .from('artwork_funnels')
      .delete()
      .eq('id', id)

    if (error) {
      return dbFail(error, 'admin/funnels/[id] DELETE')
    }

    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/funnels/[id] DELETE' })
  }
}
