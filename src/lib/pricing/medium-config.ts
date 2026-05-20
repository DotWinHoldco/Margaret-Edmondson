/**
 * Server-side helper that reads each medium's Lumaprints config from
 * the lumaprints_mediums table (populated by /api/admin/lumaprints/sync).
 *
 * This replaces the hardcoded MEDIUMS_CATALOG lookups in pricing code.
 * The MEDIUMS_CATALOG file remains the source of human-facing labels
 * but no longer dictates which subcategoryId / option_ids to send.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medium } from '@/lib/pricing/mediums'

export interface MediumConfig {
  medium: Medium
  subcategory_id: number | null
  option_ids: number[]
  sizes: Array<{ size_label: string; width: number; height: number }>
  enabled: boolean
  name: string | null
}

interface Row {
  medium: string
  subcategory_id: number | null
  option_ids: number[] | null
  sizes: Array<{ size_label: string; width: number; height: number }> | null
  enabled: boolean
  name: string | null
}

export async function getMediumConfig(
  supabase: SupabaseClient,
  medium: Medium,
): Promise<MediumConfig | null> {
  const { data } = await supabase
    .from('lumaprints_mediums')
    .select('medium, subcategory_id, option_ids, sizes, enabled, name')
    .eq('medium', medium)
    .maybeSingle()
  if (!data) return null
  const row = data as Row
  return {
    medium: row.medium as Medium,
    subcategory_id: row.subcategory_id,
    option_ids: row.option_ids || [],
    sizes: row.sizes || [],
    enabled: row.enabled,
    name: row.name,
  }
}

export async function getAllMediumConfigs(supabase: SupabaseClient): Promise<MediumConfig[]> {
  const { data } = await supabase
    .from('lumaprints_mediums')
    .select('medium, subcategory_id, option_ids, sizes, enabled, name')
    .order('medium', { ascending: true })
  return ((data || []) as Row[]).map((row) => ({
    medium: row.medium as Medium,
    subcategory_id: row.subcategory_id,
    option_ids: row.option_ids || [],
    sizes: row.sizes || [],
    enabled: row.enabled,
    name: row.name,
  }))
}
