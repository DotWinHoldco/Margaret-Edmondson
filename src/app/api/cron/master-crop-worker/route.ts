import { requireCron } from '@/lib/auth/require-cron'
import { createServiceClient } from '@/lib/supabase/server'
import { processMasterCrop, recoverInterruptedCrops } from '@/lib/artwork/crop-worker'
import { loadCatalog } from '@/lib/catalog/load'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Recover interrupted crops and drain prepared jobs, restricted to the cron secret. */
export async function GET(request: Request) {
  const auth = requireCron(request)
  if (!auth.ok) return auth.response
  const supabase = await createServiceClient()
  try {
    const started = Date.now()
    const recovered = await recoverInterruptedCrops(supabase)
    const { data, error } = await supabase.from('master_artworks')
      .select('id, print_requested_at, print_updated_at, print_storage_path').eq('print_status', 'pending')
      .not('print_requested_at', 'is', null).order('print_requested_at', { ascending: true }).limit(25)
    if (error) throw new Error('Could not load pending crop jobs')
    // All queued jobs use one consistent catalog snapshot, avoiding a full
    // provider-option tree read for every master in the batch.
    const catalog = (data?.length ?? 0) > 1 ? await loadCatalog(supabase, { includeDisabled: true }) : undefined
    const processed: Array<{ id: string; result: string }> = []
    for (const job of data ?? []) {
      const prepared = job.print_storage_path && job.print_updated_at
        && Date.parse(job.print_updated_at) >= Date.parse(job.print_requested_at)
      // A new render may consume almost the full execution window. Only batch
      // already prepared files; leave normal renders to a fresh invocation.
      if (processed.length > 0 && (!prepared || Date.now() - started >= 210_000)) break
      const result = await processMasterCrop(supabase, job.id, job.print_requested_at, undefined, catalog)
      processed.push({ id: job.id, result })
      if (result === 'queued' || !prepared) break
    }
    return Response.json({ recovered, result: processed.at(-1)?.result ?? 'idle', processed })
  } catch (error) {
    console.error('Master crop worker:', error instanceof Error ? error.message : 'Unknown error')
    return Response.json({ error: 'Crop worker could not finish. The job remains available for recovery.' }, { status: 500 })
  }
}
