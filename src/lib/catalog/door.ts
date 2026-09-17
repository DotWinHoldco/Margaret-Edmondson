// Authored by DotWin
// The storefront door for the print configurator (plan ADR-8).
//
// `site_settings.print_configurator_enabled` is the one switch that decides whether a
// shopper sees the configurator or the legacy size picker, and whether the public
// print-quote route answers at all. It is read here and nowhere else, so the PDP, the quote
// route and checkout validation can never disagree about whether the door is open.
//
// Preview deploys share the production database, so the flag alone cannot open the door
// on a preview without opening it on the live store. `PRINT_CONFIGURATOR_FORCE=on|off` is
// an environment override honoured ONLY outside production (`VERCEL_ENV !== 'production'`):
// it lets a preview walk the configurator while production stays dark, and lets the
// rollback drill run on a preview by setting it to `off`. Production ignores the variable
// entirely, so a stray value can never flip the live store.

import type { SupabaseClient } from '@supabase/supabase-js'

/** The override, when one applies to this environment; null means "ask the database". */
export function configuratorForcedByEnv(env: NodeJS.ProcessEnv = process.env): boolean | null {
  if (env.VERCEL_ENV === 'production') return null
  const value = (env.PRINT_CONFIGURATOR_FORCE ?? '').trim().toLowerCase()
  if (value === 'on') return true
  if (value === 'off') return false
  return null
}

/**
 * Whether the configurator door is open for this request. Reads the flag with the client
 * it is given (service client on public routes, the cookie client on pages); a read error
 * is thrown, never swallowed into "open" or "closed", so a database outage can neither
 * expose a dark feature nor silently hide a live one.
 */
export async function isConfiguratorOpen(client: SupabaseClient): Promise<boolean> {
  const forced = configuratorForcedByEnv()
  if (forced !== null) return forced
  const { data, error } = await client
    .from('site_settings')
    .select('print_configurator_enabled')
    .eq('id', true)
    .maybeSingle()
  if (error) throw error
  const row = data as { print_configurator_enabled: boolean | null } | null
  return row?.print_configurator_enabled === true
}
