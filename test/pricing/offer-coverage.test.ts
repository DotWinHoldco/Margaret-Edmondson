// Authored by DotWin
//
// The two pure answers the coverage report and the coverage generator share: what a
// (product × medium) is still missing, and what one square of the grid says.
//
// The failure these guard is F25 at its root — a new print type switched on, 39
// artworks that silently stay unsellable on it, and no screen that can say which ones
// or why. So: sizes are unioned across print types with different DPI (a stricter paper
// must not shrink what canvas offers), a size the product already has is never planned
// twice (the generator is re-runnable), and a square that cannot sell carries the
// reason rather than a zero.

import { describe, expect, it } from 'vitest'
import type { Medium } from '@/lib/pricing/mediums'
import type { CatalogSubcategory } from '@/lib/catalog/types'
import { coverageCell, NO_MASTER_REASON, planCoverageCell } from '@/lib/pricing/offer-coverage'

const STAMP = '2026-09-17T00:00:00.000Z'

function subcategory(over: {
  id: string
  medium?: Medium
  subcategory_id: number
  label: string
  dpi: number
  maxW?: number
  maxH?: number
  enabled?: boolean
  effective_enabled?: boolean
  blocked_reason?: string | null
}): CatalogSubcategory {
  return {
    id: over.id,
    medium: over.medium ?? 'canvas',
    subcategory_id: over.subcategory_id,
    api_host: 'us.api.lumaprints.com',
    name: over.label,
    display_label: over.label,
    description: null,
    min_width_in: 5,
    max_width_in: over.maxW ?? 40,
    min_height_in: 5,
    max_height_in: over.maxH ?? 60,
    required_dpi: over.dpi,
    max_glass_w_in: null,
    max_glass_h_in: null,
    enabled: over.enabled ?? true,
    sort_order: 0,
    customer_note: null,
    pricing_mode: 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
    groups: [],
    medium_enabled: true,
    effective_enabled: over.effective_enabled ?? true,
    blocked_reason: over.blocked_reason ?? null,
  }
}

// 4200 × 6300 px, a 2:3 portrait master. At 200 DPI it supports 21 × 31.5 in (every
// default tier); at 300 DPI only 14 × 21 in, so the Large is out of reach there.
const PRINT_W = 4200
const PRINT_H = 6300
const CANVAS = subcategory({ id: 'sub-canvas', subcategory_id: 101, label: 'Canvas 1.25"', dpi: 200 })
const PAPER = subcategory({
  id: 'sub-paper',
  medium: 'fine_art_paper',
  subcategory_id: 202,
  label: 'Fine Art Paper',
  dpi: 300,
})

describe('planCoverageCell', () => {
  it('unions the default sizes across print types with different DPI', () => {
    const plan = planCoverageCell({
      printWidthPx: PRINT_W,
      printHeightPx: PRINT_H,
      subcategories: [CANVAS, PAPER],
      existingSizeLabels: new Set<string>(),
    })

    expect(plan.toCreate.map((tier) => tier.size_label)).toEqual(['8x12', '13.35x20', '20x30'])
    expect(plan.skipped).toEqual([])

    // The two smaller sizes are offerable on both print types; the Large only on canvas.
    const byLabel = new Map(plan.toCreate.map((tier) => [tier.size_label, tier.subcategoryIds]))
    expect(byLabel.get('8x12')).toEqual([101, 202])
    expect(byLabel.get('13.35x20')).toEqual([101, 202])
    expect(byLabel.get('20x30')).toEqual([101])

    // …and the paper's Large is reported with the reason, never as a silent gap.
    expect(plan.dropped).toEqual([
      { subcategoryId: 202, subcategoryLabel: 'Fine Art Paper', tier: 'L', reason: 'exceeds the master resolution' },
    ])
  })

  it('never plans a size the product already carries', () => {
    const plan = planCoverageCell({
      printWidthPx: PRINT_W,
      printHeightPx: PRINT_H,
      subcategories: [CANVAS, PAPER],
      existingSizeLabels: new Set(['8x12', '20x30']),
    })

    expect(plan.toCreate.map((tier) => tier.size_label)).toEqual(['13.35x20'])
    expect(plan.skipped).toEqual(['8x12', '20x30'])
  })

  it('plans nothing at all once every default size exists', () => {
    const plan = planCoverageCell({
      printWidthPx: PRINT_W,
      printHeightPx: PRINT_H,
      subcategories: [CANVAS],
      existingSizeLabels: new Set(['8x12', '13.35x20', '20x30']),
    })

    expect(plan.toCreate).toEqual([])
    expect(plan.skipped).toEqual(['8x12', '13.35x20', '20x30'])
  })
})

describe('coverageCell', () => {
  const master = { printWidthPx: PRINT_W, printHeightPx: PRINT_H }

  it('reads live when a fitting size is published', () => {
    const cell = coverageCell({
      variants: [
        { width_in: 20, height_in: 30, is_active: true },
        { width_in: 8, height_in: 12, is_active: false },
      ],
      subcategory: CANVAS,
      master,
    })

    expect(cell).toEqual({ live: 1, draft: 1, fits: 2, status: 'live', reason: null })
  })

  it('reads draft while every fitting size is still unpublished', () => {
    const cell = coverageCell({
      variants: [{ width_in: 8, height_in: 12, is_active: false }],
      subcategory: CANVAS,
      master,
    })

    expect(cell.status).toBe('draft')
    expect(cell).toMatchObject({ live: 0, draft: 1, fits: 1 })
    expect(cell.reason).toBe('1 size still in draft.')
  })

  it('does not count a size the owner unticked for this print type, however well it fits', () => {
    const cell = coverageCell({
      variants: [{ width_in: 20, height_in: 30, is_active: true, excluded_subcategory_ids: [CANVAS.subcategory_id] }],
      subcategory: CANVAS,
      master,
    })

    expect(cell).toEqual({ live: 0, draft: 0, fits: 0, status: 'none', reason: 'no size fits' })
  })

  it('counts only the sizes the print type can actually take', () => {
    // The 20 × 30 canvas Large is past the paper's 300 DPI ceiling, so under the paper
    // column it is a gap, not coverage.
    const cell = coverageCell({
      variants: [{ width_in: 20, height_in: 30, is_active: true }],
      subcategory: PAPER,
      master,
    })

    expect(cell).toEqual({ live: 0, draft: 0, fits: 0, status: 'none', reason: 'no size fits' })
  })

  it('blocks the square when the artwork has no print-ready master', () => {
    const cell = coverageCell({
      variants: [{ width_in: 20, height_in: 30, is_active: true }],
      subcategory: CANVAS,
      master: null,
    })

    expect(cell).toEqual({ live: 0, draft: 0, fits: 0, status: 'blocked', reason: NO_MASTER_REASON })
  })

  it('blocks the square with the catalog reason when the print type cannot sell', () => {
    const blocked = subcategory({
      id: 'sub-blocked',
      subcategory_id: 303,
      label: 'Framed Canvas',
      dpi: 200,
      effective_enabled: false,
      blocked_reason: 'Every frame style is switched off.',
    })

    const cell = coverageCell({
      variants: [{ width_in: 20, height_in: 30, is_active: true }],
      subcategory: blocked,
      master,
    })

    expect(cell.status).toBe('blocked')
    expect(cell.reason).toBe('Every frame style is switched off.')
    // The counts still say what is sitting behind the block.
    expect(cell).toMatchObject({ live: 1, draft: 0, fits: 1 })
  })

  it('falls back to a plain reason when a switched-off print type carries none', () => {
    const off = subcategory({
      id: 'sub-off',
      subcategory_id: 404,
      label: 'Metal',
      dpi: 200,
      enabled: false,
      effective_enabled: false,
    })

    const cell = coverageCell({ variants: [], subcategory: off, master })
    expect(cell.status).toBe('blocked')
    expect(cell.reason).toBe('Metal is switched off.')
  })
})
