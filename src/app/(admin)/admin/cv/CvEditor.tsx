'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { CV_SECTIONS, sectionLabel, type CvEntry, type CvSection } from '@/lib/cv'

interface Settings { intro: string; contact_email: string }
interface ArtworkOption { slug: string; title: string }

interface Props {
  entries: CvEntry[]
  settings: Settings
  artworks: ArtworkOption[]
}

const TABS = [...CV_SECTIONS, 'settings'] as const
type Tab = (typeof TABS)[number]

export default function CvEditor({ entries, settings, artworks }: Props) {
  const [tab, setTab] = useState<Tab>('exhibitions')

  return (
    <div>
      <div className="border-b border-charcoal/10 mb-6">
        <nav className="flex gap-6 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`pb-3 -mb-px font-body text-sm font-medium uppercase tracking-wider transition-colors border-b-2 ${
                tab === t ? 'border-teal text-teal' : 'border-transparent text-charcoal/50 hover:text-charcoal'
              }`}
            >
              {t === 'settings' ? 'Header & intro' : sectionLabel(t as CvSection)}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'settings' ? (
        <SettingsTab settings={settings} />
      ) : (
        <SectionTab section={tab as CvSection} entries={entries.filter((e) => e.section === tab)} artworks={artworks} />
      )}
    </div>
  )
}

function StatusPill({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null
  const styles =
    status === 'saving' ? 'bg-charcoal/5 text-charcoal/60' :
    status === 'saved' ? 'bg-teal/15 text-teal' :
    'bg-coral/15 text-coral'
  const label = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save failed'
  return <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[11px] font-semibold ${styles}`}>{label}</span>
}

function SectionTab({
  section,
  entries,
  artworks,
}: {
  section: CvSection
  entries: CvEntry[]
  artworks: ArtworkOption[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState(entries)
  const [status, setStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})
  const [pending, startTransition] = useTransition()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const showExhibitionFields = section === 'exhibitions'
  const showInstitutionField = section !== 'affiliations'

  const update = (id: string, patch: Partial<CvEntry>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const save = async (e: CvEntry) => {
    setStatus((p) => ({ ...p, [e.id]: 'saving' }))
    try {
      await apiSend(`/api/admin/cv-entries/${e.id}`, 'PATCH', {
        section: e.section,
        year: e.year,
        title: e.title,
        venue: e.venue,
        institution: e.institution,
        location: e.location,
        juror: e.juror,
        award: e.award,
        notes: e.notes,
        linked_artwork_slug: e.linked_artwork_slug,
        display_order: e.display_order,
        is_published: e.is_published,
      })
      setStatus((p) => ({ ...p, [e.id]: 'saved' }))
      toast.success('Entry saved.')
      setTimeout(() => setStatus((p) => ({ ...p, [e.id]: 'idle' })), 1500)
      router.refresh()
    } catch (err) {
      setStatus((p) => ({ ...p, [e.id]: 'error' }))
      toast.error(errorMessage(err))
    }
  }

  const addNew = () => {
    startTransition(async () => {
      try {
        await apiSend('/api/admin/cv-entries', 'POST', {
          section,
          year: String(new Date().getFullYear()),
          title: 'New entry',
          display_order: rows.length,
          is_published: true,
        })
        toast.success('Entry added.')
        router.refresh()
      } catch (err) {
        toast.error(errorMessage(err))
      }
    })
  }

  const remove = async (id: string) => {
    try {
      await apiSend(`/api/admin/cv-entries/${id}`, 'DELETE')
      setRows((prev) => prev.filter((r) => r.id !== id))
      toast.success('Entry deleted.')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    }
    setConfirmId(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={addNew}
          className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors disabled:opacity-50"
        >
          + Add {sectionLabel(section).toLowerCase()} entry
        </button>
      </div>

      {rows.length === 0 && (
        <p className="font-body text-sm text-charcoal/50">No entries yet.</p>
      )}

      {rows.map((e) => (
        <div key={e.id} className="rounded-lg border border-charcoal/10 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <code className="font-mono text-xs text-charcoal/40">{e.id.slice(0, 8)}…</code>
            <div className="flex items-center gap-3">
              <StatusPill status={status[e.id] || 'idle'} />
              <label className="flex items-center gap-2 font-body text-xs text-charcoal/70">
                <input
                  type="checkbox"
                  checked={e.is_published}
                  onChange={(ev) => update(e.id, { is_published: ev.target.checked })}
                />
                Published
              </label>
              <label className="flex items-center gap-2 font-body text-xs text-charcoal/70">
                Order
                <input
                  type="number"
                  value={e.display_order}
                  onChange={(ev) => update(e.id, { display_order: Number(ev.target.value) })}
                  className="w-16 rounded border border-charcoal/15 px-2 py-1 font-body text-sm"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3">
            <label className="col-span-12 sm:col-span-3">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Year</span>
              <input
                value={e.year}
                onChange={(ev) => update(e.id, { year: ev.target.value })}
                placeholder="2025 or 2020–2021"
                className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
              />
            </label>
            <label className="col-span-12 sm:col-span-9">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">
                {section === 'exhibitions' ? 'Exhibition title' : section === 'experience' ? 'Role' : 'Title'}
              </span>
              <input
                value={e.title}
                onChange={(ev) => update(e.id, { title: ev.target.value })}
                className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
              />
            </label>

            {showExhibitionFields && (
              <label className="col-span-12 sm:col-span-6">
                <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Venue</span>
                <input
                  value={e.venue || ''}
                  onChange={(ev) => update(e.id, { venue: ev.target.value || null })}
                  className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
                />
              </label>
            )}

            {showInstitutionField && (
              <label className={`col-span-12 ${showExhibitionFields ? 'sm:col-span-6' : 'sm:col-span-9'}`}>
                <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">
                  {section === 'experience' ? 'Employer' : 'Institution'}
                </span>
                <input
                  value={e.institution || ''}
                  onChange={(ev) => update(e.id, { institution: ev.target.value || null })}
                  className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
                />
              </label>
            )}

            <label className="col-span-12 sm:col-span-4">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Location</span>
              <input
                value={e.location || ''}
                onChange={(ev) => update(e.id, { location: ev.target.value || null })}
                placeholder="City, ST"
                className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
              />
            </label>

            {showExhibitionFields && (
              <>
                <label className="col-span-12 sm:col-span-4">
                  <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Juror</span>
                  <input
                    value={e.juror || ''}
                    onChange={(ev) => update(e.id, { juror: ev.target.value || null })}
                    className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
                  />
                </label>
                <label className="col-span-12 sm:col-span-4">
                  <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Award</span>
                  <input
                    value={e.award || ''}
                    onChange={(ev) => update(e.id, { award: ev.target.value || null })}
                    placeholder="Merchant Award recipient for Solo"
                    className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
                  />
                </label>
                <label className="col-span-12">
                  <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">
                    Linked artwork (for award piece)
                  </span>
                  <select
                    value={e.linked_artwork_slug || ''}
                    onChange={(ev) => update(e.id, { linked_artwork_slug: ev.target.value || null })}
                    className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
                  >
                    <option value="">— None —</option>
                    {artworks.map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {a.title} ({a.slug})
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label className="col-span-12">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Notes</span>
              <input
                value={e.notes || ''}
                onChange={(ev) => update(e.id, { notes: ev.target.value || null })}
                placeholder='e.g., "Summa Cum Laude" or "Juried"'
                className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
              />
            </label>
          </div>

          <div className="flex justify-between items-center mt-4">
            <button
              type="button"
              onClick={() => setConfirmId(e.id)}
              className="font-body text-xs uppercase tracking-wider text-coral hover:text-coral/80 transition-colors"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => save(e)}
              className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors"
            >
              Save entry
            </button>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this CV entry?"
        message="This will permanently remove the entry from your CV."
        variant="danger"
        confirmText="Delete"
        onConfirm={() => confirmId && remove(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  )
}

function SettingsTab({ settings }: { settings: Settings }) {
  const router = useRouter()
  const toast = useToast()
  const [s, setS] = useState(settings)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const save = async () => {
    setStatus('saving')
    try {
      await apiSend('/api/admin/cv-settings', 'PATCH', s)
      setStatus('saved')
      toast.success('Saved.')
      setTimeout(() => setStatus('idle'), 1500)
      router.refresh()
    } catch (err) {
      setStatus('error')
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="rounded-lg border border-charcoal/10 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-light text-charcoal">CV header</h2>
        <StatusPill status={status} />
      </div>

      <label className="block">
        <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Intro line</span>
        <input
          value={s.intro}
          onChange={(e) => setS({ ...s, intro: e.target.value })}
          className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
        />
      </label>

      <label className="block">
        <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Contact email</span>
        <input
          type="email"
          value={s.contact_email}
          onChange={(e) => setS({ ...s, contact_email: e.target.value })}
          className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
        />
      </label>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors"
        >
          Save header
        </button>
      </div>
    </div>
  )
}
