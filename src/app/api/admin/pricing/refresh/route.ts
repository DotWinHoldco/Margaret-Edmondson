import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError } from '@/lib/api/respond'

// Retired: this endpoint used a different gross-margin model and could overwrite
// canonical markup prices. Keep authentication and an explicit migration path;
// never reinterpret an old global/variant request as a current product refresh.
export async function POST() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  return apiError(
    'This older pricing refresh is no longer available. Open Products, edit the product, and choose Refresh all prices to update its current print prices.',
    410,
    'RETIRED_PRICING_PATH',
    { productsPath: '/admin/products', refreshPath: '/api/admin/variants/refresh' },
  )
}
