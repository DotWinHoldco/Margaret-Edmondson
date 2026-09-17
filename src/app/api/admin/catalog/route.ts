// Authored by DotWin
// The admin Print Catalog manager's single read.
//
// It answers with the FULL tree — disabled rows, tombstoned rows, `effective_enabled`,
// `blocked_reason` and each group's `default_option_id` — because the toggle UI has to
// show the rows an admin has switched off, and has to see its own write immediately.
// The cached public loaders are deliberately not used here: they are filtered and
// revalidating, so a toggle would appear to do nothing for up to five minutes.
//
// The medium switch rows come alongside the tree rather than inside it: the tree carries
// only `medium_enabled` per subcategory, and the manager's top level is the medium itself.

import { requireAdmin } from '@/lib/auth/require-admin'
import { apiFail, apiOk, dbFail } from '@/lib/api/respond'
import { getAdminCatalog } from '@/lib/catalog/load'

/** Explicit columns (house gate: never select('*')); these are the medium-switch fields the manager renders. */
const MEDIUM_COLS = 'medium, name, enabled, subcategory_id, last_synced_at'

// GET /api/admin/catalog — the full catalog tree (disabled and tombstoned rows included)
// plus the medium switch rows, for the admin Print Catalog manager; admin only.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const catalog = await getAdminCatalog(auth.supabase)
    const { data, error } = await auth.supabase
      .from('lumaprints_mediums')
      .select(MEDIUM_COLS)
      .order('medium')
    if (error) return dbFail(error, 'admin/catalog GET mediums')
    return apiOk({ catalog, mediums: data ?? [] })
  } catch (err) {
    return apiFail(err, { context: 'admin/catalog GET', code: 'DATABASE_ERROR' })
  }
}
