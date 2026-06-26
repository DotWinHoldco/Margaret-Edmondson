import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { MEDIUMS, sizeDimensions, type Medium } from '@/lib/pricing/mediums'
import { getMediumConfig } from '@/lib/pricing/medium-config'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'
import { buildPricedVariantRow } from '@/lib/pricing/variant-insert'

const Body = z.object({
  product_id: z.string().uuid(),
  medium: z.enum(MEDIUMS as unknown as [Medium, ...Medium[]]),
  size_labels: z.array(z.string()).min(1),
  margin_override_pct: z.number().nullable().optional(),
})

// POST /api/admin/variants/bulk-create — create priced variants for a product across medium and sizes (idempotent); admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { product_id, medium, size_labels } = parsed.data

  const cfg = await getMediumConfig(auth.supabase, medium)
  if (!cfg || !cfg.subcategory_id) {
    return apiError(`Medium ${medium} is not configured. Run the Lumaprints sync first.`, 400, 'MEDIUM_NOT_CONFIGURED')
  }

  // Dedup server-side: never create a (medium × size) that already exists on
  // this product. Makes the endpoint idempotent so rapid double-clicks / the
  // aspect-fix tool can't stack duplicates.
  const { data: existingRows } = await auth.supabase
    .from('product_variants')
    .select('size_label')
    .eq('product_id', product_id)
    .eq('medium', medium)
  const existingSizes = new Set((existingRows || []).map((r) => r.size_label))
  const skipped = size_labels.filter((s) => existingSizes.has(s))
  const sizesToCreate = size_labels.filter((s) => !existingSizes.has(s))
  if (sizesToCreate.length === 0) {
    return apiOk({ created: [], skipped }) // all already existed — not an error
  }

  const { data: settings } = await auth.supabase
    .from('site_settings')
    .select('shipping_quote_zips')
    .eq('id', true)
    .single()
  // Effective default margin = product → category → site → 100.
  const productDefaultMargin = await getEffectiveProductMargin(auth.supabase, product_id)
  const zips: string[] = settings?.shipping_quote_zips || ['33101', '98101', '04401', '92101']

  const rows: Array<Record<string, unknown>> = []
  for (const size_label of sizesToCreate) {
    const dims = sizeDimensions(size_label)
    if (!dims) continue
    rows.push(
      await buildPricedVariantRow(auth.supabase, {
        product_id,
        medium,
        size_label,
        width_in: dims.width,
        height_in: dims.height,
        productDefaultMargin,
        cfg,
        zips,
        margin_override_pct: parsed.data.margin_override_pct ?? null,
        is_active: true, // bulk-create publishes immediately (legacy behavior)
      }),
    )
  }

  if (rows.length === 0) return apiOk({ created: [], skipped })

  const { data, error } = await auth.supabase
    .from('product_variants')
    .insert(rows)
    .select('id, medium, size_label')

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ created: data, skipped })
}
