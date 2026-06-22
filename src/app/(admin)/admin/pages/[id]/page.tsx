import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import EditPageForm from './EditPageForm'

export const metadata: Metadata = {
  title: 'Edit Page',
}

export default async function EditPagePage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: page, error } = await supabase
    .from('pages')
    .select('id, title, slug, content_json, content_html, seo_title, seo_description, updated_at, is_published, hero_image_url, page_kind')
    .eq('id', id)
    .single()

  if (error || !page) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-light text-charcoal">
          Edit Page
        </h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          Editing: {page.title}
        </p>
      </div>

      <EditPageForm page={page} />
    </div>
  )
}
