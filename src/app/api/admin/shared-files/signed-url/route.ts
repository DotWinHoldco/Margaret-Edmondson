import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const BUCKET = 'shared-files'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const { data: row, error: rowErr } = await supabase
    .from('shared_files')
    .select('file_path, file_name')
    .eq('id', id)
    .single()
  if (rowErr || !row)
    return Response.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.file_path, 60 * 10, { download: row.file_name })
  if (error || !data)
    return Response.json({ error: error?.message || 'Signing failed' }, { status: 500 })

  return Response.json({ url: data.signedUrl, file_name: row.file_name })
}
