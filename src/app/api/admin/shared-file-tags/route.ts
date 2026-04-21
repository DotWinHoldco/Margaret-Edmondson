import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('shared_file_tags')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const rawLabel = String(body.label || '').trim()
  if (!rawLabel) return Response.json({ error: 'label required' }, { status: 400 })

  const slug = slugify(rawLabel)
  if (!slug) return Response.json({ error: 'Invalid label' }, { status: 400 })

  const { data: existing } = await supabase
    .from('shared_file_tags')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (existing) return Response.json({ data: existing })

  const { data, error } = await supabase
    .from('shared_file_tags')
    .insert({
      slug,
      label: rawLabel,
      sort_order: 500,
      is_default: false,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data }, { status: 201 })
}
