import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk } from '@/lib/api/respond'
import { getCategories, getSubcategories, getSubcategoryOptions } from '@/lib/integrations/lumaprints'

/**
 * Walk the live Lumaprints catalog (categories → subcategories → options)
 * and persist a per-medium config to lumaprints_mediums. Idempotent;
 * safe to re-run when Lumaprints adds new SKUs.
 *
 * Heuristic name matches map our internal medium keys onto Lumaprints
 * subcategory names. For ambiguous matches (e.g., multiple canvas
 * thicknesses), we prefer the 1.25" depth because that's what Margaret
 * already sells. Subcategory options that are required for shipping
 * quotes (e.g., frame style on framed canvas) get baked into
 * option_ids; everything else is left empty for the variant builder
 * to surface as choices later.
 */

interface LumaSubcategory {
  subcategoryId: number
  name: string
  sizes?: Array<{ size?: string; sizeLabel?: string; width?: number; height?: number }>
  availableSizes?: Array<{ size?: string; sizeLabel?: string; width?: number; height?: number }>
}

interface LumaCategory {
  categoryId: number
  name: string
}

interface LumaOption {
  optionId: number
  name?: string
  description?: string
  required?: boolean
}

interface MediumMatch {
  keyword: RegExp                   // matches against subcategory name (case-insensitive)
  preferDepth?: '1.25' | '0.75'     // when multiple matches, prefer this canvas depth
  /** Names of options to bake in by default. Match against option name. */
  defaultOptions?: RegExp[]
}

const MEDIUM_RULES: Record<string, MediumMatch> = {
  // canvas + framed_canvas are pre-seeded with proven IDs; resync still
  // refreshes their option ids + size grids.
  canvas: {
    keyword: /^canvas/i,
    preferDepth: '1.25',
  },
  framed_canvas: {
    keyword: /framed.*canvas/i,
    preferDepth: '1.25',
    defaultOptions: [/black.*float/i, /^float/i],
  },
  fine_art_paper: {
    keyword: /fine\s*art\s*paper/i,
  },
  framed_fine_art_paper: {
    keyword: /framed.*(fine\s*art\s*paper|paper)/i,
  },
  foam_mounted_fine_art_paper: {
    keyword: /foam.*(mount|board)|mounted.*paper/i,
  },
  metal: {
    keyword: /^metal/i,
  },
  peel_and_stick: {
    keyword: /peel.*stick|peel-and-stick|wall.*decal/i,
  },
  rolled_canvas: {
    keyword: /rolled.*canvas|canvas.*roll/i,
  },
}

function normalizeSizes(raw: LumaSubcategory['sizes'] | LumaSubcategory['availableSizes']): Array<{ size_label: string; width: number; height: number }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ size_label: string; width: number; height: number }> = []
  for (const s of raw) {
    let label = (s.sizeLabel || s.size || '').trim()
    let w = Number(s.width || 0)
    let h = Number(s.height || 0)
    if (!w || !h) {
      const m = label.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i)
      if (m) { w = Number(m[1]); h = Number(m[2]) }
    }
    if (!label && w && h) label = `${w}x${h}`
    if (w && h && label) {
      // Normalize to "WxH" (no spaces, lowercase x)
      const norm = `${w}x${h}`
      out.push({ size_label: norm, width: w, height: h })
    }
  }
  // Dedupe by label
  const seen = new Set<string>()
  return out.filter((s) => (seen.has(s.size_label) ? false : (seen.add(s.size_label), true)))
}

function pickBest(matches: Array<{ category: LumaCategory; sub: LumaSubcategory }>, preferDepth?: '1.25' | '0.75'): { category: LumaCategory; sub: LumaSubcategory } | null {
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]
  if (preferDepth) {
    const preferred = matches.find((m) => m.sub.name.includes(preferDepth!))
    if (preferred) return preferred
  }
  // Otherwise return the shortest name (usually the default variant).
  return matches.sort((a, b) => a.sub.name.length - b.sub.name.length)[0]
}

export async function POST(_request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let categories: LumaCategory[]
  try {
    categories = (await getCategories()) as LumaCategory[]
  } catch (e) {
    return apiError(`Lumaprints categories failed: ${(e as Error).message}`, 502, 'LUMA_FAIL')
  }

  // Walk every (category × subcategory) once.
  const subs: Array<{ category: LumaCategory; sub: LumaSubcategory }> = []
  for (const c of categories) {
    try {
      const list = (await getSubcategories(c.categoryId)) as LumaSubcategory[]
      for (const s of list) subs.push({ category: c, sub: s })
    } catch (e) {
      console.warn(`sub list failed for ${c.name}:`, e)
    }
  }

  const summary: Array<{ medium: string; status: 'matched' | 'no_match' | 'error'; subcategory_id?: number; name?: string; size_count?: number; reason?: string }> = []

  for (const [medium, rule] of Object.entries(MEDIUM_RULES)) {
    const matches = subs.filter((x) => rule.keyword.test(x.sub.name))
    const picked = pickBest(matches, rule.preferDepth)
    if (!picked) {
      summary.push({ medium, status: 'no_match' })
      continue
    }

    let options: LumaOption[] = []
    try {
      options = (await getSubcategoryOptions(picked.sub.subcategoryId)) as LumaOption[]
    } catch (e) {
      summary.push({ medium, status: 'error', reason: `options failed: ${(e as Error).message}` })
      continue
    }

    const optionIds: number[] = []
    if (rule.defaultOptions) {
      for (const re of rule.defaultOptions) {
        const found = options.find((o) => re.test(o.name || o.description || ''))
        if (found) optionIds.push(found.optionId)
      }
    }
    // Always include any options marked required by Lumaprints with a
    // single valid value (so the shipping quote doesn't fail).
    for (const o of options) {
      if (o.required && !optionIds.includes(o.optionId)) optionIds.push(o.optionId)
    }

    const sizes = normalizeSizes(picked.sub.sizes || picked.sub.availableSizes)

    const { error } = await auth.supabase
      .from('lumaprints_mediums')
      .upsert({
        medium,
        category_id: picked.category.categoryId,
        subcategory_id: picked.sub.subcategoryId,
        name: picked.sub.name,
        option_ids: optionIds,
        sizes,
        enabled: sizes.length > 0,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'medium' })
    if (error) {
      summary.push({ medium, status: 'error', reason: error.message })
      continue
    }
    summary.push({
      medium,
      status: 'matched',
      subcategory_id: picked.sub.subcategoryId,
      name: picked.sub.name,
      size_count: sizes.length,
    })
  }

  return apiOk({
    discovered_subcategories: subs.length,
    summary,
  })
}
