import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { z } from 'zod'

const Create = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens'),
  name: z.string().trim().min(1),
  description: z.string().optional(),
})

// GET /api/admin/contact-lists — list contact lists with member counts; admin only.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { data: lists, error } = await auth.supabase
    .from('contact_lists')
    .select('id, slug, name, description, is_system, created_at')
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })

  if (error) return apiError(error.message, 500, 'DB_ERROR')

  const enriched = await Promise.all(
    (lists || []).map(async (list) => {
      const { count } = await auth.supabase
        .from('contact_list_members')
        .select('contact_id', { count: 'exact', head: true })
        .eq('list_id', list.id)
      return { ...list, member_count: count ?? 0 }
    })
  )

  return apiOk({ lists: enriched })
}

// POST /api/admin/contact-lists — create a contact list; admin only.
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, Create)
  if (!parsed.ok) return parsed.response

  const { data, error } = await auth.supabase
    .from('contact_lists')
    .insert({ slug: parsed.data.slug, name: parsed.data.name, description: parsed.data.description ?? null })
    .select('id, slug, name, description, is_system, created_at, updated_at')
    .single()
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ list: data }, 201)
}
