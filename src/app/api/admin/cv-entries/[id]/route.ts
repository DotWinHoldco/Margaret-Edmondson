import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { parseSortYear } from '@/lib/cv'

const Patch = z.object({
  section: z.enum(['exhibitions', 'education', 'affiliations', 'experience']).optional(),
  year: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  venue: z.string().nullable().optional(),
  institution: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  juror: z.string().nullable().optional(),
  award: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  linked_artwork_slug: z.string().nullable().optional(),
  display_order: z.number().int().nonnegative().optional(),
  is_published: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  const update: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() }
  if (parsed.data.year !== undefined) update.sort_year_numeric = parseSortYear(parsed.data.year)

  const { error } = await auth.supabase.from('cv_entries').update(update).eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ id })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const { error } = await auth.supabase.from('cv_entries').delete().eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ success: true })
}
