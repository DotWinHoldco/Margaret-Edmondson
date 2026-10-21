import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import { sanitizeBioContent } from '@/lib/bio-content'
import stripTags from 'sanitize-html'

export const dynamic = 'force-dynamic'

function textBlocks(value: string): string[] {
  const html = sanitizeBioContent(value).replace(/<\/(?:p|h[1-6]|li|blockquote)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n')
  const plain = stripTags(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  // Standard PDF fonts support Latin-1; normalize punctuation before encoding.
  return plain.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\xFF\n]/g, '')
    .split(/\n\s*\n/).map(block => block.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** View the same published biography that appears on the About page. */
export async function GET() {
  const db = await createClient()
  const { data, error } = await db.from('bio_sections').select('heading,body_markdown').eq('is_published', true).order('display_order', { ascending: true })
  if (error || !data?.length) return new Response('The biography is temporarily unavailable.', { status: 503 })
  const pdf = await PDFDocument.create()
  pdf.setTitle('Margaret Edmondson - Artist Biography')
  pdf.setAuthor('Margaret Edmondson')
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const sans = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(.17,.17,.17), teal = rgb(.23,.49,.48)
  let page = pdf.addPage([612,792]), y = 726
  const footer = () => page.drawText(`artbyme.studio  |  margaret@artbyme.studio                                     ${pdf.getPageCount()}`, { x:54,y:34,size:9,font:sans,color:teal })
  const next = () => { footer(); page = pdf.addPage([612,792]); y=726 }
  page.drawText('Margaret Edmondson', { x:54,y,size:25,font:serif,color:ink }); y-=29
  page.drawText('ARTIST BIOGRAPHY', { x:54,y,size:10,font:bold,color:teal }); y-=32
  for (const section of data) {
    if (y<120) next()
    for (const heading of textBlocks(section.heading)) {
      page.drawText(heading, { x:54,y,size:13,font:bold,color:teal }); y-=24
    }
    for (const block of textBlocks(section.body_markdown)) {
      let line=''
      const draw = () => { if (y<72) next(); page.drawText(line, {x:54,y,size:12,font:serif,color:ink}); y-=17; line='' }
      for (const word of block.split(' ')) {
        const proposed = line ? `${line} ${word}` : word
        if (serif.widthOfTextAtSize(proposed,12)>504 && line) draw()
        line=line ? `${line} ${word}` : word
      }
      if (line) draw()
      y-=12
    }
    y-=8
  }
  footer()
  return new Response(await pdf.save() as BodyInit, { headers: { 'content-type':'application/pdf', 'content-disposition':'inline; filename="margaret-edmondson-biography.pdf"', 'cache-control':'public, max-age=0, must-revalidate' } })
}
