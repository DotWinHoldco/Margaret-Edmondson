import type { SupabaseClient } from '@supabase/supabase-js'

interface AuditEntry {
  table_name: string
  record_id: string
  field_name: string
  old_value: string | null
  new_value: string | null
  changed_by: string
}

/**
 * Diff two objects and write one audit_log row per changed field.
 * Skips fields that are identical and `updated_at`-style noise.
 */
export async function logChanges(
  supabase: SupabaseClient,
  opts: {
    tableName: string
    recordId: string
    userId: string
    before: Record<string, unknown> | null
    after: Record<string, unknown>
    ignoreFields?: string[]
  },
): Promise<void> {
  const ignore = new Set(['updated_at', 'created_at', ...(opts.ignoreFields ?? [])])
  const entries: AuditEntry[] = []

  for (const key of Object.keys(opts.after)) {
    if (ignore.has(key)) continue
    const before = opts.before?.[key]
    const after = opts.after[key]
    if (serialize(before) === serialize(after)) continue
    entries.push({
      table_name: opts.tableName,
      record_id: opts.recordId,
      field_name: key,
      old_value: serialize(before),
      new_value: serialize(after),
      changed_by: opts.userId,
    })
  }

  if (entries.length === 0) return
  // Audit failures should never block the actual mutation, just log.
  const { error } = await supabase.from('audit_log').insert(entries)
  if (error) console.warn('[audit_log] insert failed:', error.message)
}

function serialize(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
