import { requireAdmin } from '@/lib/auth/require-admin'
import { apiOk, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// GET /api/admin/contact-lists/[id]/members — list members of a contact list (paginated); admin only.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || '100'), 500)
  const offset = Math.max(Number(url.searchParams.get('offset') || '0'), 0)

  const { data, error, count } = await auth.supabase
    .from('contact_list_members')
    .select('joined_at, source, contact:crm_contacts(id, email, first_name, last_name, status, total_orders, total_spent_cents)', { count: 'exact' })
    .eq('list_id', id)
    .order('joined_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return dbFail(error, 'admin/contact-lists/[id]/members GET')
  return apiOk({ members: data || [], total: count ?? 0 })
}
