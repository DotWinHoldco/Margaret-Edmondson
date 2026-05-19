import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Phase 1 contract test for docs/artwork-inventory.md.
 *
 * The inventory is the source of truth for catalog state; if its schema
 * drifts (heading levels, table columns, enum values) the build expects
 * to know about it loudly before downstream phases consume it.
 */

const INVENTORY_PATH = join(process.cwd(), 'docs/artwork-inventory.md')
const RAW = readFileSync(INVENTORY_PATH, 'utf8')

const ALLOWED_ORIGINAL = new Set(['for_sale', 'not_for_sale', 'sold', 'pending_show'])
const ALLOWED_FRAME = new Set(['framed', 'matted_no_frame', 'unframed', 'needs_matte_and_frame'])

interface Row {
  series: string
  cells: string[]
}

function parseRows(): Row[] {
  const lines = RAW.split('\n')
  const rows: Row[] = []
  let series = '(prelude)'
  for (const raw of lines) {
    const line = raw.trim()
    const seriesMatch = line.match(/^##\s+(Series\s+\d+.+)$/i)
    if (seriesMatch) {
      series = seriesMatch[1].trim()
      continue
    }
    // Inventory rows start with a numeric or # marker in the first column.
    // Examples: "| 1 |", "| #6 |", "| — |" — the trailing "— Seasonal Inspiration" row.
    if (!/^\|/.test(line)) continue
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    // Skip header rows ("# | Title | Year | ...") and separator rows ("|---|---|").
    if (cells[0] === '#' || /^[-:\s]+$/.test(cells[0])) continue
    // Skip non-data rows that happen to start with |
    if (cells.length < 6) continue
    rows.push({ series, cells })
  }
  return rows
}

describe('docs/artwork-inventory.md', () => {
  it('has at least one Series heading', () => {
    const matches = RAW.match(/^## Series \d+/gm)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(4)
  })

  it('every artwork row has all required columns', () => {
    const rows = parseRows()
    expect(rows.length).toBeGreaterThan(20) // sanity floor; current count is 33
    for (const r of rows) {
      expect(r.cells.length, `row in ${r.series} (#${r.cells[0]}) has wrong column count`).toBeGreaterThanOrEqual(10)
      // Required: title, year, medium, size, frame, original status
      const [, title, year, medium, size, frame, original] = r.cells
      expect(title, `${r.series} row ${r.cells[0]} title`).toBeTruthy()
      expect(year, `${r.series} row ${r.cells[0]} year`).toBeTruthy()
      expect(medium, `${r.series} row ${r.cells[0]} medium`).toBeTruthy()
      expect(size, `${r.series} row ${r.cells[0]} size`).toBeTruthy()
      expect(frame, `${r.series} row ${r.cells[0]} frame`).toBeTruthy()
      expect(original, `${r.series} row ${r.cells[0]} original`).toBeTruthy()
    }
  })

  it('every Original value is one of the allowed enum values', () => {
    const rows = parseRows()
    for (const r of rows) {
      const original = (r.cells[6] || '').toLowerCase()
      // Allow rows that explicitly note "(not for sale yet …)" — they encode a state in parens
      if (original.startsWith('(') || original === '—' || original === '') continue
      // Many rows include a parenthetical after the enum value (e.g. "not_for_sale (NFS for now)"); strip it.
      const enumOnly = original.split(/\s+/)[0]
      expect(
        ALLOWED_ORIGINAL.has(enumOnly),
        `${r.series} row ${r.cells[0]} has Original="${original}" — not in ${[...ALLOWED_ORIGINAL].join(', ')}`,
      ).toBe(true)
    }
  })

  it('every Frame value is one of the allowed enum values', () => {
    const rows = parseRows()
    for (const r of rows) {
      const frame = (r.cells[5] || '').toLowerCase()
      if (frame === '—' || frame === '') continue
      // Margaret occasionally annotates a frame state as a future recommendation
      // ("recommended: black matte + frame") for pieces not yet sale-ready.
      // Treat these as "no decided enum yet" and skip the strict check.
      if (frame.startsWith('recommended:')) continue
      // Strip parentheticals: "needs_matte_and_frame (12×12 frame works)" → "needs_matte_and_frame"
      const enumOnly = frame.split(/\s+/)[0]
      expect(
        ALLOWED_FRAME.has(enumOnly),
        `${r.series} row ${r.cells[0]} has Frame="${frame}" — not in ${[...ALLOWED_FRAME].join(', ')}`,
      ).toBe(true)
    }
  })
})
