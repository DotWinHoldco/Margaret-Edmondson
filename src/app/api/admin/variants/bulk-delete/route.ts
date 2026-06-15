import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'

const Body = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) })

// Delete many variants at once — used by the "select all in a category" bulk
// action and by the aspect-fix tool (off-shape + duplicate cleanup).
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { error, count } = await auth.supabase
    .from('product_variants')
    .delete({ count: 'exact' })
    .in('id', parsed.data.ids)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ deleted: count ?? parsed.data.ids.length })
}
