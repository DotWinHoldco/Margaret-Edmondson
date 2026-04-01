import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const supabase = await createClient()

    if (id) {
      const { data: post, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        return Response.json({ error: error.message }, { status: 500 })
      }

      return Response.json({ post })
    }

    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('id, title, slug, status, published_at, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ posts: posts || [] })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      title,
      slug,
      excerpt,
      content,
      cover_image_url,
      tags,
      status,
      seo_title,
      seo_description,
    } = body

    if (!title || !slug) {
      return Response.json(
        { error: 'Title and slug are required.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const postData: Record<string, unknown> = {
      title,
      slug,
      excerpt: excerpt || null,
      content_html: content || '',
      content_json: {},
      cover_image_url: cover_image_url || null,
      tags: tags || [],
      status: status || 'draft',
      seo_title: seo_title || null,
      seo_description: seo_description || null,
      author_id: null,
    }

    if (status === 'published') {
      postData.published_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('blog_posts')
      .insert(postData)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ post: data }, { status: 201 })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return Response.json({ error: 'Post ID is required.' }, { status: 400 })
    }

    const supabase = await createClient()

    const updateData: Record<string, unknown> = {}

    if (fields.title !== undefined) updateData.title = fields.title
    if (fields.slug !== undefined) updateData.slug = fields.slug
    if (fields.excerpt !== undefined) updateData.excerpt = fields.excerpt || null
    if (fields.content !== undefined) updateData.content_html = fields.content
    if (fields.cover_image_url !== undefined) updateData.cover_image_url = fields.cover_image_url || null
    if (fields.tags !== undefined) updateData.tags = fields.tags || []
    if (fields.status !== undefined) updateData.status = fields.status
    if (fields.seo_title !== undefined) updateData.seo_title = fields.seo_title || null
    if (fields.seo_description !== undefined) updateData.seo_description = fields.seo_description || null
    if (fields.published_at !== undefined) updateData.published_at = fields.published_at

    // Auto-set published_at when publishing for the first time
    if (fields.status === 'published' && !fields.published_at) {
      updateData.published_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('blog_posts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ post: data })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return Response.json({ error: 'Post ID is required.' }, { status: 400 })
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
