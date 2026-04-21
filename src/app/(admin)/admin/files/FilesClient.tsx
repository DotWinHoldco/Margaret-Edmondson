'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import SharedFilesModal, {
  type SharedFile,
  type SharedEntity,
  type SharedFileTag,
} from '@/components/admin/SharedFilesModal'

const ENTITY_LABELS: Record<SharedEntity, string> = {
  testimonial: 'Testimonial',
  work_request: 'Work Request',
  note: 'Note',
  general: 'General',
}

function fmtBytes(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

interface EditDraft {
  tag: string
  file_name: string
  notes: string
}

export default function FilesClient() {
  const [files, setFiles] = useState<SharedFile[]>([])
  const [tags, setTags] = useState<SharedFileTag[]>([])
  const [loading, setLoading] = useState(true)
  const [entity, setEntity] = useState<'all' | SharedEntity>('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>({ tag: '', file_name: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (entity !== 'all') qs.set('entity_type', entity)
    if (tagFilter !== 'all') qs.set('tag', tagFilter)
    const [filesRes, tagsRes] = await Promise.all([
      fetch(`/api/admin/shared-files?${qs.toString()}`),
      fetch('/api/admin/shared-file-tags'),
    ])
    const filesJson = await filesRes.json()
    const tagsJson = await tagsRes.json()
    setFiles((filesJson.data as SharedFile[]) || [])
    setTags((tagsJson.data as SharedFileTag[]) || [])
    setLoading(false)
  }, [entity, tagFilter])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (!search.trim()) return files
    const q = search.toLowerCase()
    return files.filter(
      (f) =>
        f.file_name.toLowerCase().includes(q) ||
        f.tag.toLowerCase().includes(q) ||
        (f.notes || '').toLowerCase().includes(q),
    )
  }, [files, search])

  function labelForTag(slug: string) {
    return tags.find((t) => t.slug === slug)?.label || slug
  }

  async function download(id: string) {
    const res = await fetch(`/api/admin/shared-files/signed-url?id=${id}`)
    const json = await res.json()
    if (json.url) window.open(json.url, '_blank', 'noopener,noreferrer')
  }

  async function remove(id: string) {
    if (!confirm('Delete this file? This cannot be undone.')) return
    await fetch(`/api/admin/shared-files?id=${id}`, { method: 'DELETE' })
    load()
  }

  function startEdit(f: SharedFile) {
    setEditingId(f.id)
    setDraft({
      tag: f.tag,
      file_name: f.file_name,
      notes: f.notes || '',
    })
    setErr(null)
  }

  async function saveEdit() {
    if (!editingId) return
    setSaving(true)
    setErr(null)
    const res = await fetch('/api/admin/shared-files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        tag: draft.tag,
        file_name: draft.file_name,
        notes: draft.notes,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      setErr(json.error || 'Save failed')
      return
    }
    setEditingId(null)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-charcoal">Shared Files</h1>
          <p className="mt-1 font-body text-sm text-charcoal/55">
            Every file shared between Margaret and the team. Tags route files to the
            right area of the site — testimonial docs appear under testimonials,
            social posts in the social area, etc.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="shrink-0 rounded-sm bg-teal px-4 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal"
        >
          + Upload files
        </button>
      </div>

      {err && (
        <div className="rounded-sm border border-coral/30 bg-coral/10 px-3 py-2 font-body text-xs text-coral">
          {err}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value as typeof entity)}
          className="rounded-sm border border-charcoal/12 bg-white px-2 py-1.5 font-body text-xs text-charcoal"
        >
          <option value="all">All scopes</option>
          <option value="testimonial">Testimonials</option>
          <option value="work_request">Work requests</option>
          <option value="note">Notes</option>
          <option value="general">General</option>
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="rounded-sm border border-charcoal/12 bg-white px-2 py-1.5 font-body text-xs text-charcoal"
        >
          <option value="all">All tags</option>
          {tags.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search file name, tag, notes…"
          className="ml-auto w-full max-w-xs rounded-sm border border-charcoal/12 bg-white px-3 py-1.5 font-body text-sm focus:border-teal focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="py-12 text-center font-body text-sm text-charcoal/40">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-sm border border-dashed border-charcoal/15 bg-white px-4 py-16 text-center font-body text-sm text-charcoal/40">
          No files match.
        </div>
      ) : (
        <div className="overflow-hidden rounded-sm border border-charcoal/8 bg-white">
          <table className="w-full">
            <thead className="bg-charcoal/[0.02] font-body text-[11px] uppercase tracking-wider text-charcoal/45">
              <tr>
                <th className="px-3 py-2 text-left">File</th>
                <th className="px-3 py-2 text-left">Scope</th>
                <th className="px-3 py-2 text-left">Tag</th>
                <th className="px-3 py-2 text-left">Size</th>
                <th className="px-3 py-2 text-left">Uploaded</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/6">
              {filtered.map((f) => {
                const editing = editingId === f.id
                return (
                  <tr key={f.id} className="font-body text-sm align-top">
                    <td className="px-3 py-2.5">
                      {editing ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={draft.file_name}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, file_name: e.target.value }))
                            }
                            className="w-full rounded-sm border border-charcoal/15 bg-white px-2 py-1 text-sm text-charcoal focus:border-teal focus:outline-none"
                          />
                          <input
                            type="text"
                            value={draft.notes}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, notes: e.target.value }))
                            }
                            placeholder="Notes (optional)"
                            className="w-full rounded-sm border border-charcoal/15 bg-white px-2 py-1 text-xs text-charcoal focus:border-teal focus:outline-none"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="truncate text-charcoal">
                            {f.file_name}
                          </div>
                          {f.notes && (
                            <div className="mt-0.5 text-xs italic text-charcoal/45">
                              {f.notes}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-charcoal/70">
                      {ENTITY_LABELS[f.entity_type as SharedEntity] || f.entity_type}
                    </td>
                    <td className="px-3 py-2.5">
                      {editing ? (
                        <select
                          value={draft.tag}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, tag: e.target.value }))
                          }
                          className="rounded-sm border border-charcoal/15 bg-white px-1.5 py-1 text-xs text-charcoal focus:border-teal focus:outline-none"
                        >
                          {!tags.some((t) => t.slug === draft.tag) && (
                            <option value={draft.tag}>{draft.tag}</option>
                          )}
                          {tags.map((t) => (
                            <option key={t.slug} value={t.slug}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs text-teal">
                          {labelForTag(f.tag)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-charcoal/60">
                      {fmtBytes(f.size_bytes)}
                    </td>
                    <td className="px-3 py-2.5 text-charcoal/60">
                      {new Date(f.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {editing ? (
                        <>
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="mr-1 rounded-sm bg-teal px-2.5 py-1 text-xs text-cream hover:bg-deep-teal disabled:opacity-60"
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-sm px-2 py-1 text-xs text-charcoal/60 hover:bg-charcoal/5"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => download(f.id)}
                            className="mr-1 rounded-sm bg-charcoal px-2.5 py-1 text-xs text-cream hover:bg-deep-teal"
                          >
                            Download
                          </button>
                          <button
                            onClick={() => startEdit(f)}
                            className="mr-1 rounded-sm border border-charcoal/15 bg-white px-2 py-1 text-xs text-charcoal hover:bg-charcoal/5"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => remove(f.id)}
                            className="rounded-sm px-2 py-1 text-xs text-coral hover:bg-coral/10"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <SharedFilesModal
        open={showUpload}
        onClose={() => {
          setShowUpload(false)
          load()
        }}
        entityType="general"
        defaultTag="general"
        title="Upload files"
        description="Pick a tag so the file shows up in the right area of the admin (social media, testimonials, work requests, etc.). Use + Other to create a new tag."
        onChanged={load}
      />
    </div>
  )
}
