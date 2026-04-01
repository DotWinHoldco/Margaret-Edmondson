import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('products')
      .select('*, product_images(*), product_variants(*), categories(*)')
      .eq('id', id)
      .single()

    if (error) {
      return Response.json(
        { error: error.message },
        { status: error.code === 'PGRST116' ? 404 : 500 }
      )
    }

    return Response.json({ data })
  } catch (err) {
    console.error('GET /api/admin/products/[id] error:', err)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const supabase = await createClient()

    // Build update object with only provided fields
    const updateFields: Record<string, unknown> = {}
    const allowedFields = [
      'title',
      'slug',
      'category_id',
      'description',
      'medium',
      'dimensions',
      'base_price',
      'compare_at_price',
      'fulfillment_type',
      'status',
      'is_original',
      'is_featured',
      'tags',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field]
      }
    }

    if (Object.keys(updateFields).length === 0 && !body.variants) {
      return Response.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    // Update product fields
    if (Object.keys(updateFields).length > 0) {
      updateFields.updated_at = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('products')
        .update(updateFields)
        .eq('id', id)

      if (updateError) {
        return Response.json(
          { error: updateError.message },
          { status: 500 }
        )
      }
    }

    // Handle variants if provided
    if (Array.isArray(body.variants)) {
      // Delete existing variants and re-insert
      const { error: deleteError } = await supabase
        .from('product_variants')
        .delete()
        .eq('product_id', id)

      if (deleteError) {
        console.error('Failed to delete variants:', deleteError.message)
      }

      if (body.variants.length > 0) {
        const variantRows = body.variants.map(
          (
            v: { name: string; price: number; sku: string },
            index: number
          ) => ({
            product_id: id,
            name: v.name,
            price: v.price || 0,
            sku: v.sku || null,
            sort_order: index,
          })
        )

        const { error: insertError } = await supabase
          .from('product_variants')
          .insert(variantRows)

        if (insertError) {
          console.error('Failed to insert variants:', insertError.message)
        }
      }
    }

    // Fetch updated product
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('*, product_images(*), product_variants(*), categories(*)')
      .eq('id', id)
      .single()

    if (fetchError) {
      return Response.json(
        { error: fetchError.message },
        { status: 500 }
      )
    }

    return Response.json({ data: product })
  } catch (err) {
    console.error('PATCH /api/admin/products/[id] error:', err)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Soft delete: set status to archived
    const { error } = await supabase
      .from('products')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/admin/products/[id] error:', err)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
