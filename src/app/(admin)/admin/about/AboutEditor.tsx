'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import MediaPicker from '@/components/admin/MediaPicker'

interface Section {
  section_key: string
  heading: string
  body_markdown: string
  display_order: number
  is_published: boolean
  image_url: string | null
  image_alt: string | null
  updated_at: string
}

interface Callout {
  id: string
  kind: 'motto' | 'quote' | 'list'
  label: string
  body_markdown: string
  display_order: number
  is_published: boolean
  updated_at: string
}

interface Degree {
  year: string
  degree: string
  institution: string
  location: string
  honors?: string
}

interface Credentials {
  full_name: string
  degrees: Degree[]
  hero_image_url: string | null
  contact_email: string
  updated_at: string
}

type Tab = 'sections' | 'callouts' | 'credentials'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  sections: Section[]
  callouts: Callout[]
  credentials: Credentials | null
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'sections', label: 'Sections' },
  { id: 'callouts', label: 'Callouts' },
  { id: 'credentials', label: 'Credentials' },
]

const FALLBACK_CREDS: Credentials = {
  full_name: 'Margaret Edmondson',
  degrees: [],
  hero_image_url: null,
  contact_email: 'margaret117art@gmail.com',
  updated_at: new Date().toISOString(),
}

export default function AboutEditor({ sections, callouts, credentials }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('sections')
  const [sectionRows, setSectionRows] = useState(sections)
  const [calloutRows, setCalloutRows] = useState(callouts)
  const [creds, setCreds] = useState<Credentials>(credentials || FALLBACK_CREDS)
  const [saveAllStatus, setSaveAllStatus] = useState<SaveStatus>('idle')

  const saveAll = async () => {
    setSaveAllStatus('saving')
    const calls: Array<Promise<Response>> = []
    for (const s of sectionRows) {
      calls.push(
        fetch(`/api/admin/about/sections/${s.section_key}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            heading: s.heading,
            body_markdown: s.body_markdown,
            display_order: s.display_order,
            is_published: s.is_published,
            image_url: s.image_url,
            image_alt: s.image_alt,
          }),
        }),
      )
    }
    for (const c of calloutRows) {
      calls.push(
        fetch(`/api/admin/about/callouts/${c.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: c.kind,
            label: c.label,
            body_markdown: c.body_markdown,
            display_order: c.display_order,
            is_published: c.is_published,
          }),
        }),
      )
    }
    calls.push(
      fetch('/api/admin/about/credentials', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name: creds.full_name,
          degrees: creds.degrees,
          hero_image_url: creds.hero_image_url,
          contact_email: creds.contact_email,
        }),
      }),
    )
    const results = await Promise.allSettled(calls)
    const anyFailed = results.some((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok))
    setSaveAllStatus(anyFailed ? 'error' : 'saved')
    router.refresh()
    setTimeout(() => setSaveAllStatus('idle'), 2200)
  }

  const totalBlocks = sectionRows.length + calloutRows.length + 1
  const saveAllButton = (
    <button
      type="button"
      onClick={saveAll}
      disabled={saveAllStatus === 'saving'}
      className="rounded-md bg-teal px-5 py-2.5 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors disabled:opacity-50"
    >
      {saveAllStatus === 'saving' ? 'Saving everything…' : 'Save all'}
    </button>
  )

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-4">
        <SaveAllStatusPill status={saveAllStatus} count={totalBlocks} />
        {saveAllButton}
      </div>

      <div className="border-b border-charcoal/10 mb-6">
        <nav className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`pb-3 -mb-px font-body text-sm font-medium uppercase tracking-wider transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-teal text-teal'
                  : 'border-transparent text-charcoal/50 hover:text-charcoal'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* All three tabs stay mounted (just hidden when inactive) so edits in
          one tab survive switching to another. Save All can then patch
          every row in one click. */}
      <div className={tab === 'sections' ? '' : 'hidden'}>
        <SectionsTab rows={sectionRows} setRows={setSectionRows} />
      </div>
      <div className={tab === 'callouts' ? '' : 'hidden'}>
        <CalloutsTab rows={calloutRows} setRows={setCalloutRows} />
      </div>
      <div className={tab === 'credentials' ? '' : 'hidden'}>
        <CredentialsTab creds={creds} setCreds={setCreds} />
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-charcoal/10">
        <SaveAllStatusPill status={saveAllStatus} count={totalBlocks} />
        {saveAllButton}
      </div>
    </div>
  )
}

function SaveAllStatusPill({ status, count }: { status: SaveStatus; count: number }) {
  if (status === 'idle') {
    return (
      <span className="font-body text-xs text-charcoal/40">
        {count} editable {count === 1 ? 'block' : 'blocks'} on this page
      </span>
    )
  }
  const styles =
    status === 'saving' ? 'bg-charcoal/5 text-charcoal/60' :
    status === 'saved' ? 'bg-teal/15 text-teal' :
    'bg-coral/15 text-coral'
  const label = status === 'saving' ? 'Saving…' : status === 'saved' ? 'All saved' : 'Some saves failed'
  return (
    <span className={`inline-block rounded-full px-3 py-1 font-body text-[11px] font-semibold ${styles}`}>
      {label}
    </span>
  )
}

function Toast({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  const styles =
    status === 'saving' ? 'bg-charcoal/5 text-charcoal/60' :
    status === 'saved' ? 'bg-teal/15 text-teal' :
    'bg-coral/15 text-coral'
  const label = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save failed'
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[11px] font-semibold ${styles}`}>
      {label}
    </span>
  )
}

function SectionsTab({
  rows,
  setRows,
}: {
  rows: Section[]
  setRows: (updater: (prev: Section[]) => Section[]) => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<Record<string, SaveStatus>>({})
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  const update = (key: string, patch: Partial<Section>) => {
    setRows((prev) => prev.map((r) => (r.section_key === key ? { ...r, ...patch } : r)))
  }

  const onPickerChoose = async (sectionKey: string, picked: { url: string; alt_text: string | null }) => {
    update(sectionKey, { image_url: picked.url, image_alt: picked.alt_text })
    await fetch(`/api/admin/about/sections/${sectionKey}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image_url: picked.url, image_alt: picked.alt_text }),
    })
    router.refresh()
  }

  const removeImage = async (s: Section) => {
    update(s.section_key, { image_url: null, image_alt: null })
    await fetch(`/api/admin/about/sections/${s.section_key}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image_url: null, image_alt: null }),
    })
    router.refresh()
  }

  const save = async (s: Section) => {
    setStatus((p) => ({ ...p, [s.section_key]: 'saving' }))
    const res = await fetch(`/api/admin/about/sections/${s.section_key}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        heading: s.heading,
        body_markdown: s.body_markdown,
        display_order: s.display_order,
        is_published: s.is_published,
        image_url: s.image_url,
        image_alt: s.image_alt,
      }),
    })
    if (res.ok) {
      setStatus((p) => ({ ...p, [s.section_key]: 'saved' }))
      router.refresh()
      setTimeout(() => setStatus((p) => ({ ...p, [s.section_key]: 'idle' })), 1500)
    } else {
      setStatus((p) => ({ ...p, [s.section_key]: 'error' }))
    }
  }

  return (
    <div className="space-y-6">
      {rows.length === 0 && (
        <p className="font-body text-sm text-charcoal/50">No sections yet. Seed bio_sections in Supabase.</p>
      )}
      {rows.map((s) => (
        <div key={s.section_key} className="rounded-lg border border-charcoal/10 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <code className="font-mono text-xs text-charcoal/40">{s.section_key}</code>
            <div className="flex items-center gap-3">
              <Toast status={status[s.section_key] || 'idle'} />
              <label className="flex items-center gap-2 font-body text-xs text-charcoal/70">
                <input
                  type="checkbox"
                  checked={s.is_published}
                  onChange={(e) => update(s.section_key, { is_published: e.target.checked })}
                />
                Published
              </label>
              <label className="flex items-center gap-2 font-body text-xs text-charcoal/70">
                Order
                <input
                  type="number"
                  value={s.display_order}
                  onChange={(e) => update(s.section_key, { display_order: Number(e.target.value) })}
                  className="w-16 rounded border border-charcoal/15 px-2 py-1 font-body text-sm"
                />
              </label>
            </div>
          </div>
          <input
            type="text"
            value={s.heading}
            onChange={(e) => update(s.section_key, { heading: e.target.value })}
            placeholder="Heading"
            className="w-full mb-3 rounded border border-charcoal/15 px-3 py-2 font-display text-lg font-light text-charcoal"
          />
          <textarea
            value={s.body_markdown}
            onChange={(e) => update(s.section_key, { body_markdown: e.target.value })}
            rows={Math.max(6, Math.min(20, Math.ceil(s.body_markdown.length / 80)))}
            className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm text-charcoal/85 leading-relaxed"
            placeholder="Markdown body — supports **bold**, *italic*, [links](https://...). Blank line for new paragraph."
          />

          <div className="mt-4 rounded-md border border-dashed border-charcoal/15 p-3">
            <div className="flex items-start gap-4">
              {s.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image_url} alt={s.image_alt || s.heading} className="w-32 h-32 object-cover rounded border border-charcoal/10" />
              ) : (
                <div className="w-32 h-32 rounded border border-dashed border-charcoal/20 bg-charcoal/[0.03] flex items-center justify-center font-body text-[10px] uppercase tracking-wider text-charcoal/40">
                  No image
                </div>
              )}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerFor(s.section_key)}
                    className="rounded-md border border-charcoal/20 px-3 py-1.5 font-body text-xs font-medium text-charcoal hover:bg-charcoal hover:text-cream transition-colors"
                  >
                    {s.image_url ? 'Replace image' : 'Choose image'}
                  </button>
                  {s.image_url && (
                    <button
                      type="button"
                      onClick={() => removeImage(s)}
                      className="font-body text-xs uppercase tracking-wider text-coral hover:text-coral/80"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={s.image_alt || ''}
                  onChange={(e) => update(s.section_key, { image_alt: e.target.value || null })}
                  placeholder="Image alt text (for screen readers)"
                  className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={() => save(s)}
              className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors"
            >
              Save section
            </button>
          </div>
        </div>
      ))}

      <MediaPicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        defaultCategory="about"
        initialFilter="about"
        uploadBucket="about-images"
        title="Choose section image"
        onPick={(picked) => {
          if (pickerFor) onPickerChoose(pickerFor, picked)
        }}
      />
    </div>
  )
}

function CalloutsTab({
  rows,
  setRows,
}: {
  rows: Callout[]
  setRows: (updater: (prev: Callout[]) => Callout[]) => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<Record<string, SaveStatus>>({})
  const [pending, startTransition] = useTransition()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const update = (id: string, patch: Partial<Callout>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const save = async (c: Callout) => {
    setStatus((p) => ({ ...p, [c.id]: 'saving' }))
    const res = await fetch(`/api/admin/about/callouts/${c.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: c.kind,
        label: c.label,
        body_markdown: c.body_markdown,
        display_order: c.display_order,
        is_published: c.is_published,
      }),
    })
    if (res.ok) {
      setStatus((p) => ({ ...p, [c.id]: 'saved' }))
      setTimeout(() => setStatus((p) => ({ ...p, [c.id]: 'idle' })), 1500)
      router.refresh()
    } else {
      setStatus((p) => ({ ...p, [c.id]: 'error' }))
    }
  }

  const addNew = () => {
    startTransition(async () => {
      const res = await fetch('/api/admin/about/callouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'motto',
          label: 'New callout',
          body_markdown: 'Edit me',
          display_order: rows.length,
          is_published: false,
        }),
      })
      if (res.ok) router.refresh()
    })
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/admin/about/callouts/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id))
      router.refresh()
    }
    setConfirmId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={addNew}
          className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors disabled:opacity-50"
        >
          + Add callout
        </button>
      </div>
      {rows.map((c) => (
        <div key={c.id} className="rounded-lg border border-charcoal/10 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <code className="font-mono text-xs text-charcoal/40">{c.id.slice(0, 8)}…</code>
            <div className="flex items-center gap-3">
              <Toast status={status[c.id] || 'idle'} />
              <label className="flex items-center gap-2 font-body text-xs text-charcoal/70">
                <input
                  type="checkbox"
                  checked={c.is_published}
                  onChange={(e) => update(c.id, { is_published: e.target.checked })}
                />
                Published
              </label>
              <select
                value={c.kind}
                onChange={(e) => update(c.id, { kind: e.target.value as Callout['kind'] })}
                className="rounded border border-charcoal/15 px-2 py-1 font-body text-xs"
              >
                <option value="motto">motto</option>
                <option value="quote">quote</option>
                <option value="list">list</option>
              </select>
              <label className="flex items-center gap-2 font-body text-xs text-charcoal/70">
                Order
                <input
                  type="number"
                  value={c.display_order}
                  onChange={(e) => update(c.id, { display_order: Number(e.target.value) })}
                  className="w-16 rounded border border-charcoal/15 px-2 py-1 font-body text-sm"
                />
              </label>
            </div>
          </div>
          <input
            type="text"
            value={c.label}
            onChange={(e) => update(c.id, { label: e.target.value })}
            placeholder="Label (e.g., MOTTO, CHALLENGES)"
            className="w-full mb-3 rounded border border-charcoal/15 px-3 py-2 font-hand text-base text-gold uppercase tracking-wider"
          />
          <textarea
            value={c.body_markdown}
            onChange={(e) => update(c.id, { body_markdown: e.target.value })}
            rows={c.kind === 'list' ? 6 : 3}
            className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm text-charcoal/85"
            placeholder={
              c.kind === 'list'
                ? 'One item per line'
                : 'Quote or motto text — no surrounding quotation marks'
            }
          />
          <div className="flex justify-between items-center mt-3">
            <button
              type="button"
              onClick={() => setConfirmId(c.id)}
              className="font-body text-xs uppercase tracking-wider text-coral hover:text-coral/80 transition-colors"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => save(c)}
              className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors"
            >
              Save callout
            </button>
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={confirmId !== null}
        title="Delete callout?"
        message="This callout will be removed permanently."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => confirmId && remove(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  )
}

function CredentialsTab({
  creds,
  setCreds,
}: {
  creds: Credentials
  setCreds: (updater: (prev: Credentials) => Credentials) => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const c = creds

  const update = (patch: Partial<Credentials>) => {
    setCreds((prev) => ({ ...prev, ...patch }))
  }

  const save = async () => {
    setStatus('saving')
    const res = await fetch('/api/admin/about/credentials', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: c.full_name,
        degrees: c.degrees,
        hero_image_url: c.hero_image_url,
        contact_email: c.contact_email,
      }),
    })
    if (res.ok) {
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1500)
      router.refresh()
    } else {
      setStatus('error')
    }
  }

  const updateDegree = (idx: number, patch: Partial<Degree>) => {
    setCreds((prev) => ({
      ...prev,
      degrees: prev.degrees.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    }))
  }

  const addDegree = () => {
    setCreds((prev) => ({
      ...prev,
      degrees: [...prev.degrees, { year: '', degree: '', institution: '', location: '' }],
    }))
  }

  const removeDegree = (idx: number) => {
    setCreds((prev) => ({ ...prev, degrees: prev.degrees.filter((_, i) => i !== idx) }))
  }

  return (
    <div className="rounded-lg border border-charcoal/10 bg-white p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-light text-charcoal">Header credentials</h2>
        <Toast status={status} />
      </div>

      <label className="block">
        <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Full name</span>
        <input
          type="text"
          value={c.full_name}
          onChange={(e) => update({ full_name: e.target.value })}
          className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
        />
      </label>

      <label className="block">
        <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Contact email</span>
        <input
          type="email"
          value={c.contact_email}
          onChange={(e) => update({ contact_email: e.target.value })}
          className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
        />
      </label>

      <label className="block">
        <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Hero image URL</span>
        <input
          type="url"
          value={c.hero_image_url || ''}
          onChange={(e) => update({ hero_image_url: e.target.value || null })}
          placeholder="https://…"
          className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
        />
      </label>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-body text-xs uppercase tracking-wider text-charcoal/60">Degrees</span>
          <button
            type="button"
            onClick={addDegree}
            className="font-body text-xs font-semibold uppercase tracking-wider text-teal hover:text-deep-teal transition-colors"
          >
            + Add
          </button>
        </div>
        <div className="space-y-3">
          {c.degrees.map((d, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input
                value={d.year}
                onChange={(e) => updateDegree(i, { year: e.target.value })}
                placeholder="Year"
                className="col-span-2 rounded border border-charcoal/15 px-2 py-1.5 font-body text-sm"
              />
              <input
                value={d.degree}
                onChange={(e) => updateDegree(i, { degree: e.target.value })}
                placeholder="Degree"
                className="col-span-3 rounded border border-charcoal/15 px-2 py-1.5 font-body text-sm"
              />
              <input
                value={d.institution}
                onChange={(e) => updateDegree(i, { institution: e.target.value })}
                placeholder="Institution"
                className="col-span-3 rounded border border-charcoal/15 px-2 py-1.5 font-body text-sm"
              />
              <input
                value={d.location}
                onChange={(e) => updateDegree(i, { location: e.target.value })}
                placeholder="Location"
                className="col-span-2 rounded border border-charcoal/15 px-2 py-1.5 font-body text-sm"
              />
              <input
                value={d.honors || ''}
                onChange={(e) => updateDegree(i, { honors: e.target.value || undefined })}
                placeholder="Honors"
                className="col-span-1 rounded border border-charcoal/15 px-2 py-1.5 font-body text-sm"
              />
              <button
                type="button"
                onClick={() => removeDegree(i)}
                className="col-span-1 font-body text-xs uppercase tracking-wider text-coral hover:text-coral/80 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors"
        >
          Save credentials
        </button>
      </div>
    </div>
  )
}
