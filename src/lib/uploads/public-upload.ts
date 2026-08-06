// Authored by DotWin
//
// Browser helper for the two anonymous upload flows (commission reference
// photos, class pet photos).
//
// These forms used to call supabase.storage.upload() directly with the anon
// key, which only worked because the buckets carried a public INSERT policy.
// That policy is gone (migration 2026080606_storage_upload_lockdown.sql); the
// flow now asks the server for signed upload tickets, and the server decides
// the storage path and the ceilings. The bytes still go straight from the
// browser to Supabase Storage, so large reference scans never pass through a
// serverless request body.

import { createBrowserClient } from '@supabase/ssr'
import { apiSend } from '@/lib/api/client'
import { antiBotHeaders } from '@/lib/api/anti-bot-client'

/** Buckets the public upload endpoint will mint tickets for. */
export type PublicUploadBucket = 'commission-references' | 'class-pet-photos'

interface UploadTicket {
  path: string
  token: string
  signedUrl: string
  contentType: string
}

interface TicketResponse {
  folder: string
  uploads: UploadTicket[]
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null

function storageClient() {
  browserClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return browserClient
}

/**
 * Upload files to a public-facing private bucket and return their bucket
 * relative paths, in the order the files were given.
 *
 * One ticket request covers the whole batch (so one rate-limit hit and one
 * intent-token check per submit), then each file is PUT with its own signed
 * token. Throws a human-readable Error on the first failure: callers surface it
 * through errorMessage() and let the visitor retry.
 */
export async function uploadPublicFiles(
  bucket: PublicUploadBucket,
  files: File[],
): Promise<string[]> {
  if (files.length === 0) return []

  const { uploads } = await apiSend<TicketResponse>(
    '/api/uploads/signed-url',
    'POST',
    {
      bucket,
      files: files.map((file) => ({ name: file.name, size: file.size, type: file.type || '' })),
    },
    { headers: await antiBotHeaders() },
  )

  if (!Array.isArray(uploads) || uploads.length !== files.length) {
    throw new Error('We could not prepare your upload. Please try again.')
  }

  const paths: string[] = []
  for (const [index, file] of files.entries()) {
    const ticket = uploads[index]!
    const { error } = await storageClient()
      .storage.from(bucket)
      .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType })

    if (error) {
      console.error(`[uploads] ${bucket} upload failed:`, error.message)
      throw new Error(`We could not upload ${file.name}. Please try a different file and submit again.`)
    }
    // Store the bucket-relative path: both buckets are private, and the admin
    // views mint signed URLs from these paths.
    paths.push(ticket.path)
  }

  return paths
}
