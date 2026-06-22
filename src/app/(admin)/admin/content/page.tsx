import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import ContentEditor from './ContentEditor'

export const metadata: Metadata = {
  title: 'Site Content',
}

interface ContentRow {
  id: string
  page: string
  section: string
  content_key: string
  content_value: string
  content_type: string
  is_active: boolean
}

export default async function AdminContentPage() {
  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('site_content')
    .select('id, page, section, content_key, content_value, content_type, is_active, updated_at, updated_by')
    .order('page', { ascending: true })
    .order('section', { ascending: true })
    .order('content_key', { ascending: true })

  const grouped: Record<string, Record<string, ContentRow[]>> = {}
  for (const row of (rows || []) as ContentRow[]) {
    if (!grouped[row.page]) grouped[row.page] = {}
    if (!grouped[row.page][row.section]) grouped[row.page][row.section] = []
    grouped[row.page][row.section].push(row)
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-light text-charcoal">
        Site Content
      </h1>

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-sm border border-charcoal/10 bg-white px-4 py-12 text-center font-body text-sm text-charcoal/40">
          No site content entries found.
        </div>
      ) : (
        Object.entries(grouped).map(([page, sections]) => (
          <div
            key={page}
            className="rounded-sm border border-charcoal/10 bg-white"
          >
            <div className="border-b border-charcoal/10 bg-charcoal/[0.02] px-4 py-3">
              <h2 className="font-display text-lg font-medium capitalize text-charcoal">
                {page}
              </h2>
            </div>
            <div className="divide-y divide-charcoal/5">
              {Object.entries(sections).map(([section, fields]) => (
                <div key={section} className="p-4">
                  <h3 className="mb-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/40">
                    {section}
                  </h3>
                  <div className="space-y-3">
                    {fields.map((field) => (
                      <ContentEditor key={field.id} field={field} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
