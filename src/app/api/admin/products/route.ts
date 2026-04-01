import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return Response.json(
        { error: 'Title is required' },
        { status: 400 }
      )
    }

    if (body.base_price === undefined || body.base_price === null) {
      return Response.json(
        { error: 'Base price is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const slug = body.slug?.trim() || generateSlug(body.title)

    // Check for slug uniqueness
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    const finalSlug = existing ? `${slug}-${Date.now()}` : slug

    // Insert product
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        title: body.title.trim(),
        slug: finalSlug,
        category_id: body.category_id || null,
        description: body.description || null,
        medium: body.medium || null,
        dimensions: body.dimensions || null,
        base_price: parseFloat(body.base_price) || 0,
        compare_at_price: body.compare_at_price
          ? parseFloat(body.compare_at_price)
          : null,
        fulfillment_type: body.fulfillment_type || 'self_ship',
        status: body.status || 'draft',
        is_original: body.is_original || false,
        is_featured: body.is_featured || false,
        tags: Array.isArray(body.tags) ? body.tags : [],
      })
      .select()
      .single()

    if (productError) {
      return Response.json(
        { error: productError.message },
        { status: 500 }
      )
    }

    // Insert variants if provided
    if (Array.isArray(body.variants) && body.variants.length > 0) {
      const variantRows = body.variants.map(
        (v: { name: string; price: number; sku: string }, index: number) => ({
          product_id: product.id,
          name: v.name,
          price: v.price || 0,
          sku: v.sku || null,
          sort_order: index,
        })
      )

      const { error: variantError } = await supabase
        .from('product_variants')
        .insert(variantRows)

      if (variantError) {
        // Product was created but variants failed - log but don't fail the whole request
        console.error('Failed to insert variants:', variantError.message)
      }
    }

    return Response.json({ data: product }, { status: 201 })
  } catch (err) {
    console.error('POST /api/admin/products error:', err)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
