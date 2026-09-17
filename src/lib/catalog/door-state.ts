// Authored by DotWin
// The configurator door as a word for an admin screen: open, closed, or unknown when
// the flag could not be read. `site_settings` has no browser-role read policy, so this
// reads with the service client; that is a server-only concern and lives here rather
// than in a component.

import { createServiceClient } from '@/lib/supabase/server'
import { isConfiguratorOpen } from './door'

export type DoorState = 'open' | 'closed' | 'unknown'

export async function readConfiguratorDoorState(): Promise<DoorState> {
  try {
    return (await isConfiguratorOpen(await createServiceClient())) ? 'open' : 'closed'
  } catch (err) {
    console.error('door state read failed', err)
    return 'unknown'
  }
}
