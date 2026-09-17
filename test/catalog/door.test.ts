// Authored by DotWin
//
// The configurator door (ADR-8). One switch decides whether a shopper sees the
// configurator and whether the public quote route answers at all, so the two things
// that matter here are that PRODUCTION cannot be opened or closed by an environment
// variable, and that a database that cannot answer does not decide on its own.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { configuratorForcedByEnv, isConfiguratorOpen } from '@/lib/catalog/door'

interface Read {
  table: string
  columns: string
}

function fakeClient(
  result: { data: unknown; error: unknown },
  reads: Read[] = [],
): SupabaseClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          reads.push({ table, columns })
          const builder = {
            eq: () => builder,
            maybeSingle: async () => result,
          }
          return builder
        },
      }
    },
  } as unknown as SupabaseClient
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('configuratorForcedByEnv', () => {
  it('ignores the override in production, whatever it says', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('PRINT_CONFIGURATOR_FORCE', 'on')
    expect(configuratorForcedByEnv()).toBeNull()

    vi.stubEnv('PRINT_CONFIGURATOR_FORCE', 'off')
    expect(configuratorForcedByEnv()).toBeNull()
  })

  it('honours on and off outside production, and ignores anything else', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('PRINT_CONFIGURATOR_FORCE', 'ON')
    expect(configuratorForcedByEnv()).toBe(true)

    vi.stubEnv('PRINT_CONFIGURATOR_FORCE', ' off ')
    expect(configuratorForcedByEnv()).toBe(false)

    vi.stubEnv('PRINT_CONFIGURATOR_FORCE', 'maybe')
    expect(configuratorForcedByEnv()).toBeNull()

    vi.stubEnv('PRINT_CONFIGURATOR_FORCE', '')
    expect(configuratorForcedByEnv()).toBeNull()
  })
})

describe('isConfiguratorOpen', () => {
  it('reads the database in production even with the override set', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('PRINT_CONFIGURATOR_FORCE', 'on')
    const reads: Read[] = []
    const client = fakeClient({ data: { print_configurator_enabled: false }, error: null }, reads)

    await expect(isConfiguratorOpen(client)).resolves.toBe(false)
    expect(reads).toEqual([{ table: 'site_settings', columns: 'print_configurator_enabled' }])
  })

  it('opens and closes a preview from the override without reading the database', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const reads: Read[] = []

    vi.stubEnv('PRINT_CONFIGURATOR_FORCE', 'on')
    await expect(
      isConfiguratorOpen(fakeClient({ data: { print_configurator_enabled: false }, error: null }, reads)),
    ).resolves.toBe(true)

    vi.stubEnv('PRINT_CONFIGURATOR_FORCE', 'off')
    await expect(
      isConfiguratorOpen(fakeClient({ data: { print_configurator_enabled: true }, error: null }, reads)),
    ).resolves.toBe(false)

    expect(reads).toEqual([])
  })

  it('is open only when the stored flag is exactly true', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    await expect(
      isConfiguratorOpen(fakeClient({ data: { print_configurator_enabled: true }, error: null })),
    ).resolves.toBe(true)
    await expect(
      isConfiguratorOpen(fakeClient({ data: { print_configurator_enabled: null }, error: null })),
    ).resolves.toBe(false)
    await expect(isConfiguratorOpen(fakeClient({ data: null, error: null }))).resolves.toBe(false)
  })

  it('throws when the row cannot be read rather than guessing open or closed', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const client = fakeClient({ data: null, error: { message: 'connection reset' } })
    await expect(isConfiguratorOpen(client)).rejects.toMatchObject({ message: 'connection reset' })
  })
})
