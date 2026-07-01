import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { sanitizeHtml } from '@/lib/sanitize'

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

    if (error) return dbFail(error, 'admin/faqs GET')

    return Response.json({ faqs: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/faqs GET' })
  }
}

// POST /api/admin/faqs — create an FAQ; admin only.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { question, answer, category, is_published, sort_order } = body

    if (!question || !answer) {
      return apiError('Question and answer are required.', 400, 'VALIDATION_FAILED')
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('faqs')
      .insert({
        question,
        answer_html: sanitizeHtml(answer),
        answer_json: {},
        category: category || 'general',
        is_published: is_published ?? true,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single()

    if (error) return dbFail(error, 'admin/faqs POST')

    return Response.json({ faq: data }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/faqs POST' })
  }
}

// PATCH /api/admin/faqs — update an FAQ by id; admin only.
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, answer, ...rest } = body

    if (!id) return apiError('ID is required.', 400, 'VALIDATION_FAILED')

    // Map the editor's `answer` field onto the real sanitized `answer_html`
    // column; the raw `answer` key does not exist on the table.
    const updates: Record<string, unknown> = { ...rest }
    if (answer !== undefined) updates.answer_html = sanitizeHtml(answer)

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('faqs')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return dbFail(error, 'admin/faqs PATCH')

    return Response.json({ faq: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/faqs PATCH' })
  }
}

// DELETE /api/admin/faqs?id= — permanently delete an FAQ by id; admin only.
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return apiError('ID is required.', 400, 'VALIDATION_FAILED')

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { error } = await supabase.from('faqs').delete().eq('id', id)

    if (error) return dbFail(error, 'admin/faqs DELETE')

    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/faqs DELETE' })
  }
}
