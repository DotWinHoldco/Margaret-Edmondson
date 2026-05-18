import { requireAdmin } from '@/lib/auth/require-admin'
import { NextRequest } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files.length) {
      return Response.json({ error: 'No files provided' }, { status: 400 })
    }

    // Get current image count for sort order
    const { data: existingImages } = await supabase
      .from('product_images')
      .select('id')
      .eq('product_id', id)

    const startOrder = existingImages?.length || 0
    const uploaded: Array<{ id: string; url: string; alt_text: string; is_primary: boolean; sort_order: number }> = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `${id}/${Date.now()}-${i}.${ext}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        continue
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName)

      // Insert into product_images table
      const isPrimary = startOrder === 0 && i === 0
      const { data: imageRow, error: insertError } = await supabase
        .from('product_images')
        .insert({
          product_id: id,
          url: urlData.publicUrl,
          alt_text: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          is_primary: isPrimary,
          sort_order: startOrder + i,
        })
        .select()
        .single()

      if (!insertError && imageRow) {
        uploaded.push(imageRow)
      }
    }

    return Response.json({ data: uploaded }, { status: 201 })
  } catch (err) {
    console.error('POST /api/admin/products/[id]/images error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { imageId } = await request.json()
    if (!imageId) {
      return Response.json({ error: 'Image ID required' }, { status: 400 })
    }

    // Get the image record to find the storage path
    const { data: image } = await supabase
      .from('product_images')
      .select('url')
      .eq('id', imageId)
      .single()

    if (image?.url) {
      // Extract storage path from URL
      const urlParts = image.url.split('/product-images/')
      if (urlParts[1]) {
        await supabase.storage.from('product-images').remove([urlParts[1]])
      }
    }

    // Delete from database
    const { error } = await supabase
      .from('product_images')
      .delete()
      .eq('id', imageId)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/admin/products/[id]/images error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { imageId, is_primary, alt_text } = await request.json()

    if (is_primary) {
      // Unset all other primaries first
      await supabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('product_id', id)
    }

    const updates: Record<string, unknown> = {}
    if (is_primary !== undefined) updates.is_primary = is_primary
    if (alt_text !== undefined) updates.alt_text = alt_text

    const { data, error } = await supabase
      .from('product_images')
      .update(updates)
      .eq('id', imageId)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('PATCH /api/admin/products/[id]/images error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
