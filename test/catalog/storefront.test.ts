// Authored by DotWin
//
// What the browser is allowed to hold. The assembled catalog carries operator
// material - the sentence explaining why an option is blocked, sync bookkeeping, and
// whatever a future column adds - and the storefront payload is an allow-list, so the
// proof here is by SERIALIZING the output and looking for what must not be in it.

import { describe, expect, it } from 'vitest'
import type {
  Catalog,
  CatalogOption,
  CatalogOptionGroup,
  CatalogSubcategory,
} from '@/lib/catalog/types'
import { storefrontCatalogFor } from '@/lib/catalog/storefront'

const STAMP = '2026-09-17T00:00:00.000Z'
const BLOCKED_TEXT = 'Image Wrap needs a print file with 3.75in of bleed the masters do not carry.'

function option(over: Partial<CatalogOption> & { option_id: number; display_label: string }): CatalogOption {
  return {
    id: `opt-${over.option_id}`,
    group_ref: 'group-1',
    api_option_name: over.display_label,
    enabled: true,
    is_default: false,
    provider_default: false,
    sort_order: 0,
    swatch: null,
    geometry: null,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    effective_enabled: true,
    blocked_reason: null,
    ...over,
  }
}

function group(
  over: Partial<CatalogOptionGroup> & { group_key: string; options: CatalogOption[] },
): CatalogOptionGroup {
  return {
    id: `group-${over.group_key}`,
    subcategory_ref: 'sub-1',
    api_group_name: over.group_key,
    display_label: over.group_key,
    required: false,
    customer_visible: true,
    enabled: true,
    display_kind: 'radio',
    depends_on_group: null,
    depends_hidden_when: null,
    sort_order: 0,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    effective_enabled: true,
    default_option_id: null,
    ...over,
  }
}

function subcategory(
  over: Partial<CatalogSubcategory> & { id: string; medium: CatalogSubcategory['medium']; subcategory_id: number },
): CatalogSubcategory {
  return {
    api_host: 'us.api.lumaprints.com',
    name: 'Subcategory',
    display_label: 'Subcategory',
    description: null,
    min_width_in: 5,
    max_width_in: 40,
    min_height_in: 5,
    max_height_in: 60,
    required_dpi: 300,
    max_glass_w_in: null,
    max_glass_h_in: null,
    enabled: true,
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
    effective_enabled: true,
    blocked_reason: null,
    ...over,
  }
}

function catalogWith(subcategories: CatalogSubcategory[]): Catalog {
  return { host: 'us.api.lumaprints.com', loaded_at: STAMP, subcategories }
}

describe('storefrontCatalogFor', () => {
  it('keeps only the sellable finishes of the mediums asked for', () => {
    const tree = catalogWith([
      subcategory({ id: 'canvas-125', medium: 'canvas', subcategory_id: 101002, sort_order: 2 }),
      subcategory({ id: 'canvas-075', medium: 'canvas', subcategory_id: 101001, sort_order: 1 }),
      subcategory({
        id: 'canvas-off',
        medium: 'canvas',
        subcategory_id: 101003,
        effective_enabled: false,
        blocked_reason: 'Every frame style is switched off.',
      }),
      subcategory({ id: 'metal', medium: 'metal', subcategory_id: 108001 }),
    ])

    const out = storefrontCatalogFor(tree, ['canvas'])

    expect(out.map((entry) => entry.id)).toEqual(['canvas-075', 'canvas-125'])
  })

  it('drops disabled groups and keeps every option of the ones it keeps', () => {
    const tree = catalogWith([
      subcategory({
        id: 'framed',
        medium: 'framed_canvas',
        subcategory_id: 103001,
        groups: [
          group({
            group_key: 'wrap',
            sort_order: 2,
            options: [
              option({ option_id: 2, display_label: 'Mirror Wrap', sort_order: 1 }),
              option({
                option_id: 1,
                display_label: 'Image Wrap',
                sort_order: 0,
                effective_enabled: false,
                blocked_reason: BLOCKED_TEXT,
              }),
            ],
          }),
          group({ group_key: 'frame_style', sort_order: 1, options: [option({ option_id: 27, display_label: 'Black' })] }),
          group({
            group_key: 'retired',
            sort_order: 0,
            effective_enabled: false,
            options: [option({ option_id: 99, display_label: 'Retired' })],
          }),
        ],
      }),
    ])

    const [finish] = storefrontCatalogFor(tree, ['framed_canvas'])

    expect(finish.groups.map((entry) => entry.group_key)).toEqual(['frame_style', 'wrap'])
    const wrap = finish.groups[1]
    // Both options travel: a blocked one renders disabled with a reason rather than
    // vanishing, which is what stops a shopper dead-ending on a choice they were told about.
    expect(wrap.options.map((entry) => entry.option_id)).toEqual([1, 2])
    expect(wrap.options[0]).toMatchObject({ blocked: true, effective_enabled: false })
    expect(wrap.options[1]).toMatchObject({ blocked: false, effective_enabled: true })
  })

  it('never serializes the operator reason, wholesale fields or sync bookkeeping', () => {
    const leaky = option({ option_id: 3, display_label: 'Solid Color Wrap', blocked_reason: BLOCKED_TEXT })
    const withExtras = {
      ...leaky,
      cost_cents: 4199,
      wholesale_price: 31.5,
      geometry: { needs_hex: true, probe_owed: 'V3 must record checkImageConfig for this option.' },
    } as unknown as CatalogOption

    const tree = catalogWith([
      subcategory({
        id: 'canvas',
        medium: 'canvas',
        subcategory_id: 101002,
        groups: [group({ group_key: 'wrap', options: [withExtras] })],
      }),
    ])

    const serialized = JSON.stringify(storefrontCatalogFor(tree, ['canvas']))

    expect(serialized).not.toContain(BLOCKED_TEXT)
    expect(serialized).not.toContain('blocked_reason')
    expect(serialized).not.toContain('cost_cents')
    expect(serialized).not.toContain('wholesale')
    expect(serialized).not.toContain('probe_owed')
    expect(serialized).not.toContain('last_synced_at')
    expect(serialized).not.toContain('acknowledged_at')
    expect(serialized).not.toContain('api_host')
    // The fact survives; the sentence does not.
    expect(JSON.parse(serialized)[0].groups[0].options[0]).toEqual({
      id: 'opt-3',
      option_id: 3,
      display_label: 'Solid Color Wrap',
      is_default: false,
      sort_order: 0,
      swatch: null,
      geometry: { needs_hex: true },
      effective_enabled: true,
      blocked: true,
    })
  })

  it('sorts groups and options by the order the catalog gives them', () => {
    const tree = catalogWith([
      subcategory({
        id: 'paper',
        medium: 'framed_fine_art_paper',
        subcategory_id: 105005,
        groups: [
          group({
            group_key: 'mat_color',
            sort_order: 3,
            options: [
              option({ option_id: 96, display_label: 'White', sort_order: 2 }),
              option({ option_id: 94, display_label: 'Antique', sort_order: 1 }),
            ],
          }),
          group({ group_key: 'mat_size', sort_order: 1, options: [option({ option_id: 83, display_label: 'No Mat' })] }),
        ],
      }),
    ])

    const [finish] = storefrontCatalogFor(tree, ['framed_fine_art_paper'])

    expect(finish.groups.map((entry) => entry.group_key)).toEqual(['mat_size', 'mat_color'])
    expect(finish.groups[1].options.map((entry) => entry.display_label)).toEqual(['Antique', 'White'])
  })

  it('is empty for a medium this product does not sell', () => {
    const tree = catalogWith([subcategory({ id: 'canvas', medium: 'canvas', subcategory_id: 101002 })])
    expect(storefrontCatalogFor(tree, [])).toEqual([])
    expect(storefrontCatalogFor(tree, ['metal'])).toEqual([])
  })
})
