import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, dbFail, apiOk } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// Record a print-master storage key against a product_images row.
// The client uploads the file directly to Supabase Storage's print-masters
// bucket (browser → Supabase, bypassing Next.js body limits) and then calls
// this endpoint with the resulting object key.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { imageId, printMasterPath } = (await request.json()) as {
    imageId?: string
    printMasterPath?: string | null
  }
  if (!imageId) return apiError('Could not tell which image to update. Please refresh and try again.', 400, 'VALIDATION_FAILED')

  const { data, error } = await supabase
    .from('product_images')
    .update({ print_master_path: printMasterPath || null })
    .eq('id', imageId)
    .eq('product_id', id)
    .select('id, print_master_path')
    .single()

  if (error) return dbFail(error, 'admin/products images/master PATCH')
  return apiOk(data)
}
