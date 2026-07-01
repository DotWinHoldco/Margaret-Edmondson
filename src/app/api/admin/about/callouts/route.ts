import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiOk, dbFail, parseBody } from '@/lib/api/respond'

const Body = z.object({
  kind: z.enum(['motto', 'quote', 'list']),
  label: z.string().min(1),
  body_markdown: z.string().min(1),
  display_order: z.number().int().nonnegative().default(0),
  is_published: z.boolean().default(false),
})

// POST /api/admin/about/callouts — create a bio callout; admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response

  const { data, error } = await auth.supabase
    .from('bio_callouts')
    .insert(parsed.data)
    .select('id')
    .single()

  if (error) return dbFail(error, 'admin/about/callouts POST')
  return apiOk({ id: data.id })
}
