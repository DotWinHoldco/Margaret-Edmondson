// Authored by DotWin
// The V4 plan, checked against the real sandbox snapshot.
//
// V4 spends provider budget and places sandbox orders, so the part of it that CAN be
// tested for free is the part that decides what to send. These tests assert the three
// properties that make a V4 finding a statement about the provider rather than about
// the harness: every configuration survives the rules engine, no configuration is an
// empty array on a subcategory that publishes groups (F30), and no blocked option is
// ever chosen (ADR-4).

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildV4Plan, treeFromSnapshot, subcategoryForEntry, MEDIUM_ORDER, DEFAULT_SOLID_HEX } from '../../scripts/lib/v4-configs.mjs'
import { evaluateSelection } from '@/lib/catalog/rules'

const SNAPSHOT = path.resolve(
  process.cwd(),
  'fixtures/lumaprints/catalog.us.api-sandbox.lumaprints.com.2026-09-16.json',
)

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
const catalog = treeFromSnapshot(snapshot)
const plan = buildV4Plan(catalog)

const entryFor = (medium: string) => {
  const entry = plan.find((candidate: { medium: string }) => candidate.medium === medium)
  if (!entry) throw new Error(`the plan has no entry for ${medium}`)
  return entry
}

describe('treeFromSnapshot', () => {
  it('splits rolled canvas out of provider category 101 so all eight families are present', () => {
    const mediums = new Set(catalog.subcategories.map((sub: { medium: string }) => sub.medium))
    expect([...mediums].sort()).toEqual([...MEDIUM_ORDER].sort())
  })

  it('blocks the options ADR-4 says can never be sold, so no recipe can reach them', () => {
    const imageWrap = catalog.subcategories
      .flatMap((sub: { groups: Array<{ options: Array<{ api_option_name: string; blocked_reason: string | null }> }> }) => sub.groups)
      .flatMap((group) => group.options)
      .filter((option) => /^image wrap$/i.test(option.api_option_name))
    expect(imageWrap.length).toBeGreaterThan(0)
    expect(imageWrap.every((option) => option.blocked_reason !== null)).toBe(true)
  })
})

describe('buildV4Plan', () => {
  it('produces exactly one configuration per medium family, in report order', () => {
    expect(plan.map((entry: { medium: string }) => entry.medium)).toEqual(MEDIUM_ORDER)
    expect(plan).toHaveLength(8)
  })

  it('passes every configuration through the rules engine with zero violations', () => {
    for (const entry of plan) {
      const sub = subcategoryForEntry(catalog, entry)
      expect(sub, `${entry.medium} has no subcategory row`).toBeTruthy()
      const evaluation = evaluateSelection(
        sub,
        { widthIn: entry.size.width, heightIn: entry.size.height },
        entry.optionIds,
        entry.solidColorHexCode,
      )
      expect(evaluation.violations, `${entry.medium} ${entry.subcategoryId}`).toEqual([])
      // The engine's own normalisation must agree with what we are about to send: a
      // group filled in behind our back is a group the provider decides for us.
      expect(evaluation.normalizedOptionIds).toEqual(entry.optionIds)
    }
  })

  it('never sends an empty option array on a subcategory that publishes groups (F30)', () => {
    for (const entry of plan) {
      const sub = subcategoryForEntry(catalog, entry)
      const groupsWithOptions = sub.groups.filter(
        (group: { options: Array<{ blocked_reason: string | null }> }) =>
          group.options.some((option) => option.blocked_reason === null),
      ).length
      if (groupsWithOptions > 0) expect(entry.optionIds.length, entry.medium).toBeGreaterThan(0)
    }
  })

  it('never chooses a blocked option', () => {
    for (const entry of plan) {
      const sub = subcategoryForEntry(catalog, entry)
      const blocked = sub.groups
        .flatMap((group: { options: Array<{ option_id: number; blocked_reason: string | null }> }) => group.options)
        .filter((option: { blocked_reason: string | null }) => option.blocked_reason !== null)
        .map((option: { option_id: number }) => option.option_id)
      for (const id of entry.optionIds) expect(blocked, `${entry.medium} chose ${id}`).not.toContain(id)
    }
  })

  it('orders canvas as a Solid Color Wrap and carries the hex the provider never echoes', () => {
    const entry = entryFor('canvas')
    expect(entry.solidColorHexCode).toBe(DEFAULT_SOLID_HEX)
    const sub = subcategoryForEntry(catalog, entry)
    const border = sub.groups.find((group: { group_key: string }) => group.group_key === 'canvas_border')
    const solid = border.options.find((option: { api_option_name: string }) => /^solid colou?r$/i.test(option.api_option_name))
    expect(entry.optionIds).toContain(solid.option_id)
    // Without the hex the same configuration is refused: the hex is not decoration.
    expect(
      evaluateSelection(sub, { widthIn: entry.size.width, heightIn: entry.size.height }, entry.optionIds).violations.map(
        (violation: { code: string }) => violation.code,
      ),
    ).toContain('hex_required')
  })

  it('orders framed canvas on a named non-default frame style', () => {
    const entry = entryFor('framed_canvas')
    const sub = subcategoryForEntry(catalog, entry)
    const styles = sub.groups.find((group: { group_key: string }) => group.group_key === 'frame_style')
    const chosen = styles.options.find((option: { option_id: number }) => entry.optionIds.includes(option.option_id))
    expect(chosen).toBeTruthy()
    expect(chosen.is_default).not.toBe(true)
    expect(chosen.api_option_name).toMatch(/oak|walnut/i)
  })

  it('orders framed fine art paper matted, coloured and inside its glass ceiling', () => {
    const entry = entryFor('framed_fine_art_paper')
    const sub = subcategoryForEntry(catalog, entry)
    const named = (key: string) => {
      const group = sub.groups.find((candidate: { group_key: string }) => candidate.group_key === key)
      const option = group?.options.find((candidate: { option_id: number }) => entry.optionIds.includes(candidate.option_id))
      return option ? String(option.api_option_name) : null
    }
    expect(named('mat_size')).toMatch(/^3(\.0)? inch/i)
    expect(named('mat_color')).not.toMatch(/^white$/i)
    expect(named('glazing')).toMatch(/^acrylic glass/i)
    expect(named('paper_type')).toBeTruthy()
    expect(named('backing')).toBeTruthy()
    expect(named('print_mounting')).toBeTruthy()
    expect(named('hanging_hardware')).toBeTruthy()

    const evaluation = evaluateSelection(sub, { widthIn: entry.size.width, heightIn: entry.size.height }, entry.optionIds)
    expect(evaluation.outerWidthIn).toBe(entry.size.width + 6)
    expect(evaluation.outerHeightIn).toBe(entry.size.height + 6)
    expect(evaluation.outerWidthIn).toBeLessThanOrEqual(sub.max_width_in)
    expect(evaluation.outerHeightIn).toBeLessThanOrEqual(sub.max_height_in)
  })

  it('orders metal on the easel at a whitelisted size, and would be refused at any other', () => {
    const entry = entryFor('metal')
    expect(entry.size).toEqual({ width: 8, height: 10 })
    const sub = subcategoryForEntry(catalog, entry)
    const easel = sub.groups
      .flatMap((group: { options: Array<{ option_id: number; api_option_name: string }> }) => group.options)
      .find((option: { api_option_name: string }) => /^metal easel$/i.test(option.api_option_name))
    expect(entry.optionIds).toContain(easel.option_id)
    expect(
      evaluateSelection(sub, { widthIn: 13, heightIn: 19 }, entry.optionIds).violations.map((violation: { code: string }) => violation.code),
    ).toContain('size_whitelist')
  })

  it('orders two fractional sizes, on paper and on foam', () => {
    expect(entryFor('fine_art_paper').size).toEqual({ width: 9.25, height: 11 })
    expect(entryFor('foam_mounted_fine_art_paper').size).toEqual({ width: 12.5, height: 16 })
    for (const medium of ['fine_art_paper', 'foam_mounted_fine_art_paper']) {
      const entry = entryFor(medium)
      const sub = subcategoryForEntry(catalog, entry)
      const bleed = sub.groups.find((group: { group_key: string }) => group.group_key === 'bleed_size')
      const chosen = bleed.options.find((option: { option_id: number }) => entry.optionIds.includes(option.option_id))
      expect(chosen.api_option_name, medium).toMatch(/^no bleed/i)
    }
  })

  it('sends no options at all for peel and stick, which publishes none', () => {
    const entry = entryFor('peel_and_stick')
    expect(entry.optionIds).toEqual([])
    expect(subcategoryForEntry(catalog, entry).groups).toHaveLength(0)
  })

  it('sends no rolled-canvas border size, because those options are owed a probe', () => {
    const entry = entryFor('rolled_canvas')
    const sub = subcategoryForEntry(catalog, entry)
    const border = sub.groups.find((group: { group_key: string }) => /border/.test(group.group_key) && /rolled/.test(group.group_key))
    expect(border, 'the rolled border group is missing from the snapshot').toBeTruthy()
    for (const option of border.options) {
      expect(option.blocked_reason).toBeTruthy()
      expect(entry.optionIds).not.toContain(option.option_id)
    }
  })

  it('labels every entry uniquely, so two orders can never share a probe image or an external id', () => {
    const labels = plan.map((entry: { label: string }) => entry.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
