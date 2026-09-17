// Authored by DotWin
// The print configurator door, as a Settings switch (plan ADR-8).
//
// `site_settings.print_configurator_enabled` decides whether a product page shows the
// configurator (print types, frames, mats, papers and the live preview) or the legacy
// size list, and whether the public print-quote route answers at all. Until now it could
// only be flipped with a database command; the owner asked for a switch. The read path
// (`isConfiguratorOpen`) is per request, so a change reaches the store on the next page
// load with nothing to purge.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { clearSettingsCache } from '@/lib/settings/accessor'

const SELECT = 'print_configurator_enabled, updated_at'

interface DoorRow {
  print_configurator_enabled: boolean | null
  updated_at: string | null
}

const patchSchema = z.object({ enabled: z.boolean() }).strict()

function shape(row: DoorRow) {
  return { enabled: row.print_configurator_enabled === true, updatedAt: row.updated_at }
}

// GET /api/admin/settings/print-configurator — read whether the storefront print configurator is on; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { data, error } = await auth.supabase.from('site_settings').select(SELECT).eq('id', true).maybeSingle()
    if (error) return dbFail(error, 'admin/settings/print-configurator GET')
    if (!data) return apiError('Site settings row missing.', 500, 'SETTINGS_MISSING')
    return Response.json(shape(data as DoorRow))
  } catch (err) {
    return apiFail(err, { context: 'admin/settings/print-configurator GET' })
  }
}

// PATCH /api/admin/settings/print-configurator — turn the storefront print configurator on or off; admin only.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('Send { enabled: true | false }.', 400, 'VALIDATION_FAILED')

    const { data, error } = await auth.supabase
      .from('site_settings')
      .update({ print_configurator_enabled: parsed.data.enabled, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select(SELECT)
      .maybeSingle()
    if (error) return dbFail(error, 'admin/settings/print-configurator PATCH')
    if (!data) return apiError('Site settings row missing.', 500, 'SETTINGS_MISSING')

    // The settings accessor memoizes site_settings for other readers; the door itself is
    // read fresh per request.
    clearSettingsCache()
    return Response.json(shape(data as DoorRow))
  } catch (err) {
    return apiFail(err, { context: 'admin/settings/print-configurator PATCH' })
  }
}
