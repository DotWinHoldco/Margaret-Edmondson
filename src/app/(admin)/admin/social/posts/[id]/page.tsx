import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PostComposer, {
  type ComposerAccount,
} from '@/components/admin/social/PostComposer'
import StatusBadge, { type SocialStatus } from '@/components/admin/social/StatusBadge'
import { channelLabel, type Channel } from '@/components/admin/social/ChannelPreview'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Edit Social Post',
}

interface PostRow {
  id: string
  channel: string
  body: string | null
  media_urls: string[] | null
  link_url: string | null
  hashtags: string[] | null
  status: SocialStatus
  scheduled_at: string | null
  published_at: string | null
  progress_pct: number | null
  error_message: string | null
  account_id: string | null
}

interface MediaRow {
  id: string
  media_id: string | null
  url: string
  sort_order: number
}

export default async function EditSocialPostPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: post } = await supabase
    .from('social_posts')
    .select(
      'id, channel, body, media_urls, link_url, hashtags, status, scheduled_at, published_at, progress_pct, error_message, account_id'
    )
    .eq('id', id)
    .maybeSingle()

  if (!post) notFound()
  const typedPost = post as PostRow

  const { data: media } = await supabase
    .from('social_post_media')
    .select('id, media_id, url, sort_order')
    .eq('post_id', id)
    .order('sort_order', { ascending: true })

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, provider, handle, display_name, connected')
    .order('created_at', { ascending: true })

  // Prefer the ordered join table; fall back to media_urls if the join is empty.
  const mediaRows = (media as MediaRow[] | null) ?? []
  const composerMedia =
    mediaRows.length > 0
      ? mediaRows.map((m) => ({ url: m.url, media_id: m.media_id }))
      : (typedPost.media_urls ?? []).map((url) => ({ url, media_id: null }))

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/social"
          className="font-body text-xs uppercase tracking-wider text-charcoal/50 transition-colors hover:text-teal"
        >
          ← Back to calendar
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-light text-charcoal">Edit Post</h1>
          <StatusBadge status={typedPost.status} />
          <span className="font-body text-sm text-charcoal/55">{channelLabel(typedPost.channel)}</span>
        </div>
        {typedPost.error_message && (
          <p className="mt-2 font-body text-sm text-coral">{typedPost.error_message}</p>
        )}
        {typedPost.status === 'publishing' && (
          <p className="mt-2 font-body text-sm text-[#8a6d1f]">
            This post is awaiting publishing. After you post it from your device, open it and mark it
            published from the list view.
          </p>
        )}
      </div>

      <PostComposer
        postId={typedPost.id}
        currentStatus={typedPost.status}
        accounts={(accounts as ComposerAccount[] | null) ?? []}
        initial={{
          channels: [typedPost.channel as Channel],
          body: typedPost.body ?? '',
          hashtags: typedPost.hashtags ?? [],
          link_url: typedPost.link_url ?? '',
          media: composerMedia,
          scheduled_at: typedPost.scheduled_at,
          account_id: typedPost.account_id,
        }}
      />
    </div>
  )
}
