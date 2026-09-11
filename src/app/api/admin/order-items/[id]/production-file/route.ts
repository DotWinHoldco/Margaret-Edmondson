import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, dbFail } from '@/lib/api/respond'

// Give an administrator a short-lived download of the exact source purchased on this order.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const { data, error } = await auth.supabase
    .from('order_items')
    .select('print_storage_path,purchase_spec')
    .eq('id', id)
    .single()
  if (error) return dbFail(error)
  if (!data.print_storage_path)
    return apiError(
      'This order uses an externally held production source. See its work ticket for the approved reference.',
      404,
      'EXTERNAL_PRODUCTION_SOURCE',
    )
  const { data: signed, error: signError } = await auth.supabase.storage
    .from('print-masters')
    .createSignedUrl(data.print_storage_path, 300, { download: true })
  if (signError || !signed)
    return apiError(
      'The production file could not be opened. Check the approved source in the artwork library.',
      409,
      'FILE_UNAVAILABLE',
    )
  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.signedUrl,
      'Cache-Control': 'private, no-store',
    },
  })
}
