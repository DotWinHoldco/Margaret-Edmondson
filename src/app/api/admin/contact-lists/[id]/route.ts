import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { z } from 'zod'
import { NextRequest } from 'next/server'

const Patch = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  const { data, error } = await auth.supabase
    .from('contact_lists')
    .update(parsed.data)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ list: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const { data: list } = await auth.supabase
    .from('contact_lists')
    .select('is_system')
    .eq('id', id)
    .maybeSingle()
  if (list?.is_system) return apiError('System lists cannot be deleted', 400, 'IS_SYSTEM')

  const { error } = await auth.supabase
    .from('contact_lists')
    .delete()
    .eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ id })
}
