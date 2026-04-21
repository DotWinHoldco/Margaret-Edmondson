import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'

const MODEL = 'claude-sonnet-4-6'
const SHARED_BUCKET = 'shared-files'
const TESTIMONIALS_BUCKET = 'testimonials'

export const maxDuration = 120

const SYSTEM_PROMPT = `You extract structured testimonial data from customer testimonials sent to Margaret Edmondson, a painter whose studio is ArtByME.

Customers send these testimonials by email, letter, text message, social post, or sometimes handwritten/scanned. The document may contain a photograph of the customer, their home, or one of Margaret's paintings they received.

Return STRICT JSON (no prose, no markdown fences) matching this schema:

{
  "title": string | null,            // short headline, 2-6 words, Title Case. If absent, invent one from the content
  "name": string,                    // the customer's name as written; if unknown say "Anonymous"
  "role": string | null,             // their role/relationship if mentioned (e.g. "Collector", "Gallery Owner")
  "location": string | null,         // "City, ST" or "City, Country" if mentioned, else null
  "quote": string,                   // a single-sentence pull-quote (the strongest line), 140 chars max
  "content": string,                 // the full testimonial cleaned up: fix typos, remove signatures/headers, keep the customer's voice. No HTML.
  "date_received": string | null,    // YYYY-MM-DD if a date is explicitly stated, else null
  "source": string | null,           // one of: "Email", "Text Message", "Instagram", "Facebook", "Google Review", "In Person", "Phone Call", "Letter / Card", "Other", or null
  "has_image": boolean,              // true if the document contains any photograph or artwork image
  "image_caption": string | null     // 1-sentence description of the image if has_image is true
}

Rules:
- Never invent facts. If something isn't in the document, use null.
- Strip salutations ("Dear Margaret,") and sign-offs ("— Jane") from content, but keep the name separately.
- The quote should be verbatim (or lightly punctuated) from the testimonial itself.
- If the document is not a testimonial, return {"name":"UNKNOWN","content":"","quote":"","has_image":false,"title":null,"role":null,"location":null,"date_received":null,"source":null,"image_caption":null}.`

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
  return new Anthropic({ apiKey: key })
}

async function downloadSharedFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
) {
  const { data, error } = await supabase.storage.from(SHARED_BUCKET).download(path)
  if (error || !data) throw new Error(error?.message || 'Download failed')
  const ab = await data.arrayBuffer()
  return Buffer.from(ab)
}

async function extractFromDocx(buf: Buffer) {
  const { value: text } = await mammoth.extractRawText({ buffer: buf })
  const zip = await JSZip.loadAsync(buf)
  let imageBuf: Buffer | null = null
  let imageMime: string | null = null
  let imageName: string | null = null
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('word/media/')) continue
    const lower = name.toLowerCase()
    if (!/\.(png|jpe?g|gif|webp)$/.test(lower)) continue
    const entry = zip.file(name)
    if (!entry) continue
    imageBuf = await entry.async('nodebuffer')
    imageName = name.split('/').pop() || 'image'
    imageMime = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.gif')
        ? 'image/gif'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg'
    break
  }
  return {
    text,
    image:
      imageBuf && imageMime
        ? { buffer: imageBuf, mime: imageMime, name: imageName || 'image' }
        : null,
  }
}

async function extractFirstJpegFromPdf(buf: Buffer) {
  try {
    const pdf = await PDFDocument.load(buf, { updateMetadata: false })
    const refs = pdf.context.enumerateIndirectObjects()
    for (const [, obj] of refs) {
      if (!(obj instanceof PDFRawStream)) continue
      const dict = obj.dict
      const subtype = dict.get(PDFName.of('Subtype'))
      if (!subtype || subtype.toString() !== '/Image') continue
      const filter = dict.get(PDFName.of('Filter'))
      const filterStr = filter?.toString() || ''
      if (filterStr.includes('DCTDecode')) {
        return {
          buffer: Buffer.from(obj.contents),
          mime: 'image/jpeg',
          name: 'pdf-embedded.jpg',
        }
      }
    }
  } catch (err) {
    console.error('PDF image extraction failed', err)
  }
  return null
}

interface Extracted {
  title: string | null
  name: string
  role: string | null
  location: string | null
  quote: string
  content: string
  date_received: string | null
  source: string | null
  has_image: boolean
  image_caption: string | null
}

function parseJsonResponse(text: string): Extracted {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim()
  const parsed = JSON.parse(trimmed)
  return {
    title: parsed.title ?? null,
    name: String(parsed.name || 'Anonymous').trim(),
    role: parsed.role ?? null,
    location: parsed.location ?? null,
    quote: String(parsed.quote || '').trim(),
    content: String(parsed.content || '').trim(),
    date_received: parsed.date_received ?? null,
    source: parsed.source ?? null,
    has_image: Boolean(parsed.has_image),
    image_caption: parsed.image_caption ?? null,
  }
}

async function extractFieldsFromDocx(client: Anthropic, text: string) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract the testimonial from this document:\n\n${text || '(empty)'}\n\nReturn ONLY the JSON object.`,
          },
        ],
      },
    ],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text')
    throw new Error('No text response from Claude')
  return { parsed: parseJsonResponse(textBlock.text), usage: response.usage }
}

async function extractFieldsFromPdf(client: Anthropic, pdfBuf: Buffer) {
  const base64 = pdfBuf.toString('base64')
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'Extract the testimonial fields from this PDF. Return ONLY the JSON object.',
          },
        ],
      },
    ],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text')
    throw new Error('No text response from Claude')
  return { parsed: parseJsonResponse(textBlock.text), usage: response.usage }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await request.json()
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })

    const { data: file, error: fileErr } = await supabase
      .from('shared_files')
      .select('*')
      .eq('id', id)
      .single()
    if (fileErr || !file)
      return Response.json({ error: fileErr?.message || 'Not found' }, { status: 404 })

    const fileBuf = await downloadSharedFile(supabase, file.file_path)
    const lowerName = String(file.file_name || '').toLowerCase()
    const mime = String(file.mime_type || '')
    const isDocx =
      mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx')
    const isPdf = mime === 'application/pdf' || lowerName.endsWith('.pdf')

    if (!isDocx && !isPdf) {
      return Response.json(
        { error: 'Only .docx or .pdf files are supported for AI extraction' },
        { status: 400 },
      )
    }

    const anthropic = getAnthropic()

    let extracted: Extracted
    let image: { buffer: Buffer; mime: string; name: string } | null = null
    let usage: Anthropic.Messages.Usage | null = null

    if (isDocx) {
      const docx = await extractFromDocx(fileBuf)
      image = docx.image
      const result = await extractFieldsFromDocx(anthropic, docx.text)
      extracted = result.parsed
      usage = result.usage
    } else {
      const result = await extractFieldsFromPdf(anthropic, fileBuf)
      extracted = result.parsed
      usage = result.usage
      image = await extractFirstJpegFromPdf(fileBuf)
    }

    let imagePublicUrl: string | null = null
    let imageStoragePath: string | null = null

    if (image) {
      const ext = image.mime === 'image/png' ? 'png' : image.mime === 'image/gif' ? 'gif' : image.mime === 'image/webp' ? 'webp' : 'jpg'
      const stamp = Date.now()
      imageStoragePath = `ai-extracted/${id}-${stamp}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(TESTIMONIALS_BUCKET)
        .upload(imageStoragePath, image.buffer, {
          contentType: image.mime,
          upsert: true,
        })
      if (upErr) {
        console.error('Image upload failed', upErr)
        imageStoragePath = null
      } else {
        const { data: pub } = supabase.storage
          .from(TESTIMONIALS_BUCKET)
          .getPublicUrl(imageStoragePath)
        imagePublicUrl = pub.publicUrl
      }
    }

    const { data: testimonial, error: insErr } = await supabase
      .from('testimonials')
      .insert({
        name: extracted.name || 'Anonymous',
        role: extracted.role,
        title: extracted.title,
        quote: extracted.quote || null,
        content: extracted.content || extracted.quote || null,
        source: extracted.source,
        event_context: extracted.location,
        date_received: extracted.date_received,
        status: 'pending',
        is_featured: false,
        sort_order: 0,
        image_url: imagePublicUrl,
      })
      .select()
      .single()

    if (insErr) {
      return Response.json({ error: insErr.message }, { status: 500 })
    }

    if (imageStoragePath && imagePublicUrl) {
      await supabase.from('testimonial_media').insert({
        testimonial_id: testimonial.id,
        media_type: 'image',
        url: imagePublicUrl,
        storage_path: imageStoragePath,
        file_name: image!.name,
        mime_type: image!.mime,
        size_bytes: image!.buffer.length,
        caption: extracted.image_caption,
        sort_order: 0,
      })
    }

    await supabase
      .from('shared_files')
      .update({
        ai_processed: true,
        ai_result: {
          testimonial_id: testimonial.id,
          extracted,
          usage: usage
            ? {
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
                cache_read_input_tokens: usage.cache_read_input_tokens,
                cache_creation_input_tokens: usage.cache_creation_input_tokens,
              }
            : null,
        },
      })
      .eq('id', id)

    return Response.json({
      success: true,
      testimonial,
      extracted,
      image_url: imagePublicUrl,
      usage,
    })
  } catch (err) {
    console.error('process-ai error', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return Response.json({ error: message }, { status: 500 })
  }
}
