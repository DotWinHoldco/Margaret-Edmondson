import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk } from '@/lib/api/respond'

interface Row {
  medium: string
  category_id: number | null
  subcategory_id: number | null
  name: string | null
  option_ids: number[]
  sizes: Array<{ size_label: string; width: number; height: number }>
  enabled: boolean
  last_synced_at: string | null
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { data, error } = await auth.supabase
    .from('lumaprints_mediums')
    .select('medium, category_id, subcategory_id, name, option_ids, sizes, enabled, last_synced_at')
    .order('medium', { ascending: true })
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ items: (data || []) as Row[] })
}
