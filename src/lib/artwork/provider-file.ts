import type { SupabaseClient } from '@supabase/supabase-js'
import { providerImageProblem } from '../../../scripts/lib/provider-image.mjs'

/** Verify the exact frozen object, not the original upload or current product crop. */
export async function assertProviderPrintFile(client: SupabaseClient, path: string) {
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('://')) {
    throw new Error('The print file reference is invalid.')
  }
  const { data, error } = await client.storage.from('print-masters').info(path)
  if (error || !data) throw new Error('The print file could not be verified. Please try again before accepting or submitting this order.')
  const problem = providerImageProblem({ bytes: Number(data.size), mimeType: data.contentType ?? '', path })
  if (problem) throw new Error(problem)
}
