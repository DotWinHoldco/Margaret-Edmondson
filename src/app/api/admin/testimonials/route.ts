import { createClient } from '@/lib/supabase/server'

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

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('testimonials')
      .select('*, media:testimonial_media(*)')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ testimonials: data })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const fields = pickFields(body)

    if (!fields.name) {
      return Response.json({ error: 'Name is required.' }, { status: 400 })
    }
    if (!fields.quote && !fields.content) {
      return Response.json(
        { error: 'Content or quote is required.' },
        { status: 400 },
      )
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

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ testimonial: data }, { status: 201 })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { id } = body as { id?: string }
    if (!id) return Response.json({ error: 'ID is required.' }, { status: 400 })

    const updates = pickFields(body)
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('testimonials')
      .update(updates)
      .eq('id', id)
      .select('*, media:testimonial_media(*)')
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ testimonial: data })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error: 'ID is required.' }, { status: 400 })

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
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
