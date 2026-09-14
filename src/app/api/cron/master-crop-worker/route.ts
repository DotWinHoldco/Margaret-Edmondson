import { requireCron } from '@/lib/auth/require-cron'
import { createServiceClient } from '@/lib/supabase/server'
import { processMasterCrop, recoverInterruptedCrops } from '@/lib/artwork/crop-worker'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Recover interrupted crops and process one queued master, restricted to the cron secret. */
export async function GET(request: Request) {
  const auth = requireCron(request)
  if (!auth.ok) return auth.response
  const supabase = await createServiceClient()
  try {
    const recovered = await recoverInterruptedCrops(supabase)
    const { data, error } = await supabase.from('master_artworks')
      .select('id, print_requested_at').eq('print_status', 'pending')
      .not('print_requested_at', 'is', null).order('print_requested_at', { ascending: true }).limit(1)
    if (error) throw new Error('Could not load pending crop jobs')
    const job = data?.[0]
    const result = job ? await processMasterCrop(supabase, job.id, job.print_requested_at) : 'idle'
    return Response.json({ recovered, result })
  } catch (error) {
    console.error('Master crop worker:', error instanceof Error ? error.message : 'Unknown error')
    return Response.json({ error: 'Crop worker could not finish. The job remains available for recovery.' }, { status: 500 })
  }
}
