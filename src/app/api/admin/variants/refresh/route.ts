import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { refreshCachedPrice } from '@/lib/pricing/lumaprints-cache'
import { customerPriceCents } from '@/lib/pricing/variant-pricing'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'
import type { Medium } from '@/lib/pricing/mediums'

const Body = z.object({
  product_id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional(),
})

interface VariantRow {
  id: string
  product_id: string
  medium: Medium | null
  size_label: string | null
  lumaprints_cost_cents: number | null
  shipping_cost_cents: number | null
  margin_override_pct: number | null
  manual_price_override_cents: number | null
}

interface RefreshDiff {
  id: string
  medium: Medium
  size_label: string
  cost_before: number
  cost_after: number
  shipping_before: number
  shipping_after: number
}

// POST /api/admin/variants/refresh — re-fetch live wholesale/shipping costs for a product's or variant's variants and re-price them; admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response

  const { data: settings } = await auth.supabase
    .from('site_settings')
    .select('default_margin_pct, shipping_quote_zips')
    .eq('id', true)
    .single()
  const siteDefault = Number(settings?.default_margin_pct ?? 100)
  const zips: string[] = settings?.shipping_quote_zips || ['33101', '98101', '04401', '92101']

  let query = auth.supabase
    .from('product_variants')
    .select('id, product_id, medium, size_label, lumaprints_cost_cents, shipping_cost_cents, margin_override_pct, manual_price_override_cents')

  if (parsed.data.variant_id) query = query.eq('id', parsed.data.variant_id)
  else if (parsed.data.product_id) query = query.eq('product_id', parsed.data.product_id)
  else return apiError('Provide variant_id or product_id', 400, 'NO_TARGET')

  const { data: variants, error: readErr } = await query
  if (readErr) return dbFail(readErr, 'admin/variants refresh read')

  const diffs: RefreshDiff[] = []
  const productMargin = new Map<string, number>()
  let unavailable = 0

  for (const v of (variants || []) as VariantRow[]) {
    if (!v.medium || !v.size_label) continue
    if (!productMargin.has(v.product_id)) {
      // Effective default = product → category → site → 100 (variant override
      // is applied per-row by customerPriceCents below).
      productMargin.set(v.product_id, await getEffectiveProductMargin(auth.supabase, v.product_id))
    }
    const defaultMargin = productMargin.get(v.product_id) ?? siteDefault

    let live: { cost_cents: number; shipping_cents: number }
    try {
      live = await refreshCachedPrice(auth.supabase, v.medium, v.size_label, zips)
    } catch {
      // Could not fetch — mark unavailable but keep the manual override intact.
      await auth.supabase
        .from('product_variants')
        .update({ is_lumaprints_available: false, updated_at: new Date().toISOString() })
        .eq('id', v.id)
      unavailable += 1
      continue
    }

    diffs.push({
      id: v.id,
      medium: v.medium,
      size_label: v.size_label,
      cost_before: v.lumaprints_cost_cents ?? 0,
      cost_after: live.cost_cents,
      shipping_before: v.shipping_cost_cents ?? 0,
      shipping_after: live.shipping_cents,
    })

    const customer = customerPriceCents(
      {
        lumaprints_cost_cents: live.cost_cents,
        shipping_cost_cents: live.shipping_cents,
        margin_override_pct: v.margin_override_pct,
        manual_price_override_cents: v.manual_price_override_cents,
      },
      defaultMargin,
    )

    await auth.supabase
      .from('product_variants')
      .update({
        lumaprints_cost_cents: live.cost_cents,
        shipping_cost_cents: live.shipping_cents,
        is_lumaprints_available: live.cost_cents > 0,
        last_priced_at: new Date().toISOString(),
        wholesale_cost: live.cost_cents / 100,
        worst_case_shipping: live.shipping_cents / 100,
        shipping_quoted_at: new Date().toISOString(),
        price: customer / 100,
        updated_at: new Date().toISOString(),
      })
      .eq('id', v.id)
  }

  return apiOk({ refreshed: diffs.length, unavailable, diffs })
}
