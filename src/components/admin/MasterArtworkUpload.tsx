'use client'

import { useRef, useState } from 'react'
import * as tus from 'tus-js-client'
import { createClient } from '@/lib/supabase/client'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/tiff', 'application/pdf']
const MAX_BYTES = 500 * 1024 * 1024 // 500MB — matches bucket limit
// Above this, the plain client upload caps out — use a tus resumable upload
// (multi-GB reliable). Smaller files keep the simpler direct upload.
const RESUMABLE_THRESHOLD = 25 * 1024 * 1024

// Resumable (tus) upload to Supabase Storage. RLS still applies because we send
// the user's session access token, not the anon key.
function resumableUpload(
  supabaseUrl: string,
  accessToken: string,
  objectName: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000],
      headers: { authorization: `Bearer ${accessToken}`, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: 'print-masters', objectName, contentType: file.type, cacheControl: '3600' },
      chunkSize: 6 * 1024 * 1024, // Supabase requires a fixed 6MB chunk
      onError: reject,
      onProgress: (sent, total) => onProgress(total ? Math.round((sent / total) * 100) : 0),
      onSuccess: () => resolve(),
    })
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0])
      upload.start()
    })
  })
}

export interface UploadedArtwork {
  id: string
  title: string
  storage_path: string
  file_name: string
  file_size_bytes: number
  mime_type: string
  width_px: number | null
  height_px: number | null
}

interface Props {
  onUploaded: (artwork: UploadedArtwork) => void
  onCancel?: () => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function readDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  // Only attempt for JPEG / PNG. TIFF and PDF need server-side tooling.
  if (!file.type.startsWith('image/jpeg') && !file.type.startsWith('image/png')) {
    return { width: null, height: null }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(dims)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: null, height: null })
    }
    img.src = url
  })
}

export default function MasterArtworkUpload({ onUploaded, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'creating'>('idle')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  function pickFile(f: File | null) {
    setError(null)
    if (!f) {
      setFile(null)
      return
    }
    if (!ALLOWED_MIME.includes(f.type)) {
      setError(`Unsupported file type: ${f.type || 'unknown'}. Allowed: JPEG, PNG, TIFF, PDF.`)
      return
    }
    if (f.size > MAX_BYTES) {
      setError(`File is ${formatBytes(f.size)}; the max is ${formatBytes(MAX_BYTES)}.`)
      return
    }
    setFile(f)
    if (!title) {
      const stem = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
      setTitle(stem.charAt(0).toUpperCase() + stem.slice(1))
    }
  }

  async function handleSubmit() {
    if (!file || !title.trim()) {
      setError('A file and a title are required.')
      return
    }
    setError(null)
    setStatus('uploading')
    setProgress(null)

    const supabase = createClient()
    const rand = crypto.randomUUID()
    const path = `library/${rand}/${file.name}`

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (file.size >= RESUMABLE_THRESHOLD && token && supabaseUrl) {
        // Large master → resumable upload (the plain client upload caps out).
        setProgress(0)
        await resumableUpload(supabaseUrl, token, path, file, setProgress)
      } else {
        // Small file (or no session token) → direct upload fallback.
        const { error: upErr } = await supabase.storage
          .from('print-masters')
          .upload(path, file, { contentType: file.type, upsert: false })
        if (upErr) throw upErr
      }

      setProgress(null)
      setStatus('creating')
      const dims = await readDimensions(file)

      const res = await fetch('/api/admin/master-artworks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          storage_path: path,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type,
          width_px: dims.width,
          height_px: dims.height,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        // Clean up the uploaded blob since the row failed.
        await supabase.storage.from('print-masters').remove([path]).catch(() => {})
        throw new Error(json.error || 'Failed to register artwork')
      }

      onUploaded(json.data as UploadedArtwork)
      setFile(null)
      setTitle('')
      setDescription('')
      setStatus('idle')
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setStatus('idle')
      setProgress(null)
    }
  }

  const busy = status !== 'idle'

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) pickFile(f)
        }}
        className={`rounded-md border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? 'border-teal bg-teal/[0.04]' : 'border-charcoal/15 bg-charcoal/[0.02]'
        }`}
      >
        <p className="font-body text-sm text-charcoal/70">
          {file ? (
            <>
              <span className="font-medium text-charcoal">{file.name}</span> · {formatBytes(file.size)}
            </>
          ) : (
            'Drag the master file here, or click to choose'
          )}
        </p>
        <p className="mt-1 font-body text-[11px] text-charcoal/45">
          JPEG · PNG · TIFF · PDF · up to 500 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.tif,.tiff,.pdf,image/jpeg,image/png,image/tiff,application/pdf"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-4 rounded-md bg-charcoal/5 px-4 py-2 font-body text-xs uppercase tracking-wider text-charcoal/70 hover:bg-charcoal/10 disabled:opacity-50"
        >
          {file ? 'Choose different file' : 'Browse files'}
        </button>
      </div>

      <label className="block">
        <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">
          Title
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          placeholder="e.g. Texas Sunset (300dpi)"
          className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm focus:border-teal focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">
          Notes <span className="text-charcoal/40">(optional)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          rows={2}
          className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm focus:border-teal focus:outline-none"
        />
      </label>

      {error && <p className="font-body text-sm text-coral">{error}</p>}

      {status === 'uploading' && (
        <div className="rounded-md bg-teal/5 border border-teal/20 px-3 py-2">
          <p className="font-body text-sm text-deep-teal">
            Uploading {file ? formatBytes(file.size) : ''} to storage…
            {progress !== null && <span className="font-medium"> {progress}%</span>}
          </p>
          {progress !== null && (
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-teal/15">
              <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          <p className="mt-0.5 font-body text-[11px] text-charcoal/55">
            Large files use a resumable upload — keep this tab open.
          </p>
        </div>
      )}
      {status === 'creating' && (
        <p className="font-body text-sm text-deep-teal">Registering artwork…</p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="font-body text-xs uppercase tracking-wider text-charcoal/60 hover:text-charcoal disabled:opacity-40"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !file || !title.trim()}
          className="rounded-md bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors disabled:opacity-50"
        >
          {status === 'uploading'
            ? 'Uploading…'
            : status === 'creating'
              ? 'Saving…'
              : 'Upload artwork'}
        </button>
      </div>
    </div>
  )
}
