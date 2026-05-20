// GET last 5 revisions for a section.

import { requireAdmin } from '@/lib/auth/require-admin'
import { apiOk } from '@/lib/api/respond'
import { listRevisions } from '@/lib/page-editor/revisions'
import type { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; section: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { slug, section } = await params

  const revisions = await listRevisions(auth.supabase, slug, section, 5)
  return apiOk({ revisions })
}
