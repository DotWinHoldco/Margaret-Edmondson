// Social publish cron (Phase 1). Runs every 5 minutes via vercel.json.
//
// Phase 1 behaviour (what ships now):
//   - Find scheduled posts whose scheduled_at has passed.
//   - Move them to status='publishing' (progress_pct=50).
//   - Email the studio owner a "time to post" reminder with a deep link to
//     /admin/social/posts/[id] where they mark the post as published.
//
// Phase 2 (feature-flagged OFF): when SOCIAL_AUTOPUBLISH=true a future build
// will call the Meta Graph API here instead of (or in addition to) the email.
// The flag is read but the auto-publish branch is intentionally a no-op stub
// so the wiring is in place without shipping the integration.

import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { brandedShell, ctaButton } from '@/lib/email/shell'

export const runtime = 'nodejs'
export const maxDuration = 60

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'
const AUTOPUBLISH = process.env.SOCIAL_AUTOPUBLISH === 'true'

const CHANNEL_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  linkedin: 'LinkedIn',
}

interface DuePost {
  id: string
  channel: string
  body: string | null
  media_urls: string[] | null
  hashtags: string[] | null
  link_url: string | null
  scheduled_at: string | null
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function resolveOwnerEmail(
  supabase: Awaited<ReturnType<typeof createServiceClient>>
): Promise<string> {
  // Prefer an explicit override, then the first admin/artist profile, then the
  // studio's from-address as a last resort.
  if (process.env.SOCIAL_REMINDER_EMAIL) return process.env.SOCIAL_REMINDER_EMAIL

  const { data } = await supabase
    .from('profiles')
    .select('email, role')
    .in('role', ['admin', 'artist'])
    .not('email', 'is', null)
    .order('role', { ascending: true })
    .limit(1)

  const owner = (data as Array<{ email: string | null }> | null)?.[0]?.email
  if (owner) return owner

  const from = process.env.EMAIL_FROM || 'ArtByME <hello@artbyme.studio>'
  const match = from.match(/<([^>]+)>/)
  return match ? match[1] : 'hello@artbyme.studio'
}

function buildReminderHtml(post: DuePost): string {
  const channelLabel = CHANNEL_LABEL[post.channel] || post.channel
  const snippet = post.body ? escapeHtml(post.body.slice(0, 280)) : '(no caption)'
  const hashtagLine =
    post.hashtags && post.hashtags.length
      ? `<p style="text-align:center;color:#3A7D7B;font-size:13px;margin-top:8px;">${escapeHtml(post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '))}</p>`
      : ''
  const linkLine = post.link_url
    ? `<p style="text-align:center;color:#666;font-size:13px;margin-top:8px;">Link: <a href="${escapeHtml(post.link_url)}" style="color:#3A7D7B;">${escapeHtml(post.link_url)}</a></p>`
    : ''
  const mediaLine =
    post.media_urls && post.media_urls.length
      ? `<div style="text-align:center;margin:16px 0;">
           <img src="${escapeHtml(post.media_urls[0])}" alt="" style="max-width:100%;border-radius:8px;border:1px solid #e5e0d8;" />
           ${post.media_urls.length > 1 ? `<p style="color:#999;font-size:11px;margin-top:6px;">+ ${post.media_urls.length - 1} more image${post.media_urls.length - 1 === 1 ? '' : 's'}</p>` : ''}
         </div>`
      : ''

  return brandedShell(
    `
    <h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Time to post on ${escapeHtml(channelLabel)}</h2>
    <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;margin-bottom:16px;">
      Your scheduled ${escapeHtml(channelLabel)} post is due. Copy the caption below, post it from your device, then mark it as posted.
    </p>
    <div style="background:white;border:1px solid #e5e0d8;border-radius:8px;padding:20px;margin-bottom:8px;">
      <p style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 12px;">Caption</p>
      <p style="white-space:pre-wrap;font-size:14px;line-height:1.6;color:#2C2C2C;margin:0;">${snippet}</p>
      ${hashtagLine}
      ${linkLine}
      ${mediaLine}
    </div>
    ${ctaButton(`${SITE_URL}/admin/social/posts/${post.id}`, 'Mark as posted')}
  `,
    {
      hideUnsubscribe: true,
      preheader: `Time to post on ${channelLabel}`,
    }
  )
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const nowIso = new Date().toISOString()

  const { data: due, error } = await supabase
    .from('social_posts')
    .select('id, channel, body, media_urls, hashtags, link_url, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)

  if (error) {
    console.error('social-publish cron failed:', error)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  const duePosts = (due || []) as DuePost[]
  if (duePosts.length === 0) {
    return Response.json({ success: true, processed: 0, sent: 0, autopublish: AUTOPUBLISH })
  }

  const ownerEmail = await resolveOwnerEmail(supabase)
  let sent = 0
  let processed = 0

  for (const post of duePosts) {
    // Move to publishing so it is not picked up again on the next tick.
    const { error: updErr } = await supabase
      .from('social_posts')
      .update({ status: 'publishing', progress_pct: 50, updated_at: new Date().toISOString() })
      .eq('id', post.id)
      .eq('status', 'scheduled') // optimistic guard against double-processing

    if (updErr) {
      console.error('social-publish: failed to mark publishing', post.id, updErr)
      continue
    }
    processed++

    if (AUTOPUBLISH) {
      // Phase 2 stub: real Meta Graph publish lands here behind the flag.
      // Intentionally not implemented in Phase 1 — fall through to the email
      // reminder so the post is never silently dropped.
    }

    const result = await sendEmail({
      to: ownerEmail,
      subject: `Time to post on ${CHANNEL_LABEL[post.channel] || post.channel}`,
      html: buildReminderHtml(post),
      replyTo: 'hello@artbyme.studio',
    })
    if (result !== null || !process.env.RESEND_API_KEY) sent++
  }

  return Response.json({ success: true, processed, sent, autopublish: AUTOPUBLISH })
}
