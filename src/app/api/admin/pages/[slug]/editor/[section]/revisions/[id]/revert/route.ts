// POST revert — push the named revision's snapshot back through the
// same saveSection path. The revert itself becomes the newest revision
// (capturing the current state), so reverts are undoable.

import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk } from '@/lib/api/respond'
import { getServerAdapter } from '@/lib/page-editor/server-registry'
import { getRevision, recordRevision } from '@/lib/page-editor/revisions'
import type { NextRequest } from 'next/server'

// POST /api/admin/pages/[slug]/editor/[section]/revisions/[id]/revert — restore a page section to a prior revision; admin only.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; section: string; id: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { slug, section, id } = await params

  const adapter = getServerAdapter(slug)
  if (!adapter) return apiError(`No editor registered for ${slug}`, 404, 'NO_ADAPTER')

  const revision = await getRevision(auth.supabase, id)
  if (!revision) return apiError('Revision not found', 404, 'NOT_FOUND')
  if (revision.page_slug !== slug || revision.section_key !== section) {
    return apiError('Revision does not belong to this section', 400, 'BAD_REVISION')
  }

  try {
    const previous = adapter.loadSection
      ? await adapter.loadSection(auth.supabase, section)
      : ((await adapter.load(auth.supabase)) as Record<string, unknown>)[section]
    await recordRevision(auth.supabase, slug, section, previous, auth.user.id)

    await adapter.saveSection(auth.supabase, section, revision.snapshot, auth.user.id)
    const next = adapter.loadSection
      ? await adapter.loadSection(auth.supabase, section)
      : ((await adapter.load(auth.supabase)) as Record<string, unknown>)[section]
    return apiOk({ slug, section, value: next })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Revert failed'
    return apiError(msg, 500, 'REVERT_FAILED')
  }
}
