'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import MediaPicker from '@/components/admin/MediaPicker'
import ChannelPreview, {
  CHANNELS,
  CHANNEL_MAP,
  type Channel,
} from './ChannelPreview'
import type { SocialStatus } from './StatusBadge'

export interface ComposerAccount {
  id: string
  provider: string
  handle: string
  display_name: string | null
  connected: boolean
}

export interface ComposerInitial {
  channels: Channel[]
  body: string
  hashtags: string[]
  link_url: string
  media: Array<{ url: string; media_id: string | null }>
  scheduled_at: string | null // ISO
  account_id: string | null
}

interface Props {
  postId?: string
  accounts: ComposerAccount[]
  initial?: Partial<ComposerInitial>
  /** The post's current status (edit mode) — used to avoid demoting
   *  published/publishing/failed posts back to scheduled on save. */
  currentStatus?: SocialStatus
}

const MAX_MEDIA = 10

// Convert an ISO string into the value a <input type="datetime-local"> wants
// (local time, no timezone, minute precision).
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function PostComposer({ postId, accounts, initial, currentStatus }: Props) {
  const router = useRouter()
  const isEdit = Boolean(postId)

  const [channels, setChannels] = useState<Channel[]>(initial?.channels ?? [])
  const [body, setBody] = useState(initial?.body ?? '')
  const [hashtagInput, setHashtagInput] = useState((initial?.hashtags ?? []).join(' '))
  const [linkUrl, setLinkUrl] = useState(initial?.link_url ?? '')
  const [media, setMedia] = useState<Array<{ url: string; media_id: string | null }>>(
    initial?.media ?? []
  )
  const [scheduleAt, setScheduleAt] = useState(isoToLocalInput(initial?.scheduled_at))
  const [accountId, setAccountId] = useState<string>(initial?.account_id ?? '')
  const [mode, setMode] = useState<'draft' | 'scheduled'>(
    initial?.scheduled_at ? 'scheduled' : 'draft'
  )

  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hashtags = useMemo(
    () =>
      hashtagInput
        .split(/[\s,]+/)
        .map((h) => h.replace(/^#/, '').trim())
        .filter(Boolean),
    [hashtagInput]
  )

  const mediaUrls = media.map((m) => m.url)

  function toggleChannel(c: Channel) {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  function addMedia(picked: { url: string; id: string }) {
    setMedia((prev) =>
      prev.length >= MAX_MEDIA || prev.some((m) => m.url === picked.url)
        ? prev
        : [...prev, { url: picked.url, media_id: picked.id }]
    )
  }

  function removeMedia(url: string) {
    setMedia((prev) => prev.filter((m) => m.url !== url))
  }

  function moveMedia(index: number, dir: -1 | 1) {
    setMedia((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function save() {
    setError(null)
    if (channels.length === 0) {
      setError('Select at least one channel.')
      return
    }
    if (mode === 'scheduled' && !scheduleAt) {
      setError('Pick a date and time to schedule, or save as a draft.')
      return
    }

    setSaving(true)
    const scheduledIso = mode === 'scheduled' ? localInputToIso(scheduleAt) : null
    const status = mode === 'scheduled' ? 'scheduled' : 'draft'

    // Don't demote a published/publishing/failed post back to scheduled just
    // because it was edited: only send `status` when the user actually changed
    // the scheduling controls.
    const initialMode: 'draft' | 'scheduled' = initial?.scheduled_at ? 'scheduled' : 'draft'
    const schedulingChanged =
      mode !== initialMode || scheduleAt !== isoToLocalInput(initial?.scheduled_at)
    const preserveStatus =
      isEdit &&
      !!currentStatus &&
      ['published', 'publishing', 'failed'].includes(currentStatus) &&
      !schedulingChanged

    try {
      if (isEdit) {
        // Editing always operates on a single channel post.
        const res = await fetch(`/api/admin/social/posts/${postId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: channels[0],
            body,
            hashtags,
            link_url: linkUrl,
            media,
            scheduled_at: scheduledIso,
            ...(preserveStatus ? {} : { status }),
            account_id: accountId || null,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || 'Failed to save post.')
        }
      } else {
        const res = await fetch('/api/admin/social/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channels,
            body,
            hashtags,
            link_url: linkUrl,
            media,
            scheduled_at: scheduledIso,
            status,
            account_id: accountId || null,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || 'Failed to create post.')
        }
      }
      router.push('/admin/social')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setSaving(false)
    }
  }

  const accountsForChannel = (c: Channel) =>
    accounts.filter((a) => a.provider === c)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      {/* ── Editor column ──────────────────────────────────────────── */}
      <div className="space-y-5">
        {error && (
          <div className="rounded-sm border border-coral/30 bg-coral/5 px-4 py-3 font-body text-sm text-coral">
            {error}
          </div>
        )}

        {/* Channels */}
        <div>
          <label className="mb-2 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
            Channels {isEdit && <span className="text-charcoal/40">(single channel in edit mode)</span>}
          </label>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => {
              const active = channels.includes(c.id)
              const disabled = isEdit && active === false && channels.length >= 1
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => (isEdit ? setChannels([c.id]) : toggleChannel(c.id))}
                  className={`rounded-full border px-3 py-1.5 font-body text-xs font-medium transition-colors ${
                    active
                      ? 'border-teal bg-teal text-cream'
                      : 'border-charcoal/15 bg-white text-charcoal/70 hover:bg-charcoal/5'
                  } ${disabled ? 'opacity-40' : ''}`}
                >
                  <span className="mr-1.5 font-semibold">{c.glyph}</span>
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div>
          <label className="mb-2 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
            Caption
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Write your post caption…"
            className="w-full rounded-sm border border-charcoal/15 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
          />
          {channels.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-3">
              {channels.map((c) => {
                const meta = CHANNEL_MAP[c]
                const count = body.length
                const over = meta.charLimit != null && count > meta.charLimit
                return (
                  <span
                    key={c}
                    className={`font-body text-[11px] tabular-nums ${over ? 'font-semibold text-coral' : 'text-charcoal/45'}`}
                  >
                    {meta.label}: {count}
                    {meta.charLimit != null ? `/${meta.charLimit}` : ''}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Hashtags */}
        <div>
          <label className="mb-2 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
            Hashtags
          </label>
          <input
            type="text"
            value={hashtagInput}
            onChange={(e) => setHashtagInput(e.target.value)}
            placeholder="mixedmedia collage margaretedmondson"
            className="w-full rounded-sm border border-charcoal/15 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
          />
          {hashtags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {hashtags.map((h) => (
                <span
                  key={h}
                  className="inline-flex rounded-sm bg-teal/8 px-2 py-0.5 font-body text-xs text-teal"
                >
                  #{h}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Link */}
        <div>
          <label className="mb-2 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
            Link (optional)
          </label>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://artbyme.studio/shop/art/…"
            className="w-full rounded-sm border border-charcoal/15 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
          />
        </div>

        {/* Media */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
              Media ({media.length}/{MAX_MEDIA})
            </label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={media.length >= MAX_MEDIA}
              className="rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-xs font-medium text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50"
            >
              + Add image
            </button>
          </div>
          {media.length === 0 ? (
            <div className="rounded-sm border border-dashed border-charcoal/15 bg-charcoal/[0.02] px-4 py-8 text-center">
              <p className="font-body text-sm text-charcoal/50">No media added.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {media.map((m, i) => (
                <div
                  key={m.url}
                  className="group relative overflow-hidden rounded-sm border border-charcoal/10 bg-white"
                >
                  <div className="aspect-square bg-charcoal/[0.03]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-charcoal/70 px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveMedia(i, -1)}
                        disabled={i === 0}
                        className="text-cream disabled:opacity-30"
                        aria-label="Move left"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() => moveMedia(i, 1)}
                        disabled={i === media.length - 1}
                        className="text-cream disabled:opacity-30"
                        aria-label="Move right"
                      >
                        ›
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMedia(m.url)}
                      className="font-body text-[10px] uppercase tracking-wider text-cream hover:text-coral"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account (optional) */}
        {channels.length > 0 && accounts.length > 0 && (
          <div>
            <label className="mb-2 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
              Post as account (optional)
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
            >
              <option value="">— No specific account —</option>
              {channels.flatMap((c) =>
                accountsForChannel(c).map((a) => (
                  <option key={a.id} value={a.id}>
                    {CHANNEL_MAP[c].label} · @{a.handle}
                    {a.connected ? '' : ' (not connected)'}
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        {/* Schedule */}
        <div className="rounded-sm border border-charcoal/10 bg-white p-4">
          <div className="mb-3 flex gap-2">
            {(['draft', 'scheduled'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-sm px-3 py-1.5 font-body text-xs font-medium transition-colors ${
                  mode === m ? 'bg-teal text-cream' : 'bg-charcoal/5 text-charcoal/70 hover:bg-charcoal/10'
                }`}
              >
                {m === 'draft' ? 'Save as draft' : 'Schedule'}
              </button>
            ))}
          </div>
          {mode === 'scheduled' && (
            <div>
              <label className="mb-1.5 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
                Publish at
              </label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="rounded-sm border border-charcoal/15 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
              />
              <p className="mt-1.5 font-body text-xs text-charcoal/45">
                At the scheduled time you will get an email reminder to post and a link to mark it posted.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-sm bg-teal px-5 py-2.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : mode === 'scheduled' ? 'Schedule post' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/social')}
            className="rounded-sm border border-charcoal/15 bg-white px-5 py-2.5 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* ── Preview column ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
          Preview
        </p>
        {channels.length === 0 ? (
          <div className="rounded-md border border-dashed border-charcoal/15 bg-charcoal/[0.02] px-4 py-10 text-center">
            <p className="font-body text-sm text-charcoal/50">
              Select a channel to preview your post.
            </p>
          </div>
        ) : (
          channels.map((c) => (
            <ChannelPreview
              key={c}
              channel={c}
              body={body}
              mediaUrls={mediaUrls}
              hashtags={hashtags}
              linkUrl={linkUrl || null}
              handle={
                accounts.find((a) => a.id === accountId && a.provider === c)?.handle
                  ? `@${accounts.find((a) => a.id === accountId && a.provider === c)!.handle}`
                  : undefined
              }
            />
          ))
        )}
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(picked) => {
          addMedia(picked)
          setPickerOpen(false)
        }}
        defaultCategory="library"
        uploadBucket="library"
        title="Add post media"
      />
    </div>
  )
}
