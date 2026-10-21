import { z } from 'zod'

export const reviewInput = z.object({
  name: z.string().trim().min(2, 'Please enter the name you want displayed.').max(100),
  quote: z.string().trim().min(20, 'Please write at least 20 characters.').max(4000),
  context: z.string().trim().max(150).default(''),
  consent: z.literal('yes', { error: 'Please confirm permission to publish your review and photo.' }),
})

export const MAX_REVIEW_BODY = 4_300_000
export const MAX_REVIEW_PHOTO = 4_000_000

/** Read a bounded multipart body, including requests that omit Content-Length. */
export async function reviewFormData(request: Request): Promise<FormData> {
  if (Number(request.headers.get('content-length')) > MAX_REVIEW_BODY) throw new Error('REVIEW_TOO_LARGE')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('REVIEW_EMPTY')
  const parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_REVIEW_BODY) { await reader.cancel(); throw new Error('REVIEW_TOO_LARGE') }
      parts.push(value)
    }
  } finally { reader.releaseLock() }
  return new Response(Buffer.concat(parts), { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData()
}
