import { requireAdmin } from '@/lib/auth/require-admin'
// GET /api/admin/faqs — list FAQs ordered by sort order; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('faqs')
      .select('id, question, answer_json, answer_html, category, sort_order, is_published')
      .order('sort_order', { ascending: true })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ faqs: data })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

// POST /api/admin/faqs — create an FAQ; admin only.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { question, answer, category, is_published, sort_order } = body

    if (!question || !answer) {
      return Response.json(
        { error: 'Question and answer are required.' },
        { status: 400 }
      )
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('faqs')
      .insert({
        question,
        answer,
        category: category || 'general',
        is_published: is_published ?? true,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ faq: data }, { status: 201 })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

// PATCH /api/admin/faqs — update an FAQ by id; admin only.
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return Response.json({ error: 'ID is required.' }, { status: 400 })
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('faqs')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ faq: data })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}
