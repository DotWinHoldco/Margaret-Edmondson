import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import { CV_SECTIONS, type CvEntry, type CvSection, sectionLabel } from '@/lib/cv'

export const dynamic = 'force-dynamic'

// Letter at 72 DPI
const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54

interface Settings { intro: string; contact_email: string }

async function load(): Promise<{ entries: CvEntry[]; settings: Settings }> {
  const supabase = await createClient()
  const [entriesRes, settingsRes] = await Promise.all([
    supabase
      .from('cv_entries')
      .select('id, section, year, sort_year_numeric, title, venue, institution, location, juror, award, notes, linked_artwork_slug, display_order, is_published, created_at, updated_at')
      .eq('is_published', true)
      .order('sort_year_numeric', { ascending: false })
      .order('display_order', { ascending: true })
      .order('title', { ascending: true }),
    supabase.from('cv_settings').select('intro, contact_email').eq('id', true).maybeSingle(),
  ])
  return {
    entries: (entriesRes.data || []) as CvEntry[],
    settings: (settingsRes.data as Settings | null) || {
      intro: 'Selected exhibitions, education, and teaching experience.',
      contact_email: 'margaret117art@gmail.com',
    },
  }
}

function bySection(entries: CvEntry[]): Record<CvSection, CvEntry[]> {
  const out = { exhibitions: [], education: [], affiliations: [], experience: [] } as Record<CvSection, CvEntry[]>
  for (const e of entries) out[e.section].push(e)
  return out
}

export async function GET() {
  const { entries, settings } = await load()
  const grouped = bySection(entries)

  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const helvItalic = await pdf.embedFont(StandardFonts.HelveticaOblique)

  const charcoal = rgb(0.11, 0.11, 0.11)
  const muted = rgb(0.45, 0.45, 0.45)
  const gold = rgb(0.65, 0.46, 0.16)

  let page = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN
  let pageNum = 1

  const newPage = () => {
    drawFooter(page, helv, muted, pageNum)
    page = pdf.addPage([PAGE_W, PAGE_H])
    pageNum += 1
    y = PAGE_H - MARGIN
  }

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 30) newPage()
  }

  // Header
  page.drawText('Margaret Edmondson', { x: MARGIN, y, size: 22, font: helvBold, color: charcoal })
  y -= 26
  page.drawText('Curriculum Vitae · ' + settings.contact_email, { x: MARGIN, y, size: 10, font: helv, color: muted })
  y -= 18
  drawWrapped(page, settings.intro, MARGIN, y, PAGE_W - MARGIN * 2, helv, 10, muted, 12, (consumed) => { y -= consumed })
  y -= 14

  for (const section of CV_SECTIONS) {
    const rows = grouped[section]
    if (rows.length === 0) continue
    ensureSpace(40)
    page.drawText(sectionLabel(section).toUpperCase(), { x: MARGIN, y, size: 11, font: helvBold, color: gold })
    y -= 6
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 30, y }, thickness: 0.5, color: gold })
    y -= 16

    for (const entry of rows) {
      const block = estimateEntryHeight(entry, helv, 10, PAGE_W - MARGIN * 2 - 60)
      ensureSpace(block)

      // Year column (left rail)
      page.drawText(entry.year, { x: MARGIN, y, size: 10, font: helvBold, color: charcoal })

      // Body column starts at MARGIN + 60
      const bodyX = MARGIN + 60
      const bodyMaxW = PAGE_W - MARGIN - bodyX

      let cursorY = y
      // Title (bold)
      const titleLines = wrapText(entry.title, helvBold, 11, bodyMaxW)
      for (const line of titleLines) {
        page.drawText(line, { x: bodyX, y: cursorY, size: 11, font: helvBold, color: charcoal })
        cursorY -= 13
      }
      // Venue/Institution + Location
      const sub = [entry.venue, entry.institution].filter(Boolean).join(' · ')
      const subWithLoc = sub && entry.location ? `${sub} — ${entry.location}` : sub || entry.location || ''
      if (subWithLoc) {
        const subLines = wrapText(subWithLoc, helv, 10, bodyMaxW)
        for (const line of subLines) {
          page.drawText(line, { x: bodyX, y: cursorY, size: 10, font: helv, color: muted })
          cursorY -= 12
        }
      }
      if (entry.juror) {
        const lines = wrapText(`Juror: ${entry.juror}`, helvItalic, 10, bodyMaxW)
        for (const line of lines) {
          page.drawText(line, { x: bodyX, y: cursorY, size: 10, font: helvItalic, color: muted })
          cursorY -= 12
        }
      }
      if (entry.award) {
        const lines = wrapText(entry.award, helvItalic, 10, bodyMaxW)
        for (const line of lines) {
          page.drawText(line, { x: bodyX, y: cursorY, size: 10, font: helvItalic, color: gold })
          cursorY -= 12
        }
      }
      if (entry.notes) {
        const lines = wrapText(entry.notes, helv, 9, bodyMaxW)
        for (const line of lines) {
          page.drawText(line, { x: bodyX, y: cursorY, size: 9, font: helv, color: muted })
          cursorY -= 11
        }
      }
      y = cursorY - 6
    }
    y -= 6
  }

  drawFooter(page, helv, muted, pageNum)

  const bytes = await pdf.save()
  // Browsers (Safari especially) won't open `application/pdf` from a fetch
  // without a definite length; pdf-lib returns Uint8Array which Next will
  // serialize correctly via the Response constructor.
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'cache-control': 'public, max-age=300',
      'content-disposition': 'inline; filename="margaret-edmondson-cv.pdf"',
    },
  })
}

function drawFooter(page: ReturnType<PDFDocument['addPage']>, font: Awaited<ReturnType<PDFDocument['embedFont']>>, color: ReturnType<typeof rgb>, pageNum: number) {
  page.drawText(`Page ${pageNum}`, { x: PAGE_W - MARGIN - 30, y: MARGIN / 2, size: 9, font, color })
}

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w
    if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
      if (current) lines.push(current)
      current = w
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function drawWrapped(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
  color: ReturnType<typeof rgb>,
  lineHeight: number,
  consume: (consumed: number) => void,
) {
  const lines = wrapText(text, font, size, maxWidth)
  let y = startY
  for (const line of lines) {
    page.drawText(line, { x, y, size, font, color })
    y -= lineHeight
  }
  consume(lines.length * lineHeight)
}

function estimateEntryHeight(entry: CvEntry, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, maxWidth: number): number {
  const lines: string[] = []
  lines.push(...wrapText(entry.title, font, 11, maxWidth))
  const sub = [entry.venue, entry.institution].filter(Boolean).join(' · ')
  const subWithLoc = sub && entry.location ? `${sub} — ${entry.location}` : sub || entry.location || ''
  if (subWithLoc) lines.push(...wrapText(subWithLoc, font, 10, maxWidth))
  if (entry.juror) lines.push(...wrapText(`Juror: ${entry.juror}`, font, 10, maxWidth))
  if (entry.award) lines.push(...wrapText(entry.award, font, 10, maxWidth))
  if (entry.notes) lines.push(...wrapText(entry.notes, font, 9, maxWidth))
  return lines.length * 13 + 10
}
