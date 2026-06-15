import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { recomputeCategoryVariantPrices, recomputeProductVariantPrices } from '@/lib/pricing/margin'

const Patch = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  default_margin_pct: z.number().min(0).nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response
  if (Object.keys(parsed.data).length === 0) return apiError('No fields', 400, 'NO_CHANGES')
  const { error } = await auth.supabase.from('categories').update(parsed.data).eq('id', id)
  if (error) return apiError(error.message, error.code === '23505' ? 409 : 500, 'DB_ERROR')
  // A category margin change re-prices every product in the category.
  let repriced = 0
  if (parsed.data.default_margin_pct !== undefined) repriced = await recomputeCategoryVariantPrices(auth.supabase, id)
  return apiOk({ id, repriced })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  // Unassign products (they fall back to the site default), then delete. The
  // product_categories FK is ON DELETE CASCADE, so junction rows clear too.
  const { data: affected } = await auth.supabase.from('products').select('id').eq('category_id', id)
  await auth.supabase.from('products').update({ category_id: null }).eq('category_id', id)
  const { error } = await auth.supabase.from('categories').delete().eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  for (const p of affected || []) await recomputeProductVariantPrices(auth.supabase, p.id)
  return apiOk({ deleted: true, reassigned: (affected || []).length })
}
