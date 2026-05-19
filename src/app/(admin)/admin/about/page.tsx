import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import AboutEditor from './AboutEditor'

export const metadata: Metadata = { title: 'About' }
export const dynamic = 'force-dynamic'

export default async function AdminAboutPage() {
  const supabase = await createClient()
  const [sectionsRes, calloutsRes, credsRes] = await Promise.all([
    supabase
      .from('bio_sections')
      .select('section_key, heading, body_markdown, display_order, is_published, image_url, image_alt, updated_at')
      .order('display_order', { ascending: true }),
    supabase
      .from('bio_callouts')
      .select('id, kind, label, body_markdown, display_order, is_published, updated_at')
      .order('display_order', { ascending: true }),
    supabase
      .from('bio_credentials_block')
      .select('full_name, degrees, hero_image_url, contact_email, updated_at')
      .eq('id', true)
      .maybeSingle(),
  ])

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-light text-charcoal">About page</h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          Edit the bio sections, side callouts, and the credentials header. Only published rows appear on the live About page.
        </p>
      </div>
      <AboutEditor
        sections={sectionsRes.data || []}
        callouts={calloutsRes.data || []}
        credentials={credsRes.data || null}
      />
    </div>
  )
}
