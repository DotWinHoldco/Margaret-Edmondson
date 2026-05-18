import { requireAdmin } from '@/lib/auth/require-admin'
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
      return Response.json({ error: error.message }, { status: 500 })
    }

    if (!funnel) {
      return Response.json({ error: 'Funnel not found.' }, { status: 404 })
    }

    return Response.json({ funnel })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

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

    // Handle view count increment separately via RPC-style
    if (body.views_count_increment) {
      const { error: rpcError } = await supabase.rpc('increment_funnel_views', { funnel_id: id })
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
      return Response.json({ error: 'No fields to update.' }, { status: 400 })
    }

    updateData.updated_at = new Date().toISOString()

    const { data: funnel, error } = await supabase
      .from('artwork_funnels')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ funnel })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

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
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
