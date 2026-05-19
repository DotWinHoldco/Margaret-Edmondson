/**
 * Helpers for the CV builder.
 *
 * The `year` field on a CV entry is free-form text ("2025", "2020–2021",
 * "2025–present", "ca. 1998"). The DB stores a derived integer
 * `sort_year_numeric` so we can sort each section in descending year
 * without parsing on every read. Keep `parseSortYear` here in sync with
 * what the admin API does on save.
 */

export const CV_SECTIONS = ['exhibitions', 'education', 'affiliations', 'experience'] as const
export type CvSection = (typeof CV_SECTIONS)[number]

const SECTION_LABELS: Record<CvSection, string> = {
  exhibitions: 'Group Exhibitions',
  education: 'Arts Education',
  affiliations: 'Professional Affiliations',
  experience: 'Professional Experience',
}

export function sectionLabel(s: CvSection): string {
  return SECTION_LABELS[s]
}

/**
 * Parse the first 4-digit run in a year string and return it as an integer.
 * "2025" → 2025; "2020–2021" → 2020; "ca. 1998" → 1998; "TBD" → 0.
 */
export function parseSortYear(year: string): number {
  const m = year.match(/(\d{4})/)
  if (!m) return 0
  return Number(m[1])
}

export interface CvEntry {
  id: string
  section: CvSection
  year: string
  sort_year_numeric: number
  title: string
  venue: string | null
  institution: string | null
  location: string | null
  juror: string | null
  award: string | null
  notes: string | null
  linked_artwork_slug: string | null
  display_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

/**
 * Sort comparator for entries within a single section. The DB index already
 * orders rows the same way, but client-side reorder/add flows need the
 * comparator to render optimistically before the next refresh.
 */
export function compareEntries(a: CvEntry, b: CvEntry): number {
  if (a.sort_year_numeric !== b.sort_year_numeric) return b.sort_year_numeric - a.sort_year_numeric
  if (a.display_order !== b.display_order) return a.display_order - b.display_order
  return a.title.localeCompare(b.title)
}
