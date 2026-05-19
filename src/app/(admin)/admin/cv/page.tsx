import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import CvEditor from './CvEditor'

export const metadata: Metadata = { title: 'CV' }
export const dynamic = 'force-dynamic'

export default async function AdminCvPage() {
  const supabase = await createClient()
  const [entriesRes, settingsRes, productsRes] = await Promise.all([
    supabase
      .from('cv_entries')
      .select('id, section, year, sort_year_numeric, title, venue, institution, location, juror, award, notes, linked_artwork_slug, display_order, is_published, created_at, updated_at')
      .order('section', { ascending: true })
      .order('sort_year_numeric', { ascending: false })
      .order('display_order', { ascending: true }),
    supabase.from('cv_settings').select('intro, contact_email').eq('id', true).maybeSingle(),
    supabase.from('products').select('slug, title').eq('is_published', true).order('title', { ascending: true }),
  ])

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-light text-charcoal">Curriculum Vitae</h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          Manage exhibitions, education, affiliations, and experience. Link awards to artwork pages where applicable.
        </p>
      </div>
      <CvEditor
        entries={entriesRes.data || []}
        settings={settingsRes.data || { intro: 'Selected exhibitions, education, and teaching experience.', contact_email: 'margaret117art@gmail.com' }}
        artworks={(productsRes.data || []) as { slug: string; title: string }[]}
      />
    </div>
  )
}
