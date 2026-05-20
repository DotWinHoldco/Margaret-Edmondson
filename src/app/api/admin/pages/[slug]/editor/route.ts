// GET full editor data for a page slug.
//
// Lives under /editor to avoid colliding with the existing CRUD
// endpoints at /api/admin/pages/[id] (which use UUIDs, not slugs).

import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk } from '@/lib/api/respond'
import { getServerAdapter } from '@/lib/page-editor/server-registry'
import type { NextRequest } from 'next/server'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { slug } = await params

  const adapter = getServerAdapter(slug)
  if (!adapter) return apiError(`No editor registered for ${slug}`, 404, 'NO_ADAPTER')

  try {
    const data = await adapter.load(auth.supabase)
    return apiOk({ slug, sections: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Load failed'
    return apiError(msg, 500, 'LOAD_FAILED')
  }
}
