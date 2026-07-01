import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiOk, parseBody, dbFail } from '@/lib/api/respond'
import { recomputeProductVariantPrices } from '@/lib/pricing/margin'

// null = inherit the category → site default.
const Body = z.object({
  default_margin_pct: z.number().min(0).max(1000).nullable(),
})

// PATCH /api/admin/products/[id]/margin — set a product's default markup and re-price its variants; admin only.
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
  if (error) return dbFail(error)
  const repriced = await recomputeProductVariantPrices(id)
  return apiOk({ id, default_margin_pct: parsed.data.default_margin_pct, repriced })
}
