'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type SharedEntity = 'testimonial' | 'work_request' | 'note' | 'general'

export interface SharedFile {
  id: string
  uploaded_by: string
  entity_type: SharedEntity
  entity_id: string | null
  file_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  tag: string
  notes: string | null
  created_at: string
}

interface Props {
  open: boolean
  onClose: () => void
  entityType: SharedEntity
  entityId?: string | null
  defaultTag?: string
  title?: string
  description?: string
  onChanged?: () => void
}

function fmtBytes(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export default function SharedFilesModal({
  open,
  onClose,
  entityType,
  entityId,
  defaultTag,
  title,
  description,
  onChanged,
}: Props) {
  const [files, setFiles] = useState<SharedFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [tag, setTag] = useState<string>(defaultTag || entityType)
  const [notes, setNotes] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    if (!open) return
    setLoading(true)
    setErr(null)
    const qs = new URLSearchParams({ entity_type: entityType })
    if (entityId) qs.set('entity_id', entityId)
    const res = await fetch(`/api/admin/shared-files?${qs.toString()}`)
    const json = await res.json()
    if (!res.ok) setErr(json.error || 'Failed to load')
    else setFiles(json.data || [])
    setLoading(false)
  }, [open, entityType, entityId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (open) setTag(defaultTag || entityType)
  }, [open, defaultTag, entityType])

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setErr(null)
    setUploading(true)
    try {
      for (const file of Array.from(fileList)) {
        const form = new FormData()
        form.append('file', file)
        form.append('entity_type', entityType)
        if (entityId) form.append('entity_id', entityId)
        form.append('tag', tag || 'general')
        if (notes.trim()) form.append('notes', notes.trim())
        const res = await fetch('/api/admin/shared-files', {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || `Upload failed (${res.status})`)
        }
      }
      setNotes('')
      if (fileInput.current) fileInput.current.value = ''
      await refresh()
      onChanged?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(id: string) {
    const res = await fetch(`/api/admin/shared-files/signed-url?id=${id}`)
    const json = await res.json()
    if (!res.ok || !json.url) {
      setErr(json.error || 'Unable to generate download link')
      return
    }
    window.open(json.url, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this file? This cannot be undone.')) return
    const res = await fetch(`/api/admin/shared-files?id=${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error || 'Delete failed')
      return
    }
    await refresh()
    onChanged?.()
  }

  if (!open) return null

  const headline = title || (
    entityType === 'testimonial'
      ? 'Testimonial documents'
      : entityType === 'work_request'
        ? 'Work-request files'
        : entityType === 'note'
          ? 'Note attachments'
          : 'Shared files'
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-charcoal/60 p-4 backdrop-blur-sm">
      <div className="my-10 w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-charcoal/8 px-6 py-4">
          <div>
            <h2 className="font-display text-lg text-charcoal">{headline}</h2>
            {description && (
              <p className="mt-1 font-body text-xs text-charcoal/55">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-sm p-1 text-charcoal/40 hover:bg-charcoal/5 hover:text-charcoal"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {err && (
            <div className="rounded-sm border border-coral/30 bg-coral/10 px-3 py-2 font-body text-xs text-coral">
              {err}
            </div>
          )}

          <div className="rounded-sm border border-dashed border-charcoal/15 bg-charcoal/[0.02] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="font-body text-xs text-charcoal/55">
                Tag
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="e.g. testimonial, invoice, reference"
                  className="mt-1 w-full rounded-sm border border-charcoal/12 bg-white px-2 py-1.5 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
                />
              </label>
              <label className="font-body text-xs text-charcoal/55">
                Notes (optional)
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything to know about these files"
                  className="mt-1 w-full rounded-sm border border-charcoal/12 bg-white px-2 py-1.5 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                ref={fileInput}
                type="file"
                multiple
                onChange={(e) => handleUpload(e.target.files)}
                disabled={uploading}
                className="block w-full font-body text-xs text-charcoal/70 file:mr-3 file:rounded-sm file:border-0 file:bg-teal file:px-3 file:py-1.5 file:font-body file:text-xs file:font-medium file:text-cream hover:file:bg-deep-teal"
              />
              {uploading && (
                <span className="font-body text-xs text-charcoal/50">Uploading…</span>
              )}
            </div>
            <p className="mt-2 font-body text-[11px] text-charcoal/40">
              Images, PDFs, Word docs, audio, anything. Files are private and only
              visible to admins.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-body text-xs font-medium uppercase tracking-wider text-charcoal/50">
                Shared here ({files.length})
              </h3>
              <button
                onClick={refresh}
                className="font-body text-xs text-teal hover:underline"
              >
                Refresh
              </button>
            </div>
            {loading ? (
              <div className="py-6 text-center font-body text-xs text-charcoal/40">
                Loading…
              </div>
            ) : files.length === 0 ? (
              <div className="rounded-sm border border-dashed border-charcoal/10 px-3 py-8 text-center font-body text-xs text-charcoal/40">
                No files yet. Upload above.
              </div>
            ) : (
              <ul className="divide-y divide-charcoal/6 rounded-sm border border-charcoal/8">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-body text-sm text-charcoal">
                        {f.file_name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-body text-[11px] text-charcoal/45">
                        <span className="rounded-full bg-teal/10 px-1.5 py-0.5 text-teal">
                          {f.tag}
                        </span>
                        <span>{fmtBytes(f.size_bytes)}</span>
                        <span>
                          {new Date(f.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        {f.notes && <span className="italic">— {f.notes}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(f.id)}
                      className="rounded-sm bg-charcoal px-2.5 py-1 font-body text-xs text-cream transition-colors hover:bg-deep-teal"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="rounded-sm px-2 py-1 font-body text-xs text-coral hover:bg-coral/10"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-charcoal/8 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-sm bg-charcoal/5 px-4 py-2 font-body text-xs font-medium text-charcoal hover:bg-charcoal/10"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
