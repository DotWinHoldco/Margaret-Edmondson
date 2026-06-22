import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { parseSortYear } from '@/lib/cv'

const Body = z.object({
  section: z.enum(['exhibitions', 'education', 'affiliations', 'experience']),
  year: z.string().min(1),
  title: z.string().min(1),
  venue: z.string().nullable().optional(),
  institution: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  juror: z.string().nullable().optional(),
  award: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  linked_artwork_slug: z.string().nullable().optional(),
  display_order: z.number().int().nonnegative().default(0),
  is_published: z.boolean().default(true),
})

// POST /api/admin/cv-entries — create a CV entry; admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response

  const sort_year_numeric = parseSortYear(parsed.data.year)

  const { data, error } = await auth.supabase
    .from('cv_entries')
    .insert({ ...parsed.data, sort_year_numeric })
    .select('id')
    .single()

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ id: data.id })
}
