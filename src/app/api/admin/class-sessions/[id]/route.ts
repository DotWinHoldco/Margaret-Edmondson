import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, dbFail, parseBody } from '@/lib/api/respond'

const Patch = z.object({
  audience: z.enum(['adult', 'teen', 'kids', 'family']).optional(),
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  starts_at: z.string().min(1).optional(),
  ends_at: z.string().min(1).optional(),
  price_cents: z.number().int().nonnegative().optional(),
  capacity: z.number().int().positive().optional(),
  location_name: z.string().min(1).optional(),
  location_address: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['draft', 'published', 'sold_out', 'completed', 'cancelled']).optional(),
})

// PATCH /api/admin/class-sessions/[id] — update a class session; admin only.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  // class_sessions.slug is UNIQUE; a clashing edit surfaces as a friendly conflict.
  const { error } = await auth.supabase
    .from('class_sessions')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    if (error.code === '23505')
      return apiError('A session with that link already exists. Please use a different slug.', 409, 'CONFLICT')
    return dbFail(error, 'admin/class-sessions/[id] PATCH')
  }
  return apiOk({ id })
}

// DELETE /api/admin/class-sessions/[id] — delete a class session; admin only.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const { error } = await auth.supabase.from('class_sessions').delete().eq('id', id)
  if (error) return dbFail(error, 'admin/class-sessions/[id] DELETE')
  return apiOk({ success: true })
}
