// Server-side adapters for the unified /admin/pages editor. Each
// adapter declares `load()` and `saveSection()` for a page slug. The
// unified API routes call into these so existing per-page tables stay
// intact. Revisions are written by the API route around saveSection.

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseSortYear } from '@/lib/cv'

export interface ServerAdapter {
  slug: string
  load(supabase: SupabaseClient): Promise<Record<string, unknown>>
  saveSection(
    supabase: SupabaseClient,
    sectionKey: string,
    value: unknown,
    editorUserId: string | null
  ): Promise<void>
  loadSection?(supabase: SupabaseClient, sectionKey: string): Promise<unknown>
}

// ─── About ──────────────────────────────────────────────────────────

interface BioSectionRow {
  section_key: string
  heading: string
  body_markdown: string
  display_order: number
  is_published: boolean
  image_url: string | null
  image_alt: string | null
  updated_at: string
}

interface BioCalloutRow {
  id: string
  kind: 'motto' | 'quote' | 'list'
  label: string
  body_markdown: string
  display_order: number
  is_published: boolean
  updated_at: string
}

interface BioCredentialsRow {
  full_name: string
  degrees: Array<{ year: string; degree: string; institution: string; location: string; honors?: string }>
  hero_image_url: string | null
  contact_email: string
  updated_at: string
}

const aboutAdapter: ServerAdapter = {
  slug: 'about',
  async load(supabase) {
    const [sections, callouts, credentials] = await Promise.all([
      supabase
        .from('bio_sections')
        .select('*')
        .order('display_order', { ascending: true }),
      supabase
        .from('bio_callouts')
        .select('*')
        .order('display_order', { ascending: true }),
      supabase
        .from('bio_credentials_block')
        .select('*')
        .eq('id', true)
        .maybeSingle(),
    ])
    return {
      sections: (sections.data || []) as BioSectionRow[],
      callouts: (callouts.data || []) as BioCalloutRow[],
      credentials: (credentials.data || null) as BioCredentialsRow | null,
    }
  },
  async loadSection(supabase, sectionKey) {
    const all = await this.load!(supabase)
    return (all as Record<string, unknown>)[sectionKey]
  },
  async saveSection(supabase, sectionKey, value) {
    const nowIso = new Date().toISOString()
    if (sectionKey === 'sections') {
      const rows = value as BioSectionRow[]
      for (const row of rows) {
        const { error } = await supabase
          .from('bio_sections')
          .update({
            heading: row.heading,
            body_markdown: row.body_markdown,
            display_order: row.display_order,
            is_published: row.is_published,
            image_url: row.image_url,
            image_alt: row.image_alt,
            updated_at: nowIso,
          })
          .eq('section_key', row.section_key)
        if (error) throw new Error(`bio_sections update failed: ${error.message}`)
      }
      return
    }
    if (sectionKey === 'callouts') {
      const rows = value as BioCalloutRow[]
      for (const row of rows) {
        const { error } = await supabase
          .from('bio_callouts')
          .update({
            kind: row.kind,
            label: row.label,
            body_markdown: row.body_markdown,
            display_order: row.display_order,
            is_published: row.is_published,
            updated_at: nowIso,
          })
          .eq('id', row.id)
        if (error) throw new Error(`bio_callouts update failed: ${error.message}`)
      }
      return
    }
    if (sectionKey === 'credentials') {
      const creds = value as BioCredentialsRow
      const { error } = await supabase
        .from('bio_credentials_block')
        .update({
          full_name: creds.full_name,
          degrees: creds.degrees,
          hero_image_url: creds.hero_image_url,
          contact_email: creds.contact_email,
          updated_at: nowIso,
        })
        .eq('id', true)
      if (error) throw new Error(`bio_credentials_block update failed: ${error.message}`)
      return
    }
    throw new Error(`Unknown about section: ${sectionKey}`)
  },
}

// ─── CV ─────────────────────────────────────────────────────────────

interface CvEntryRow {
  id: string
  section: 'exhibitions' | 'education' | 'affiliations' | 'experience'
  year: string
  title: string
  venue: string | null
  institution: string | null
  location: string | null
  juror: string | null
  award: string | null
  notes: string | null
  linked_artwork_slug: string | null
  display_order: number
  is_published: boolean
}

interface CvSettingsRow {
  intro: string
  contact_email: string
}

const CV_SECTION_KEYS = ['exhibitions', 'education', 'affiliations', 'experience'] as const

const cvAdapter: ServerAdapter = {
  slug: 'cv',
  async load(supabase) {
    const [entries, settings] = await Promise.all([
      supabase
        .from('cv_entries')
        .select('*')
        .order('sort_year_numeric', { ascending: false })
        .order('display_order', { ascending: true }),
      supabase
        .from('cv_settings')
        .select('*')
        .eq('id', true)
        .maybeSingle(),
    ])
    const allEntries = (entries.data || []) as CvEntryRow[]
    const grouped: Record<string, CvEntryRow[]> = {
      exhibitions: [],
      education: [],
      affiliations: [],
      experience: [],
    }
    for (const e of allEntries) {
      if (grouped[e.section]) grouped[e.section]!.push(e)
    }
    return {
      ...grouped,
      settings: (settings.data || null) as CvSettingsRow | null,
    }
  },
  async loadSection(supabase, sectionKey) {
    const all = await this.load!(supabase)
    return (all as Record<string, unknown>)[sectionKey]
  },
  async saveSection(supabase, sectionKey, value) {
    const nowIso = new Date().toISOString()
    if ((CV_SECTION_KEYS as readonly string[]).includes(sectionKey)) {
      // Wholesale list save with diff: rows with ids are PATCHed, rows
      // without ids are INSERTed, rows present in current state but
      // missing here are DELETEd.
      const incoming = (value as CvEntryRow[]) || []
      const { data: current } = await supabase
        .from('cv_entries')
        .select('id')
        .eq('section', sectionKey)
      const currentIds = new Set((current || []).map((r: { id: string }) => r.id))
      const incomingIds = new Set(incoming.filter((r) => r.id).map((r) => r.id))

      for (const row of incoming) {
        const payload = {
          section: sectionKey as CvEntryRow['section'],
          year: row.year,
          title: row.title,
          venue: row.venue ?? null,
          institution: row.institution ?? null,
          location: row.location ?? null,
          juror: row.juror ?? null,
          award: row.award ?? null,
          notes: row.notes ?? null,
          linked_artwork_slug: row.linked_artwork_slug ?? null,
          display_order: row.display_order ?? 0,
          is_published: row.is_published ?? true,
          sort_year_numeric: parseSortYear(row.year),
        }
        if (row.id && currentIds.has(row.id)) {
          const { error } = await supabase
            .from('cv_entries')
            .update({ ...payload, updated_at: nowIso })
            .eq('id', row.id)
          if (error) throw new Error(`cv_entries update failed: ${error.message}`)
        } else {
          const { error } = await supabase
            .from('cv_entries')
            .insert(payload)
          if (error) throw new Error(`cv_entries insert failed: ${error.message}`)
        }
      }

      const toDelete = [...currentIds].filter((id) => !incomingIds.has(id))
      if (toDelete.length) {
        const { error } = await supabase
          .from('cv_entries')
          .delete()
          .in('id', toDelete)
        if (error) throw new Error(`cv_entries delete failed: ${error.message}`)
      }
      return
    }
    if (sectionKey === 'settings') {
      const s = value as CvSettingsRow
      const { error } = await supabase
        .from('cv_settings')
        .update({ intro: s.intro, contact_email: s.contact_email, updated_at: nowIso })
        .eq('id', true)
      if (error) throw new Error(`cv_settings update failed: ${error.message}`)
      return
    }
    throw new Error(`Unknown cv section: ${sectionKey}`)
  },
}

// ─── Registry ───────────────────────────────────────────────────────

const adapters: Record<string, ServerAdapter> = {
  about: aboutAdapter,
  cv: cvAdapter,
}

export function getServerAdapter(slug: string): ServerAdapter | null {
  return adapters[slug] ?? null
}

export function registerServerAdapter(adapter: ServerAdapter): void {
  adapters[adapter.slug] = adapter
}

export function listRegisteredAdapters(): string[] {
  return Object.keys(adapters)
}
