import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('pages')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ pages: data })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, content_json, content_html, seo_title, seo_description } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return Response.json(
        { error: 'Title is required.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const slug = body.slug?.trim() || generateSlug(title)

    // Check for slug uniqueness
    const { data: existing } = await supabase
      .from('pages')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    const finalSlug = existing ? `${slug}-${Date.now()}` : slug

    const { data, error } = await supabase
      .from('pages')
      .insert({
        title: title.trim(),
        slug: finalSlug,
        content_json: content_json || null,
        content_html: content_html || '',
        seo_title: seo_title || title.trim(),
        seo_description: seo_description || '',
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ page: data }, { status: 201 })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}
