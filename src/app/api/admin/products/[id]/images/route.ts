import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail, apiOk } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// POST /api/admin/products/[id]/images — upload images to storage and register them on a product; admin only.
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
      return apiError('Please choose at least one image to upload.', 400, 'VALIDATION_FAILED')
    }

    // Get current image count for sort order
    const { data: existingImages } = await supabase
      .from('product_images')
      .select('id')
      .eq('product_id', id)

    const startOrder = existingImages?.length || 0
    const uploaded: Array<{ id: string; url: string; alt_text: string; is_primary: boolean; sort_order: number }> = []
    let failed = 0

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
        console.error('[api] admin/products images POST upload:', uploadError.message)
        failed++
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

      if (insertError || !imageRow) {
        if (insertError) console.error('[api] admin/products images POST insert:', insertError.message)
        failed++
      }
      if (!insertError && imageRow) {
        uploaded.push(imageRow)
        // Register in central media library so the image shows up in
        // /admin/media under the Products filter.
        await supabase
          .from('media_library')
          .upsert(
            {
              storage_bucket: 'product-images',
              storage_path: fileName,
              url: urlData.publicUrl,
              file_name: file.name,
              mime_type: file.type || null,
              byte_size: file.size || null,
              alt_text: imageRow.alt_text,
              categories: ['products'],
              source: `product:${id}`,
              uploaded_by: auth.user.id,
            },
            { onConflict: 'storage_bucket,storage_path' },
          )
      }
    }

    // If every file failed, surface a real error rather than a silent empty 201.
    if (uploaded.length === 0) {
      return apiError('None of the images could be uploaded. Please check the files and try again.', 502, 'UPLOAD_FAILED')
    }
    return apiOk({ images: uploaded, failed, total: files.length }, 201)
  } catch (err) {
    return apiFail(err, { context: 'admin/products images POST' })
  }
}

// DELETE /api/admin/products/[id]/images — remove a product image from storage and the DB; admin only.
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
      return apiError('Could not tell which image to remove. Please refresh and try again.', 400, 'VALIDATION_FAILED')
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
      return dbFail(error, 'admin/products images DELETE')
    }

    return apiOk({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/products images DELETE' })
  }
}

// PATCH /api/admin/products/[id]/images — set primary flag or alt text on a product image; admin only.
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
      return dbFail(error, 'admin/products images PATCH')
    }

    return apiOk(data)
  } catch (err) {
    return apiFail(err, { context: 'admin/products images PATCH' })
  }
}
