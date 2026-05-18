import { requireAdmin } from '@/lib/auth/require-admin'
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { data: funnels, error } = await supabase
      .from('artwork_funnels')
      .select(`
        id, slug, template, is_published,
        seo_title, views_count, add_to_cart_count, purchase_count,
        created_at, updated_at,
        products:product_id ( id, title, slug, product_images ( url, alt_text, sort_order ) )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ funnels: funnels || [] })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    if (!body.product_id) {
      return Response.json({ error: 'Product is required.' }, { status: 400 })
    }
    if (!body.template) {
      return Response.json({ error: 'Template is required.' }, { status: 400 })
    }

    // Build slug from product title if not provided
    let slug = body.slug?.trim()
    if (!slug) {
      const { data: product } = await supabase
        .from('products')
        .select('title')
        .eq('id', body.product_id)
        .single()
      slug = generateSlug(product?.title || 'artwork')
    }

    // Ensure uniqueness
    const { data: existing } = await supabase
      .from('artwork_funnels')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      slug = `${slug}-${Date.now()}`
    }

    const { data: funnel, error } = await supabase
      .from('artwork_funnels')
      .insert({
        product_id: body.product_id,
        template: body.template,
        slug,
        is_published: body.is_published ?? false,
        seo_title: body.seo_title || null,
        seo_description: body.seo_description || null,
        og_image_url: body.og_image_url || null,
        problem_heading: body.problem_heading || null,
        problem_body: body.problem_body || null,
        amplify_heading: body.amplify_heading || null,
        amplify_body: body.amplify_body || null,
        story_heading: body.story_heading || null,
        story_body_json: body.story_body_json || null,
        story_body_html: body.story_body_html || null,
        transformation_heading: body.transformation_heading || null,
        transformation_body: body.transformation_body || null,
        offer_heading: body.offer_heading || null,
        offer_original_description: body.offer_original_description || null,
        offer_print_description: body.offer_print_description || null,
        risk_reversal_heading: body.risk_reversal_heading || null,
        risk_reversal_body: body.risk_reversal_body || null,
        final_cta_text: body.final_cta_text || null,
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ funnel }, { status: 201 })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
