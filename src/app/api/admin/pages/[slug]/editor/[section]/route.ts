// PATCH one section of a page. Writes a revision snapshot of the
// previous value before applying the update.

import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk } from '@/lib/api/respond'
import { getServerAdapter } from '@/lib/page-editor/server-registry'
import { recordRevision } from '@/lib/page-editor/revisions'
import type { NextRequest } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; section: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { slug, section } = await params

  const adapter = getServerAdapter(slug)
  if (!adapter) return apiError(`No editor registered for ${slug}`, 404, 'NO_ADAPTER')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400, 'BAD_JSON')
  }

  const payload = (body as { value?: unknown })?.value
  if (payload === undefined) return apiError('Missing value', 400, 'MISSING_VALUE')

  try {
    // Capture the previous value as a revision before applying.
    const previous = adapter.loadSection
      ? await adapter.loadSection(auth.supabase, section)
      : ((await adapter.load(auth.supabase)) as Record<string, unknown>)[section]
    await recordRevision(auth.supabase, slug, section, previous, auth.user.id)

    await adapter.saveSection(auth.supabase, section, payload, auth.user.id)
    const next = adapter.loadSection
      ? await adapter.loadSection(auth.supabase, section)
      : ((await adapter.load(auth.supabase)) as Record<string, unknown>)[section]
    return apiOk({ slug, section, value: next })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Save failed'
    return apiError(msg, 500, 'SAVE_FAILED')
  }
}
