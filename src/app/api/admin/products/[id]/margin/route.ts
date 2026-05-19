import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'

const Body = z.object({
  default_margin_pct: z.number().min(0).max(1000),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { error } = await auth.supabase
    .from('products')
    .update({ default_margin_pct: parsed.data.default_margin_pct, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ id, default_margin_pct: parsed.data.default_margin_pct })
}
