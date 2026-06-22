import { requireAdmin } from '@/lib/auth/require-admin'
import { NextRequest } from 'next/server'

// GET /api/admin/pages/by-id/[id] — read a single page by id; admin only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { data, error } = await supabase
      .from('pages')
      .select('id, title, slug, content_json, content_html, seo_title, seo_description, updated_at, is_published, hero_image_url, page_kind')
      .eq('id', id)
      .single()

    if (error) {
      return Response.json(
        { error: error.message },
        { status: error.code === 'PGRST116' ? 404 : 500 }
      )
    }

    return Response.json({ page: data })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

// PATCH /api/admin/pages/by-id/[id] — update allowed fields on a page; admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const updateFields: Record<string, unknown> = {}
    const allowedFields = [
      'title',
      'slug',
      'content_json',
      'content_html',
      'seo_title',
      'seo_description',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field]
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json(
        { error: 'No fields to update.' },
        { status: 400 }
      )
    }

    updateFields.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('pages')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ page: data })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/pages/by-id/[id] — delete a page by id; admin only.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { error } = await supabase
      .from('pages')
      .delete()
      .eq('id', id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}
