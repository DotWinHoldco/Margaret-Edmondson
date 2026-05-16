import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageId, printMasterPath } = (await request.json()) as {
    imageId?: string
    printMasterPath?: string | null
  }
  if (!imageId) return Response.json({ error: 'imageId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('product_images')
    .update({ print_master_path: printMasterPath || null })
    .eq('id', imageId)
    .eq('product_id', id)
    .select('id, print_master_path')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}
