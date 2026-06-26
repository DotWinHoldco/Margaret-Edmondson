import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { customerPriceCents } from '@/lib/pricing/variant-pricing'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'

const Patch = z.object({
  margin_override_pct: z.number().nullable().optional(),
  manual_price_override_cents: z.number().int().nonnegative().nullable().optional(),
  is_active: z.boolean().optional(),
  // Custom-size variants can be renamed inline (e.g. "Life Size").
  name: z.string().trim().min(1).max(120).optional(),
})

// PATCH /api/admin/variants/[id] — update a variant's margin/price overrides and recompute its price; admin only.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  const { data: existing, error: readErr } = await auth.supabase
    .from('product_variants')
    .select('id, product_id, lumaprints_cost_cents, shipping_cost_cents, margin_override_pct, manual_price_override_cents, is_active, is_lumaprints_available')
    .eq('id', id)
    .single()
  if (readErr) return apiError(readErr.message, 500, 'DB_ERROR')

  // Effective default = product → category → site → 100.
  const defaultMargin = await getEffectiveProductMargin(auth.supabase, existing.product_id)

  const merged = {
    lumaprints_cost_cents: existing.lumaprints_cost_cents ?? 0,
    shipping_cost_cents: existing.shipping_cost_cents ?? 0,
    margin_override_pct: parsed.data.margin_override_pct !== undefined ? parsed.data.margin_override_pct : existing.margin_override_pct,
    manual_price_override_cents: parsed.data.manual_price_override_cents !== undefined ? parsed.data.manual_price_override_cents : existing.manual_price_override_cents,
  }

  const newPriceCents = customerPriceCents(merged, defaultMargin)

  const update: Record<string, unknown> = {
    ...parsed.data,
    price: newPriceCents / 100,
    updated_at: new Date().toISOString(),
  }
  const { error } = await auth.supabase.from('product_variants').update(update).eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ id, price_cents: newPriceCents })
}

// DELETE /api/admin/variants/[id] — delete a product variant by id; admin only.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const { error } = await auth.supabase.from('product_variants').delete().eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ success: true })
}
