// Authored by DotWin
// The seed rules, swept across every row of the committed Phase 0 snapshot.
//
// A geometry rule that fires on one name it was written for proves very little.
// What matters is that it fires on EVERY name it targets and on nothing else, so
// these tests walk all 50 subcategories, all 218 groups and all 1223 options and
// assert the full set each rule claims, by name.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalGroupKey, slugKey } from '@/lib/catalog/keys'
import { MEDIUMS } from '@/lib/pricing/mediums'
import {
  categoryIdForMedium,
  displayKindForGroup,
  frameFaceIn,
  geometryForOption,
  groupSeed,
  mediumForSubcategory,
  optionSeed,
  pickSeededDefault,
  resolveDependsHiddenWhen,
  subcategorySeed,
  swatchForOption,
  type NamedOption,
} from '@/lib/catalog/seed-rules'

interface FixtureGroup {
  optionGroup: string
  optionGroupItems: Array<{ optionId: number; optionName: string }>
}
interface FixtureSubcategory {
  subcategoryId: number
  name: string
  optionGroups: FixtureGroup[]
}
interface FixtureCategory {
  id: number
  name: string
  subcategories: FixtureSubcategory[]
}

const catalog = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), 'fixtures/lumaprints/catalog.us.api-sandbox.lumaprints.com.2026-09-16.json'),
    'utf8',
  ),
) as { categories: FixtureCategory[] }

interface Row {
  categoryId: number
  sub: FixtureSubcategory
  group: FixtureGroup
  groupKey: string
  option: { optionId: number; optionName: string }
}

/**
 * The keys one subcategory's groups actually land under, including the slug
 * fallback the sync applies when two provider names canonicalise to the same key.
 * Mirrors `mergeSubcategoryOptions` so these rules are exercised on the keys the
 * rows really carry.
 */
function keyedGroups(sub: FixtureSubcategory): Array<{ group: FixtureGroup; groupKey: string }> {
  const taken = new Set<string>()
  const out: Array<{ group: FixtureGroup; groupKey: string }> = []
  for (const group of sub.optionGroups ?? []) {
    const canonical = canonicalGroupKey(group.optionGroup)
    const groupKey = taken.has(canonical) ? slugKey(group.optionGroup) : canonical
    if (taken.has(groupKey)) continue
    taken.add(groupKey)
    out.push({ group, groupKey })
  }
  return out
}

const SUBCATEGORIES: Array<{ categoryId: number; sub: FixtureSubcategory }> = []
const ROWS: Row[] = []
for (const category of catalog.categories) {
  for (const sub of category.subcategories) {
    SUBCATEGORIES.push({ categoryId: category.id, sub })
    for (const { group, groupKey } of keyedGroups(sub)) {
      for (const option of group.optionGroupItems) ROWS.push({ categoryId: category.id, sub, group, groupKey, option })
    }
  }
}

/** Every option name in the snapshot that the predicate matches, deduplicated. */
function namesWhere(predicate: (row: Row) => boolean): string[] {
  return [...new Set(ROWS.filter(predicate).map((r) => r.option.optionName))].sort()
}

describe('seed rules — medium', () => {
  it('files every subcategory in the snapshot under one of the eight families', () => {
    const counts = new Map<string, number>()
    for (const { categoryId, sub } of SUBCATEGORIES) {
      const medium = mediumForSubcategory(categoryId, sub.name)
      expect(MEDIUMS).toContain(medium)
      counts.set(medium, (counts.get(medium) ?? 0) + 1)
    }
    expect(SUBCATEGORIES).toHaveLength(50)
    expect(Object.fromEntries([...counts].sort())).toEqual({
      canvas: 3,
      fine_art_paper: 7,
      foam_mounted_fine_art_paper: 8,
      framed_canvas: 3,
      framed_fine_art_paper: 25,
      metal: 2,
      peel_and_stick: 1,
      rolled_canvas: 1,
    })
  })

  it('splits rolled canvas out of the canvas category by name', () => {
    expect(mediumForSubcategory(101, 'Rolled Canvas')).toBe('rolled_canvas')
    expect(mediumForSubcategory(101, '1.25in Stretched Canvas')).toBe('canvas')
    // Foam-mounted Canvas is a paper-family product despite the word.
    expect(mediumForSubcategory(108, 'Foam-mounted Canvas')).toBe('foam_mounted_fine_art_paper')
  })

  it('refuses a category the plan has never seen', () => {
    expect(() => mediumForSubcategory(109, 'Something New')).toThrow(/Unknown provider category 109/)
  })

  it('round-trips every family back to its provider category', () => {
    for (const { categoryId, sub } of SUBCATEGORIES) {
      expect(categoryIdForMedium(mediumForSubcategory(categoryId, sub.name))).toBe(categoryId)
    }
  })
})

describe('seed rules — subcategory', () => {
  it('prices exactly the 25 framed paper profiles as a whole configuration', () => {
    const wholeConfig = SUBCATEGORIES.filter(
      ({ categoryId, sub }) => subcategorySeed(categoryId, sub.name).pricing_mode === 'whole_config',
    ).map(({ sub }) => sub.subcategoryId)
    expect(wholeConfig).toHaveLength(25)
    expect(wholeConfig.every((id) => String(id).startsWith('105'))).toBe(true)
  })

  it('attaches a caveat only where the physical product has one', () => {
    const noted = SUBCATEGORIES.filter(({ categoryId, sub }) => subcategorySeed(categoryId, sub.name).customer_note)
      .map(({ sub }) => sub.subcategoryId)
      .sort((a, b) => a - b)
    expect(noted).toEqual([106001, 106002, 108001, 108002, 108003, 108005, 108006, 108007, 108009, 108010])
  })

  it('leaves the glass ceiling to the published bounds', () => {
    for (const { categoryId, sub } of SUBCATEGORIES) {
      const seed = subcategorySeed(categoryId, sub.name)
      expect(seed.max_glass_w_in).toBeNull()
      expect(seed.max_glass_h_in).toBeNull()
      expect(seed.display_label).toBe(sub.name)
    }
  })
})

describe('seed rules — groups', () => {
  it('gives every group in the snapshot a canonical key and a control kind', () => {
    const kinds = new Map<string, string>()
    for (const row of ROWS) kinds.set(row.groupKey, displayKindForGroup(row.groupKey))
    expect(Object.fromEntries([...kinds].sort())).toEqual({
      backing: 'radio',
      bleed_size: 'radio',
      canvas_border: 'radio',
      canvas_finish: 'radio',
      canvas_underlayer: 'radio',
      frame_style: 'swatch',
      glazing: 'radio',
      hanging_hardware: 'list',
      mat_color: 'swatch',
      mat_size: 'list',
      metal_hardware: 'list',
      paper_type: 'list',
      print_mounting: 'radio',
      rolled_border_size: 'list',
    })
  })

  it('Rolled Canvas Border Size reaches its own canonical key (specific pattern before generic)', () => {
    // keys.ts lists the specific rolled-border pattern ABOVE the generic canvas-border
    // pattern it contains (an earlier draft had them reversed, which made this key
    // unreachable and collided both Rolled Canvas groups on (subcategory_ref, group_key)).
    // The sync still files any future collision under the slug so no option is ever
    // dropped, and the rolled-border rules key on the option name as a second defence.
    expect(canonicalGroupKey('Rolled Canvas Border Size')).toBe('rolled_border_size')
    const rolled = SUBCATEGORIES.find((s) => s.sub.subcategoryId === 101005)!.sub
    expect(keyedGroups(rolled).map((g) => g.groupKey)).toEqual([
      'canvas_border',
      'rolled_border_size',
      'canvas_finish',
    ])
    // The four border sizes survive with their probe still owed.
    for (const option of rolled.optionGroups[1].optionGroupItems) {
      expect(geometryForOption('rolled_border_size', option.optionName)?.probe_owed).toMatch(/V3 geometry probe/)
    }
  })

  it('marks only Mat Color as dependent, and hides it on No Mat', () => {
    const dependent = [...new Set(ROWS.filter((r) => groupSeed(r.group.optionGroup).depends_on_group).map((r) => r.groupKey))]
    expect(dependent).toEqual(['mat_color'])

    const sub = SUBCATEGORIES.find(({ sub }) => sub.subcategoryId === 105005)!.sub
    const byKey = new Map<string, NamedOption[]>(
      keyedGroups(sub).map(({ group, groupKey }) => [
        groupKey,
        group.optionGroupItems.map((o) => ({ option_id: o.optionId, api_option_name: o.optionName })),
      ]),
    )
    expect(resolveDependsHiddenWhen('mat_color', byKey)).toEqual([64])
    expect(resolveDependsHiddenWhen('mat_size', byKey)).toBeNull()
    expect(resolveDependsHiddenWhen('mat_color', new Map())).toBeNull()
  })

  it('seeds every group not required, and seeds its label from the provider name', () => {
    for (const row of ROWS) {
      const seed = groupSeed(row.group.optionGroup)
      expect(seed.required).toBe(false)
      expect(seed.customer_visible).toBe(true)
      expect(seed.display_label).toBe(row.group.optionGroup)
    }
  })
})

describe('seed rules — geometry fires on its targets and nothing else', () => {
  const withKey = (key: string) => namesWhere((r) => Boolean(geometryForOption(r.groupKey, r.option.optionName)?.[key as 'needs_hex']))

  it('blocks Image Wrap and every non-zero bleed, and nothing else', () => {
    expect(withKey('requires_file_bleed_in')).toEqual([
      '0.25in Bleed (0.25in on each side)',
      '0.50in Bleed (0.50in on each side)',
      '1.00in Bleed (1.00in on each side)',
      'Image Wrap',
    ])
    expect(geometryForOption('canvas_border', 'Image Wrap')).toEqual({ requires_file_bleed_in: 3.75 })
    expect(geometryForOption('bleed_size', '1.00in Bleed (1.00in on each side)')).toEqual({ requires_file_bleed_in: 1 })
    expect(geometryForOption('bleed_size', 'No Bleed (Image goes to edge of paper)')).toBeNull()
  })

  it('measures every mat width and no other option', () => {
    expect(withKey('per_side_in')).toEqual([
      '1.0 inch on each side',
      '1.5 inches on each side',
      '2.0 inches on each side',
      '2.5 inches on each side',
      '3.0 inches on each side',
      '3.5 inches on each side',
      '4.0 inches on each side',
      '4.5 inches on each side',
      '5.0 inches on each side',
    ])
    expect(geometryForOption('mat_size', 'No Mat')).toBeNull()
  })

  it('whitelists sizes for the metal easel alone', () => {
    expect(withKey('size_whitelist')).toEqual(['Metal Easel'])
    expect(geometryForOption('metal_hardware', 'Metal Easel')?.size_whitelist).toHaveLength(7)
  })

  it('asks for a hex on Solid Color alone', () => {
    expect(withKey('needs_hex')).toEqual(['Solid Color'])
  })

  it('owes a probe on every rolled-canvas border size and nothing else', () => {
    expect(withKey('probe_owed')).toEqual([
      '1 inch border plus 1 inch white space',
      '2 inch border plus 1 inch white space',
      'No border with 1 inch white space',
      'Trimmed (No border, No white space)',
    ])
  })

  it('flags a shipping re-quote on frames, glazing, backboards and posts', () => {
    const flagged = ROWS.filter((r) => geometryForOption(r.groupKey, r.option.optionName)?.shipping_class)
    const groups = [...new Set(flagged.map((r) => r.groupKey))].sort()
    expect(groups).toEqual(['frame_style', 'glazing', 'hanging_hardware', 'metal_hardware'])
    expect(namesWhere((r) => r.groupKey !== 'frame_style' && Boolean(geometryForOption(r.groupKey, r.option.optionName)?.shipping_class))).toEqual([
      'Acrylic Glass (recommended)',
      'Black Backboard backing with hanging wire installed',
      'Black Backboard backing with sawtooth installed',
      'Inset Frame',
      'Inset Frame with Hanging Wire',
      'Large (1 inch) Stainless Steel Mounting Posts',
      'Small (3/4 inch) Stainless Steel Mounting Posts',
    ])
    // Every frame style is a shipping class, all 39 of them across the three groups.
    expect(flagged.filter((r) => r.groupKey === 'frame_style')).toHaveLength(38)
  })

  it('leaves the neutral options with no geometry at all', () => {
    for (const name of ['Mirror Wrap', 'No Mat', 'No Backing', 'No Canvas Underlayer', 'Sawtooth Hanger installed']) {
      const row = ROWS.find((r) => r.option.optionName === name)!
      expect(geometryForOption(row.groupKey, name)).toBeNull()
    }
  })
})

describe('seed rules — swatches', () => {
  it('colours every frame style and every mat colour in the snapshot', () => {
    const uncoloured = ROWS.filter(
      (r) => (r.groupKey === 'frame_style' || r.groupKey === 'mat_color') && !swatchForOption(r.groupKey, r.option.optionName, r.sub.name)?.color_hex,
    )
    expect(uncoloured.map((r) => r.option.optionName)).toEqual([])
  })

  it('gives no swatch to groups that are not a material choice', () => {
    const stray = ROWS.filter(
      (r) => r.groupKey !== 'frame_style' && r.groupKey !== 'mat_color' && swatchForOption(r.groupKey, r.option.optionName, r.sub.name),
    )
    expect(stray.map((r) => r.option.optionName)).toEqual([])
  })

  it('lets the mat table beat the frame table on the shared colour names', () => {
    expect(swatchForOption('mat_color', 'White', '')?.color_hex).toBe('#ffffff')
    expect(swatchForOption('frame_style', '1.50in White Floating Frame', '')?.color_hex).toBe('#f4f1ea')
    expect(swatchForOption('mat_color', 'White with Black Core', '')?.color_hex).toBe('#f8f8f8')
    expect(swatchForOption('mat_color', 'Off White', '')?.color_hex).toBe('#f5f2ea')
  })

  it('reads the frame face width from the name that carries it', () => {
    expect(frameFaceIn('1.25in Black Floating Frame', '1.25in Framed Canvas')).toBe(1.25)
    expect(frameFaceIn('0.875x1.125 Black Frame', '0.75in Framed Canvas')).toBe(0.875)
    // Framed paper has no frame option group: the profile is the subcategory.
    expect(frameFaceIn('', '1.25w x 0.875h Black Frame')).toBe(1.25)
    expect(frameFaceIn('Mirror Wrap', 'Rolled Canvas')).toBeUndefined()
  })

  it('carries the provider name through as the starting label', () => {
    for (const row of ROWS.slice(0, 40)) {
      expect(optionSeed(row.groupKey, row.option.optionName, row.sub.name).display_label).toBe(row.option.optionName)
    }
  })
})

describe('seed rules — our default per group', () => {
  const optionsOf = (sub: FixtureSubcategory, groupKey: string): NamedOption[] =>
    (keyedGroups(sub).find((g) => g.groupKey === groupKey)?.group.optionGroupItems ?? []).map((o) => ({
      option_id: o.optionId,
      api_option_name: o.optionName,
    }))

  it('picks exactly one default for every group in the snapshot', () => {
    for (const { categoryId, sub } of SUBCATEGORIES) {
      for (const { group, groupKey } of keyedGroups(sub)) {
        const options = group.optionGroupItems.map((o) => ({ option_id: o.optionId, api_option_name: o.optionName }))
        const pick = pickSeededDefault(groupKey, categoryId, sub.name, options)
        expect(`${sub.subcategoryId}:${groupKey}:${pick === null ? 'none' : 'one'}`).toBe(
          `${sub.subcategoryId}:${groupKey}:one`,
        )
        expect(options.some((o) => o.option_id === pick)).toBe(true)
      }
    }
  })

  it('picks the geometry-neutral member of every group it knows', () => {
    const sub = (id: number) => SUBCATEGORIES.find((s) => s.sub.subcategoryId === id)!
    const pick = (id: number, key: string) => {
      const { categoryId, sub: s } = sub(id)
      return pickSeededDefault(key, categoryId, s.name, optionsOf(s, key))
    }
    expect(pick(101002, 'canvas_border')).toBe(2) // Mirror Wrap, never Image Wrap
    expect(pick(101002, 'hanging_hardware')).toBe(11) // Sawtooth (the only member)
    expect(pick(101001, 'hanging_hardware')).toBe(4) // Sawtooth
    expect(pick(101003, 'canvas_underlayer')).toBe(9) // No Canvas Underlayer
    expect(pick(101005, 'rolled_border_size')).toBe(19)
    expect(pick(102001, 'frame_style')).toBe(12) // 0.75in Black Floating
    expect(pick(102002, 'frame_style')).toBe(27) // 1.25in Black Floating
    expect(pick(102003, 'frame_style')).toBe(23) // 1.50in Black Floating
    expect(pick(102002, 'hanging_hardware')).toBe(28) // Hanging Wire
    expect(pick(103001, 'bleed_size')).toBe(39) // No Bleed, never 0.25in
    expect(pick(108010, 'bleed_size')).toBe(39)
    expect(pick(105005, 'mat_size')).toBe(64)
    expect(pick(105005, 'mat_color')).toBe(96) // White, not White with Black Core
    expect(pick(105005, 'paper_type')).toBe(74)
    expect(pick(105005, 'glazing')).toBe(146)
    expect(pick(105005, 'backing')).toBe(94)
    expect(pick(105005, 'print_mounting')).toBe(148)
    expect(pick(105005, 'hanging_hardware')).toBe(83) // Wire installed on frame
    expect(pick(106001, 'metal_hardware')).toBe(31) // Inset Frame, not Inset Frame with Wire
  })

  it('falls back to the provider default, then to the first member', () => {
    const options: NamedOption[] = [
      { option_id: 212, api_option_name: 'Semi-Glossy' },
      { option_id: 213, api_option_name: 'Matte' },
    ]
    // Canvas Finish has no neutral rule and the provider never echoes it.
    expect(pickSeededDefault('canvas_finish', 101, '0.75in Stretched Canvas', options)).toBe(212)
    expect(pickSeededDefault('canvas_finish', 101, '0.75in Stretched Canvas', options, [213])).toBe(213)
    expect(pickSeededDefault('canvas_finish', 101, '0.75in Stretched Canvas', [])).toBeNull()
  })
})
