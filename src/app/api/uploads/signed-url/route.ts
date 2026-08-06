// dotwin-allow:public-write: mints scoped signed upload URLs for the public commission/class forms (origin + intent token + rate limited + shape/size/MIME bounded). Authored by DotWin.
import crypto from 'node:crypto'
import { requireAntiBotToken } from '@/lib/api/anti-bot'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { apiError, apiFail, apiOk, parseBody } from '@/lib/api/respond'
import {
  PUBLIC_UPLOAD_BUCKETS,
  pendingUploadPathSchema,
  uploadTicketInputSchema,
} from '@/lib/api/public-input'
import { createServiceClient } from '@/lib/supabase/server'

// Extension to content type. A declared type must agree with the extension, so
// "invoice.exe" cannot be waved through as image/jpeg, and an empty declared
// type (some browsers report none for HEIC/HEIF) resolves from the extension.
const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
}

/** Bucket-relative object name that satisfies pendingUploadPathSchema's filename segment. */
function safeObjectName(rawName: string, index: number): string {
  const cleaned = rawName
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 200)
  const usable = /[A-Za-z0-9]/.test(cleaned) ? cleaned : 'reference'
  // The index prefix guarantees uniqueness inside the folder even when two
  // different original names sanitize to the same string.
  return `${index + 1}-${usable}`
}

function extensionOf(name: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name)
  return match ? match[1]!.toLowerCase() : ''
}

/**
 * POST /api/uploads/signed-url: mint short-lived signed upload URLs for the
 * anonymous commission-reference and class pet-photo forms; public.
 *
 * Anonymous visitors used to write straight into these private buckets with the
 * browser anon key, under a storage policy whose only condition was the bucket
 * id. Nothing bounded the number of objects, the path, or who was writing: the
 * app's rate limits and validation sat on a different door entirely. Migration
 * 2026080606_storage_upload_lockdown.sql removes that policy, and this endpoint
 * becomes the only anonymous way in.
 *
 * Every constraint is applied here, before a URL exists:
 *   * the shared Postgres rate limiter, per IP;
 *   * a valid anti-bot intent token (so the caller loaded a page on this site);
 *   * per-bucket file count, per-file byte, and MIME ceilings that mirror the
 *     live bucket configuration, plus an extension/MIME agreement check;
 *   * a server-generated `pending/<timestamp>-<nonce>/` folder, so the caller
 *     never chooses its own storage path, re-validated against the shared
 *     pendingUploadPathSchema that the commission submit route also enforces.
 *
 * The signed URLs are minted with the service-role client: minting requires
 * storage INSERT rights that no browser-reachable role now has, and there is no
 * user session on a public form. The tokens are single-path, non-upsert, and
 * expire in two hours; uploading with one needs no storage policy, so the
 * bucket stays closed to every other anonymous write.
 *
 * Byte-level content inspection is not possible here by design: the bytes go
 * from the browser to Supabase Storage, never through this route (a 15 MB
 * proxy upload would exceed the platform request budget). Storage independently
 * enforces the bucket's file_size_limit and allowed_mime_types on the actual
 * PUT, so a caller cannot use an approved ticket to store a type or size this
 * route did not approve.
 */
export async function POST(request: Request) {
  const rl = await rateLimit(request, { limit: 10, windowMs: 60_000, keyPrefix: 'upload-signed-url' })
  if (!rl.ok) return rateLimitResponse(rl)

  const botCheck = requireAntiBotToken(request)
  if (botCheck) return botCheck

  const parsed = await parseBody(request, uploadTicketInputSchema)
  if (!parsed.ok) return parsed.response
  const { bucket, files } = parsed.data

  const policy = PUBLIC_UPLOAD_BUCKETS[bucket]
  if (files.length > policy.maxFiles) {
    return apiError(`You can attach up to ${policy.maxFiles} files.`, 400, 'VALIDATION_FAILED')
  }

  const folder = `pending/${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  const allowedTypes: readonly string[] = policy.mimeTypes
  const requests: Array<{ path: string; contentType: string }> = []

  for (const [index, file] of files.entries()) {
    if (file.size > policy.maxBytesPerFile) {
      return apiError(
        `${file.name} is larger than the ${Math.round(policy.maxBytesPerFile / (1024 * 1024))} MB limit.`,
        400,
        'FILE_TOO_LARGE',
      )
    }

    const extensionType = EXTENSION_TYPES[extensionOf(file.name)]
    const declaredType = file.type.toLowerCase()
    const contentType = declaredType || extensionType || ''

    if (!contentType || !allowedTypes.includes(contentType)) {
      return apiError(`${file.name} is not a supported file type.`, 400, 'UNSUPPORTED_FILE')
    }
    if (!extensionType || extensionType !== contentType) {
      return apiError(`${file.name} does not match its file type.`, 400, 'UNSUPPORTED_FILE')
    }

    const path = `${folder}/${safeObjectName(file.name, index)}`
    const shape = pendingUploadPathSchema.safeParse(path)
    if (!shape.success) {
      return apiError(`${file.name} has an unusable file name.`, 400, 'UNSUPPORTED_FILE')
    }
    requests.push({ path, contentType })
  }

  const supabase = await createServiceClient()
  const uploads: Array<{ path: string; token: string; signedUrl: string; contentType: string }> = []

  for (const item of requests) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(item.path)
    if (error || !data) {
      return apiFail(error ?? new Error('No signed upload URL returned'), {
        code: 'UPLOAD_FAILED',
        publicMessage: 'We could not prepare your upload. Please try again.',
        context: 'uploads/signed-url createSignedUploadUrl',
      })
    }
    uploads.push({
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
      contentType: item.contentType,
    })
  }

  return apiOk({ folder, uploads })
}
