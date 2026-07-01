import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

// GET /api/admin/shared-file-tags — list shared-file tags ordered by sort/label; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')

    const { data, error } = await supabase
      .from('shared_file_tags')
      .select('slug, label, sort_order, is_default, created_at')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })

    if (error) return dbFail(error, 'admin/shared-file-tags GET')
    return Response.json({ data })
  } catch (err) {
    return apiFail(err, { context: 'admin/shared-file-tags GET' })
  }
}

// POST /api/admin/shared-file-tags — create a shared-file tag (idempotent by slug); admin only.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')

    const body = await request.json()
    const rawLabel = String(body.label || '').trim()
    if (!rawLabel) return apiError('A tag label is required.', 400, 'VALIDATION_FAILED')

    const slug = slugify(rawLabel)
    if (!slug) return apiError('Please enter a valid tag label.', 400, 'VALIDATION_FAILED')

    const { data: existing } = await supabase
      .from('shared_file_tags')
      .select('slug, label, sort_order, is_default, created_at')
      .eq('slug', slug)
      .maybeSingle()
    if (existing) return Response.json({ data: existing })

    const { data, error } = await supabase
      .from('shared_file_tags')
      .insert({
        slug,
        label: rawLabel,
        sort_order: 500,
        is_default: false,
      })
      .select()
      .single()

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return apiError('That tag already exists. Please use a different label.', 409, 'CONFLICT')
      }
      return dbFail(error, 'admin/shared-file-tags POST')
    }
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/shared-file-tags POST' })
  }
}
