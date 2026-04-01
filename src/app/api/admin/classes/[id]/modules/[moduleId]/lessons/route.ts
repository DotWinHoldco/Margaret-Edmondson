import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> }
) {
  try {
    const { moduleId } = await params
    const body = await request.json()
    const supabase = await createClient()

    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return Response.json({ error: 'Title is required' }, { status: 400 })
    }

    // Get max sort_order for this module
    let sortOrder = body.sort_order
    if (sortOrder === undefined || sortOrder === null) {
      const { data: existing } = await supabase
        .from('lessons')
        .select('sort_order')
        .eq('module_id', moduleId)
        .order('sort_order', { ascending: false })
        .limit(1)

      sortOrder =
        existing && existing.length > 0 ? existing[0].sort_order + 1 : 0
    }

    const slug = body.slug?.trim() || generateSlug(body.title)

    const { data: lesson, error } = await supabase
      .from('lessons')
      .insert({
        module_id: moduleId,
        title: body.title.trim(),
        slug,
        description: body.description || null,
        video_url: body.video_url || null,
        video_duration_minutes: body.video_duration_minutes
          ? parseFloat(body.video_duration_minutes)
          : null,
        content_html: body.content_html || null,
        is_preview: body.is_preview || false,
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data: lesson }, { status: 201 })
  } catch (err) {
    console.error('POST lessons error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
