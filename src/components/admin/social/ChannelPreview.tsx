'use client'

// ─── Channel metadata (shared across the social calendar UI) ──────────
export type Channel = 'instagram' | 'facebook' | 'twitter' | 'tiktok' | 'pinterest' | 'linkedin'

export interface ChannelMeta {
  id: Channel
  label: string
  /** Soft character recommendation; null = no practical limit. */
  charLimit: number | null
  /** Max images the platform supports per post. */
  maxImages: number
  /** Tailwind text/border accent for chips and previews. */
  accent: string
  /** Single-letter avatar glyph. */
  glyph: string
}

export const CHANNELS: ChannelMeta[] = [
  { id: 'instagram', label: 'Instagram', charLimit: 2200, maxImages: 10, accent: 'text-[#C13584]', glyph: 'IG' },
  { id: 'facebook', label: 'Facebook', charLimit: 63206, maxImages: 10, accent: 'text-[#1877F2]', glyph: 'FB' },
  { id: 'twitter', label: 'X / Twitter', charLimit: 280, maxImages: 4, accent: 'text-charcoal', glyph: 'X' },
  { id: 'tiktok', label: 'TikTok', charLimit: 2200, maxImages: 1, accent: 'text-charcoal', glyph: 'TT' },
  { id: 'pinterest', label: 'Pinterest', charLimit: 500, maxImages: 1, accent: 'text-[#E60023]', glyph: 'PI' },
  { id: 'linkedin', label: 'LinkedIn', charLimit: 3000, maxImages: 9, accent: 'text-[#0A66C2]', glyph: 'LI' },
]

export const CHANNEL_MAP: Record<Channel, ChannelMeta> = CHANNELS.reduce(
  (acc, c) => {
    acc[c.id] = c
    return acc
  },
  {} as Record<Channel, ChannelMeta>
)

export function channelLabel(id: string): string {
  return CHANNEL_MAP[id as Channel]?.label ?? id
}

export function channelGlyph(id: string): string {
  return CHANNEL_MAP[id as Channel]?.glyph ?? id.slice(0, 2).toUpperCase()
}

// ─── Preview component ────────────────────────────────────────────────
interface Props {
  channel: Channel
  body: string
  mediaUrls: string[]
  hashtags?: string[]
  handle?: string
  linkUrl?: string | null
}

export default function ChannelPreview({
  channel,
  body,
  mediaUrls,
  hashtags = [],
  handle,
  linkUrl,
}: Props) {
  const meta = CHANNEL_MAP[channel]
  const fullText = [body, hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')]
    .filter(Boolean)
    .join('\n\n')
  const charCount = fullText.length
  const over = meta.charLimit != null && charCount > meta.charLimit
  const displayHandle = handle || `@${channel}_handle`

  // Twitter-style truncation indicator.
  const tweetRemaining = meta.charLimit != null ? meta.charLimit - charCount : null

  return (
    <div className="overflow-hidden rounded-md border border-charcoal/12 bg-white">
      <div className="flex items-center justify-between border-b border-charcoal/8 bg-charcoal/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`font-display text-xs font-semibold ${meta.accent}`}>{meta.glyph}</span>
          <span className="font-body text-xs font-medium text-charcoal/80">{meta.label}</span>
        </div>
        <span
          className={`font-body text-[11px] tabular-nums ${over ? 'font-semibold text-coral' : 'text-charcoal/45'}`}
        >
          {tweetRemaining != null ? (over ? `${tweetRemaining}` : `${charCount}/${meta.charLimit}`) : `${charCount}`}
        </span>
      </div>

      <div className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal/10 font-display text-[10px] font-semibold text-teal">
            ME
          </div>
          <div className="leading-tight">
            <p className="font-body text-xs font-semibold text-charcoal">Margaret Edmondson</p>
            <p className="font-body text-[10px] text-charcoal/45">{displayHandle}</p>
          </div>
        </div>

        {fullText ? (
          <p className="whitespace-pre-wrap font-body text-[13px] leading-relaxed text-charcoal/85">
            {fullText}
          </p>
        ) : (
          <p className="font-body text-[13px] italic text-charcoal/35">No caption yet.</p>
        )}

        {linkUrl && (
          <p className="mt-1.5 truncate font-body text-[11px] text-teal">{linkUrl}</p>
        )}

        {mediaUrls.length > 0 && (
          <div
            className={`mt-3 grid gap-1 overflow-hidden rounded-md ${
              mediaUrls.length === 1
                ? 'grid-cols-1'
                : mediaUrls.length === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-2'
            }`}
          >
            {mediaUrls.slice(0, meta.maxImages).map((url, i) => (
              <div
                key={`${url}-${i}`}
                className={`relative bg-charcoal/[0.04] ${
                  mediaUrls.length === 1 ? 'aspect-[4/5]' : 'aspect-square'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {mediaUrls.length > meta.maxImages && (
          <p className="mt-1.5 font-body text-[10px] text-coral">
            {meta.label} allows {meta.maxImages} image{meta.maxImages === 1 ? '' : 's'} per post; extras will be dropped.
          </p>
        )}

        {over && (
          <p className="mt-1.5 font-body text-[10px] text-coral">
            Over the {meta.charLimit}-character limit by {charCount - (meta.charLimit ?? 0)}.
          </p>
        )}
      </div>
    </div>
  )
}
