import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// GET /api/admin/pages — list all pages; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('pages')
      .select('id, title, slug, content_json, content_html, seo_title, seo_description, updated_at, is_published, hero_image_url, page_kind')
      .order('updated_at', { ascending: false })

    if (error) {
      return dbFail(error, 'admin/pages GET')
    }

    return Response.json({ pages: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/pages GET' })
  }
}

// POST /api/admin/pages — create a page with a unique slug; admin only.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, content_json, content_html, seo_title, seo_description } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return apiError('Title is required.', 400, 'BAD_REQUEST')
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const slug = body.slug?.trim() || generateSlug(title)

    // Check for slug uniqueness
    const { data: existing } = await supabase
      .from('pages')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    const finalSlug = existing ? `${slug}-${Date.now()}` : slug

    const { data, error } = await supabase
      .from('pages')
      .insert({
        title: title.trim(),
        slug: finalSlug,
        content_json: content_json || null,
        content_html: content_html || '',
        seo_title: seo_title || title.trim(),
        seo_description: seo_description || '',
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return apiError('That slug already exists. Please use a different slug.', 409, 'CONFLICT')
      }
      return dbFail(error, 'admin/pages POST')
    }

    return Response.json({ page: data }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/pages POST' })
  }
}
