import { createServiceClient } from '@/lib/supabase/server'
import { sendServerEvent } from '@/lib/meta/capi'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const { data: unsent } = await supabase
    .from('meta_events')
    .select('*')
    .eq('sent_to_meta', false)
    .limit(50)

  let synced = 0

  for (const event of unsent || []) {
    try {
      const response = await sendServerEvent({
        event_name: event.event_name,
        event_id: event.event_id,
        event_time: Math.floor(new Date(event.created_at).getTime() / 1000),
        user_data: (event.user_data as Record<string, string>) || {},
        custom_data: event.custom_data as Record<string, unknown> || undefined,
        event_source_url: event.source_url || process.env.NEXT_PUBLIC_SITE_URL || '',
      })

      await supabase
        .from('meta_events')
        .update({ sent_to_meta: true, meta_response: response })
        .eq('id', event.id)

      synced++
    } catch (err) {
      console.error(`Failed to sync meta event ${event.id}:`, err)
    }
  }

  return Response.json({ success: true, synced, total: unsent?.length || 0 })
}
