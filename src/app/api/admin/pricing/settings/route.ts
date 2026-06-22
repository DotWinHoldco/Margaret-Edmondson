import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { recomputeAllVariantPrices } from '@/lib/pricing/margin'
// GET /api/admin/pricing/settings — read site default margin and shipping quote zips; admin only.
export async function GET() {
  const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
    .from('site_settings')
    .select('default_margin_pct, shipping_quote_zips, updated_at')
    .eq('id', true)
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}

// PATCH /api/admin/pricing/settings — update site default margin/zips and re-price inheriting variants; admin only.
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const body = await request.json() as {
    default_margin_pct?: number
    shipping_quote_zips?: string[]
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let marginChanged = false
  if (typeof body.default_margin_pct === 'number') {
    // Markup percent (cost-plus): 0..1000. 100 = 100% markup = 2× cost.
    if (body.default_margin_pct < 0 || body.default_margin_pct > 1000) {
      return Response.json({ error: 'default_margin_pct must be a percent between 0 and 1000' }, { status: 400 })
    }
    updates.default_margin_pct = body.default_margin_pct
    marginChanged = true
  }
  if (Array.isArray(body.shipping_quote_zips)) {
    updates.shipping_quote_zips = body.shipping_quote_zips.map((z) => String(z).trim()).filter(Boolean)
  }

  const { data, error } = await supabase
    .from('site_settings')
    .update(updates)
    .eq('id', true)
    .select('default_margin_pct, shipping_quote_zips, updated_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Cascade: the site default is the lowest-priority margin — changing it
  // re-prices every variant that inherits it (no category/product/variant override).
  let repriced = 0
  if (marginChanged) repriced = await recomputeAllVariantPrices(supabase)
  return Response.json({ data, repriced })
}
