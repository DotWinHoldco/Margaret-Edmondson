// Revision history for the unified page editor.
//
// Every section save writes the previous value as a snapshot row. A
// trigger trims the table to the 5 most-recent per (page_slug,
// section_key). Revert reads a snapshot and pushes it back through
// the same saveSection path, so reverts are themselves undoable.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/lib/types/database'

export async function recordRevision(
  supabase: SupabaseClient,
  pageSlug: string,
  sectionKey: string,
  snapshot: unknown,
  editedBy: string | null
): Promise<void> {
  const { error } = await supabase.from('page_revisions').insert({
    page_slug: pageSlug,
    section_key: sectionKey,
    snapshot: (snapshot ?? null) as Json,
    edited_by: editedBy,
  })
  if (error) {
    console.error('recordRevision failed', { pageSlug, sectionKey, error })
  }
}

export interface ListedRevision {
  id: string
  page_slug: string
  section_key: string
  snapshot: unknown
  edited_by: string | null
  edited_by_name: string | null
  created_at: string
}

export async function listRevisions(
  supabase: SupabaseClient,
  pageSlug: string,
  sectionKey: string,
  limit = 5
): Promise<ListedRevision[]> {
  const { data, error } = await supabase
    .from('page_revisions')
    .select('id, page_slug, section_key, snapshot, edited_by, created_at, profiles:edited_by(full_name)')
    .eq('page_slug', pageSlug)
    .eq('section_key', sectionKey)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('listRevisions failed', error)
    return []
  }
  return (data || []).map((row: Record<string, unknown>) => {
    const profile = row.profiles as { full_name?: string | null } | null
    return {
      id: row.id as string,
      page_slug: row.page_slug as string,
      section_key: row.section_key as string,
      snapshot: row.snapshot,
      edited_by: row.edited_by as string | null,
      edited_by_name: profile?.full_name ?? null,
      created_at: row.created_at as string,
    }
  })
}

export async function getRevision(
  supabase: SupabaseClient,
  revisionId: string
): Promise<ListedRevision | null> {
  const { data, error } = await supabase
    .from('page_revisions')
    .select('id, page_slug, section_key, snapshot, edited_by, created_at, profiles:edited_by(full_name)')
    .eq('id', revisionId)
    .maybeSingle()
  if (error || !data) return null
  const profile = (data as Record<string, unknown>).profiles as { full_name?: string | null } | null
  return {
    id: data.id,
    page_slug: data.page_slug,
    section_key: data.section_key,
    snapshot: data.snapshot,
    edited_by: data.edited_by,
    edited_by_name: profile?.full_name ?? null,
    created_at: data.created_at,
  }
}
