// Flips due scheduled blog posts to published (3.4). Runs every 5 minutes.
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('blog_posts')
    .update({ status: 'published', published_at: nowIso })
    .eq('status', 'scheduled')
    .lte('publish_at', nowIso)
    .select('id, slug')

  if (error) {
    console.error('publish-scheduled failed:', error)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true, published: data?.length ?? 0 })
}
