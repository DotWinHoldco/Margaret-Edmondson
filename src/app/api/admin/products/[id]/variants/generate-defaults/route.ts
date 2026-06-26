import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { MEDIUMS, type Medium } from '@/lib/pricing/mediums'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'
import { buildPricedVariantRow } from '@/lib/pricing/variant-insert'
import { loadBuilderContext } from '@/lib/pricing/builder-context'
import { deriveDefaultTiers, type SizeTier } from '@/lib/pricing/size-tiers'

const Body = z.object({
  medium: z.enum(MEDIUMS as unknown as [Medium, ...Medium[]]),
})

const TIER_NAME: Record<SizeTier, string> = { S: 'Small', M: 'Medium', L: 'Large' }

// POST /api/admin/products/[id]/variants/generate-defaults — derive S/M/L default
// print sizes from the master's print aspect, price each, and insert them as
// DRAFT variants (idempotent: only fills gaps); admin only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id: product_id } = await params
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { medium } = parsed.data

  const ctxRes = await loadBuilderContext(auth.supabase, product_id, medium)
  if (!ctxRes.ok) return apiError(ctxRes.message, ctxRes.status, ctxRes.code)
  const { printW, printH, ratio, cfg, bounds, dpi } = ctxRes.ctx

  const tiers = deriveDefaultTiers(printW, printH, bounds, dpi)
  const droppedTiers = (['S', 'M', 'L'] as SizeTier[]).filter((t) => !tiers.some((x) => x.tier === t))
  if (tiers.length === 0) {
    return apiError(
      `No default size fits this master at ${dpi} DPI within the medium's limits. Use a higher-res master or add a custom size.`,
      400,
      'NO_TIERS_FIT',
    )
  }

  // Idempotent: skip sizes already present for this (product, medium).
  const { data: existingRows } = await auth.supabase
    .from('product_variants')
    .select('size_label')
    .eq('product_id', product_id)
    .eq('medium', medium)
  const existing = new Set((existingRows || []).map((r) => r.size_label))

  const { data: settings } = await auth.supabase
    .from('site_settings')
    .select('shipping_quote_zips')
    .eq('id', true)
    .single()
  const zips: string[] = settings?.shipping_quote_zips || ['33101', '98101', '04401', '92101']
  const productDefaultMargin = await getEffectiveProductMargin(auth.supabase, product_id)

  const rows: Array<Record<string, unknown>> = []
  const skipped: string[] = []
  for (const tier of tiers) {
    if (existing.has(tier.size_label)) {
      skipped.push(tier.size_label)
      continue
    }
    rows.push(
      await buildPricedVariantRow(auth.supabase, {
        product_id,
        medium,
        size_label: tier.size_label,
        width_in: tier.width_in,
        height_in: tier.height_in,
        productDefaultMargin,
        cfg,
        zips,
        is_active: false, // Draft — admin flips to Live to publish.
        is_custom_size: false,
        size_tier: tier.tier,
        aspect_ratio: ratio,
        name: `${TIER_NAME[tier.tier]} — ${tier.display}`,
      }),
    )
  }

  let created: Array<{ id: string; medium: string; size_label: string }> = []
  if (rows.length > 0) {
    const { data, error } = await auth.supabase
      .from('product_variants')
      .insert(rows)
      .select('id, medium, size_label')
    if (error) return apiError(error.message, 500, 'DB_ERROR')
    created = data as typeof created
  }

  return apiOk({ created, skipped, droppedTiers })
}
