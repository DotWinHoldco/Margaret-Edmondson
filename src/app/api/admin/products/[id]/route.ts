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
      'description_html',
      'medium',
      'dimensions',
      'base_price',
      'compare_at_price',
      'fulfillment_type',
      'status',
      'is_original',
      'is_featured',
      // NOTE: Requires `funnel_eligible BOOLEAN DEFAULT true` column on products table in Supabase
      'funnel_eligible',
      'tags',
      'margin_pct',
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

    // Handle variants if provided — preserve pricing columns (wholesale_cost,
    // worst_case_shipping, shipping_quoted_at) by updating existing rows in
    // place and only inserting/deleting the diff.
    if (Array.isArray(body.variants)) {
      const incoming = body.variants as Array<{ id?: string; name: string; price: number; sku: string }>
      const incomingIds = new Set(incoming.filter((v) => v.id).map((v) => v.id!))

      const { data: existingRows } = await supabase
        .from('product_variants')
        .select('id')
        .eq('product_id', id)

      const existingIds = new Set((existingRows || []).map((r) => r.id))
      const idsToDelete = [...existingIds].filter((eid) => !incomingIds.has(eid))

      if (idsToDelete.length > 0) {
        await supabase.from('product_variants').delete().in('id', idsToDelete)
      }

      for (let index = 0; index < incoming.length; index++) {
        const v = incoming[index]
        const row = {
          name: v.name,
          price: v.price || 0,
          sku: v.sku || null,
          sort_order: index,
        }
        if (v.id && existingIds.has(v.id)) {
          await supabase.from('product_variants').update(row).eq('id', v.id)
        } else {
          await supabase.from('product_variants').insert({ ...row, product_id: id })
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
