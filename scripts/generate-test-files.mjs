import fs from 'node:fs'
import path from 'node:path'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  AlignmentType,
} from 'docx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const OUT_DIR = path.resolve('public/test-files')
fs.mkdirSync(OUT_DIR, { recursive: true })

const CACTUS = 'public/Margaret Edmondson/ARTWORK/Cactuses/Hot Air II.jpg'
const BEACH = 'public/Margaret Edmondson/ARTWORK/Beach and SC/Dolphin Watch.jpg'

// ─── test1.docx ────────────────────────────────────────────────
const test1Body = [
  'Dear Margaret,',
  '',
  'I just had to write and tell you how much my husband and I are loving the cactus painting we commissioned from you last month. It arrived beautifully packaged, and the colors are even more striking in person than they were in the preview photos. We hung it in our dining room and it has become the conversation piece of every dinner party.',
  '',
  'My favorite detail is the way the light hits the blooms — it genuinely looks like late afternoon sun coming through a window. My friends have been asking who the artist is and I am happily sending them to artbyme.studio.',
  '',
  'Thank you for creating something that brings us so much joy every day.',
  '',
  'Warmly,',
  'Jennifer Alvarez',
  'Austin, TX',
  'March 14, 2026',
]

const cactusImg = fs.readFileSync(CACTUS)

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          text: 'A Testimonial for Margaret',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
        }),
        ...test1Body.map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line })],
              spacing: { after: 120 },
            }),
        ),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: cactusImg,
              transformation: { width: 360, height: 270 },
              type: 'jpg',
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: 'The "Hot Air II" commission in our dining room',
              italics: true,
              color: '666666',
            }),
          ],
        }),
      ],
    },
  ],
})

const docxBuf = await Packer.toBuffer(doc)
fs.writeFileSync(path.join(OUT_DIR, 'test1.docx'), docxBuf)
console.log('Wrote test1.docx (' + docxBuf.length + ' bytes)')

// ─── test2.pdf ────────────────────────────────────────────────
const test2Body = [
  'Hi Margaret,',
  '',
  'I wanted to send a proper thank-you for the "Dolphin Watch" piece. It',
  'arrived yesterday and it is absolutely perfect for our Charleston beach',
  'house. My wife cried when she unwrapped it.',
  '',
  'You captured the exact quality of Carolina light that we fell in love',
  'with when we first visited. Every guest who has come through has asked',
  'about the painting — and several have asked how to commission their own.',
  '',
  'Thank you for your beautiful work and for making the whole process so',
  'easy. We are already planning a second commission for the foyer.',
  '',
  'Best regards,',
  'David Chen',
  'Mount Pleasant, SC',
  'Received: April 2, 2026',
  'Source: Email',
]

const beachImg = fs.readFileSync(BEACH)
const pdf = await PDFDocument.create()
const page = pdf.addPage([612, 792]) // US Letter
const font = await pdf.embedFont(StandardFonts.Helvetica)
const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

page.drawText('Testimonial for Margaret Edmondson', {
  x: 72,
  y: 740,
  size: 18,
  font: bold,
  color: rgb(0.1, 0.2, 0.3),
})

let y = 710
for (const line of test2Body) {
  page.drawText(line, {
    x: 72,
    y,
    size: 12,
    font,
    color: rgb(0.15, 0.15, 0.15),
  })
  y -= 18
}

// Embed JPEG (will be stored with DCTDecode filter)
const jpg = await pdf.embedJpg(beachImg)
const imgDims = jpg.scale(0.35)
page.drawImage(jpg, {
  x: (612 - imgDims.width) / 2,
  y: 120,
  width: imgDims.width,
  height: imgDims.height,
})
page.drawText('"Dolphin Watch" — hanging in our beach house', {
  x: 72,
  y: 100,
  size: 10,
  font,
  color: rgb(0.4, 0.4, 0.4),
})

const pdfBytes = await pdf.save()
fs.writeFileSync(path.join(OUT_DIR, 'test2.pdf'), pdfBytes)
console.log('Wrote test2.pdf (' + pdfBytes.length + ' bytes)')
