import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import PostComposer, {
  type ComposerAccount,
} from '@/components/admin/social/PostComposer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'New Social Post',
}

export default async function NewSocialPostPage(props: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await props.searchParams
  const supabase = await createClient()

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, provider, handle, display_name, connected')
    .order('created_at', { ascending: true })

  // Default the schedule to 9:00 AM local on a clicked calendar day.
  let scheduledAt: string | null = null
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number)
    const dt = new Date(y, m - 1, d, 9, 0, 0)
    if (!Number.isNaN(dt.getTime())) scheduledAt = dt.toISOString()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/social"
          className="font-body text-xs uppercase tracking-wider text-charcoal/50 transition-colors hover:text-teal"
        >
          ← Back to calendar
        </Link>
        <h1 className="mt-2 font-display text-3xl font-light text-charcoal">New Social Post</h1>
      </div>

      <PostComposer
        accounts={(accounts as ComposerAccount[] | null) ?? []}
        initial={scheduledAt ? { scheduled_at: scheduledAt } : undefined}
      />
    </div>
  )
}
