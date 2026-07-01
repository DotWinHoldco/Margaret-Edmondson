import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
const MUTABLE_FIELDS = [
  'name',
  'role',
  'title',
  'content',
  'quote',
  'source',
  'event_context',
  'date_received',
  'status',
  'is_featured',
  'sort_order',
  'avatar_url',
  'image_url',
] as const

type MutableField = (typeof MUTABLE_FIELDS)[number]

function pickFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of MUTABLE_FIELDS) {
    if (k in body) out[k as MutableField] = body[k]
  }
  return out
}

// GET /api/admin/testimonials — list testimonials with their media; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('testimonials')
      .select('*, media:testimonial_media(*)')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) return dbFail(error, 'admin/testimonials GET')

    return Response.json({ testimonials: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/testimonials GET' })
  }
}

// POST /api/admin/testimonials — create an approved testimonial; admin only.
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')

    const body = await request.json()
    const fields = pickFields(body)

    if (!fields.name) {
      return apiError('Name is required.', 400, 'VALIDATION_FAILED')
    }
    if (!fields.quote && !fields.content) {
      return apiError('Content or quote is required.', 400, 'VALIDATION_FAILED')
    }

    const { data, error } = await supabase
      .from('testimonials')
      .insert({
        status: 'approved',
        is_featured: false,
        sort_order: 0,
        ...fields,
      })
      .select('*, media:testimonial_media(*)')
      .single()

    if (error) return dbFail(error, 'admin/testimonials POST')
    return Response.json({ testimonial: data }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/testimonials POST' })
  }
}

// PATCH /api/admin/testimonials — update a testimonial's mutable fields by id; admin only.
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')

    const body = await request.json()
    const { id } = body as { id?: string }
    if (!id) return apiError('ID is required.', 400, 'VALIDATION_FAILED')

    const updates = pickFields(body)
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('testimonials')
      .update(updates)
      .eq('id', id)
      .select('*, media:testimonial_media(*)')
      .single()

    if (error) return dbFail(error, 'admin/testimonials PATCH')
    return Response.json({ testimonial: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/testimonials PATCH' })
  }
}

// DELETE /api/admin/testimonials — delete a testimonial and its media files by id; admin only.
export async function DELETE(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return apiError('ID is required.', 400, 'VALIDATION_FAILED')

    // Remove media files from storage
    const { data: media } = await supabase
      .from('testimonial_media')
      .select('storage_path')
      .eq('testimonial_id', id)

    if (media && media.length) {
      const paths = media.map((m) => m.storage_path).filter(Boolean)
      if (paths.length) {
        await supabase.storage.from('testimonials').remove(paths)
      }
    }

    const { error } = await supabase.from('testimonials').delete().eq('id', id)
    if (error) return dbFail(error, 'admin/testimonials DELETE')
    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/testimonials DELETE' })
  }
}
