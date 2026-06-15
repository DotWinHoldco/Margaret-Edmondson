import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk } from '@/lib/api/respond'

// Lightweight reload for the variants panel — returns the product's print
// variants (medium set) so VariantsTab can refresh itself after a mutation
// without a full server round-trip / page reload.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const { data, error } = await auth.supabase
    .from('product_variants')
    .select(
      'id, product_id, medium, size_label, lumaprints_cost_cents, shipping_cost_cents, margin_override_pct, manual_price_override_cents, is_active, is_lumaprints_available, last_priced_at',
    )
    .eq('product_id', id)
    .not('medium', 'is', null)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ variants: data })
}
